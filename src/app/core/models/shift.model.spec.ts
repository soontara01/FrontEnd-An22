import { PAYMENT_METHOD_DEFAULTS, PaymentMethod, PaymentType } from './payment-method.model';
import { SalePayment } from './sale.model';
import {
  ShiftClosePayload,
  ShiftContext,
  ShiftCountInput,
  approvalStatusFor,
  buildShiftCounts,
  cashMovementError,
  closeChecklist,
  closeShiftError,
  countCheck,
  countInputsError,
  denominationTotal,
  drawerExpected,
  expectedByMethod,
  needsApproval,
  openShiftError,
  requireShiftChangeError,
  shiftBlocker,
  shiftDay,
  shiftOpenTooLong,
  shiftSummary,
  varianceReport,
} from './shift.model';

const method = (id: number, name: string, type: PaymentType, extra: Partial<PaymentMethod> = {}) =>
  ({
    ...PAYMENT_METHOD_DEFAULTS,
    id,
    code: `M${id}`,
    name,
    type,
    sortOrder: id,
    ...extra,
  }) satisfies PaymentMethod;

const methods: PaymentMethod[] = [
  method(1, 'เงินสด', 'cash'),
  method(2, 'บัตร', 'card'),
  method(3, 'QR', 'qr'),
  method(4, 'โอน', 'transfer'),
];

const pay = (m: PaymentMethod, amount: number): SalePayment => ({
  methodId: m.id,
  name: m.name,
  type: m.type,
  amount,
  tendered: amount,
  reference: '',
  installmentMonths: null,
});

const [cash, card, qr] = methods;

const sale = (payments: SalePayment[], over: { shiftId?: number; voidShiftId?: number } = {}) => ({
  shiftId: 1,
  voidShiftId: null,
  payments,
  total: payments.reduce((sum, p) => sum + p.amount, 0),
  itemDiscount: 0,
  billDiscount: 0,
  manualDiscount: 0,
  ...over,
});

/** docs/shift-plan.md section 3: float 2,000 · cash 5,350 · card 12,900 · QR 3,500 · CN 450 · out 200 */
const shift = { id: 1, openingFloat: 2000, status: 'open' as const, cashier: 'somchai' };
const ctx: ShiftContext = {
  sales: [
    sale([pay(cash, 5350)]),
    { ...sale([pay(card, 12900)]), itemDiscount: 100 },
    sale([pay(qr, 3500)]),
  ],
  creditNotes: [{ shiftId: 1, refunds: [pay(cash, 450)], total: 450 }],
  movements: [{ shiftId: 1, type: 'out', amount: 200 }],
  methods,
  exchanges: [{ shiftId: 1 }, { shiftId: 2 }],
};
const expected = expectedByMethod(shift, ctx);

const input = (methodId: number, over: Partial<ShiftCountInput> = {}): ShiftCountInput => ({
  methodId,
  counted: null,
  firstCount: null,
  confirmed: false,
  reasonCode: null,
  reason: '',
  ...over,
});

const close = (over: Partial<ShiftClosePayload> = {}, counts: ShiftCountInput[] = []) => {
  const base = [
    input(1, { counted: 6700 }),
    input(2, { counted: 12900 }),
    input(3, { counted: 3500 }),
    input(4, { confirmed: true }),
  ];
  return {
    counts: base.map((c) => counts.find((x) => x.methodId === c.methodId) ?? c),
    cashDenominations: [],
    depositAmount: 0,
    note: '',
    approval: null,
    ...over,
  };
};

const owner = { user: 'somchai', isAdmin: false };

describe('shift model', () => {
  it('computes the expected amount per method (plan example)', () => {
    expect(expected.map((l) => [l.name, l.expected, l.closeCheck])).toEqual([
      ['เงินสด', 6700, 'count'],
      ['บัตร', 12900, 'count'],
      ['QR', 3500, 'count'],
      ['โอน', 0, 'confirm'],
    ]);
    expect(expected[0]).toMatchObject({
      opening: 2000,
      sales: 5350,
      refunds: 450,
      cashIn: 0,
      cashOut: 200,
    });
    expect(drawerExpected(expected)).toBe(6700);
  });

  it('counts a void in the shift where it is made', () => {
    const sold = sale([pay(cash, 1000)], { shiftId: 1, voidShiftId: 2 });
    const c = { ...ctx, sales: [sold], creditNotes: [], movements: [] };
    expect(drawerExpected(expectedByMethod({ id: 1, openingFloat: 0 }, c))).toBe(1000);
    expect(drawerExpected(expectedByMethod({ id: 2, openingFloat: 0 }, c))).toBe(-1000);
    const same = { ...c, sales: [{ ...sold, voidShiftId: 1 }] };
    expect(drawerExpected(expectedByMethod({ id: 1, openingFloat: 0 }, same))).toBe(0);
  });

  it('puts every cash method in one drawer and keeps inactive methods that moved money', () => {
    const spare = method(5, 'เงินสดสำรอง', 'cash');
    const cheque = method(6, 'เช็ค', 'other', { active: false });
    const c: ShiftContext = {
      sales: [sale([pay(cash, 100), pay(spare, 50)]), sale([pay(cheque, 500)])],
      creditNotes: [],
      movements: [{ shiftId: 1, type: 'in', amount: 20 }],
      methods: [...methods, spare, cheque],
    };
    const lines = expectedByMethod({ id: 1, openingFloat: 1000 }, c);
    expect(lines.filter((l) => l.type === 'cash')).toHaveLength(1);
    expect(lines[0]).toMatchObject({ methodId: 1, sales: 150, cashIn: 20, expected: 1170 });
    expect(lines.find((l) => l.methodId === 6)).toMatchObject({
      expected: 500,
      closeCheck: 'confirm',
    });
  });

  it('ignores money of other shifts and bills without a shift', () => {
    const c = {
      ...ctx,
      sales: [sale([pay(cash, 999)], { shiftId: 2 }), { ...sale([pay(cash, 77)]), shiftId: null }],
    };
    expect(drawerExpected(expectedByMethod(shift, c))).toBe(2000 - 450 - 200);
  });

  it('accepts a matching blind count and asks for a reason on a variance', () => {
    expect(closeShiftError(shift, close(), expected, owner)).toBeNull();
    const short = input(1, { counted: 6680 });
    expect(closeShiftError(shift, close({}, [short]), expected, owner)).toBe(
      'เงินสด ขาด 20 บาท — กรุณาระบุสาเหตุ',
    );
    expect(
      closeShiftError(
        shift,
        close({}, [{ ...short, reasonCode: 'wrong_change' }]),
        expected,
        owner,
      ),
    ).toBeNull();
    expect(
      closeShiftError(shift, close({}, [{ ...short, reasonCode: 'other' }]), expected, owner),
    ).toBe('กรุณาอธิบายสาเหตุส่วนต่างของ เงินสด');
  });

  it('checks every line by its close check', () => {
    expect(closeShiftError(shift, close({}, [input(2)]), expected, owner)).toBe(
      'กรุณากรอกยอดที่นับได้ของ บัตร',
    );
    expect(closeShiftError(shift, close({}, [input(4)]), expected, owner)).toBe(
      'กรุณาตรวจยอด โอน แล้วติ๊ก "ตรวจแล้ว"',
    );
    expect(
      closeShiftError(shift, close({}, [input(1, { counted: 6700.005 })]), expected, owner),
    ).toBe('กรุณากรอกยอดที่นับได้ของ เงินสด');
    const noCheck = expectedByMethod(shift, {
      ...ctx,
      methods: methods.map((m) => (m.id === 4 ? { ...m, closeCheck: 'none' as const } : m)),
    });
    expect(closeShiftError(shift, close({}, [input(4)]), noCheck, owner)).toBeNull();
  });

  it('checks the banknote count and the deposit', () => {
    const notes = [
      { value: 1000, qty: 6 },
      { value: 500, qty: 1 },
      { value: 100, qty: 2 },
    ];
    expect(closeShiftError(shift, close({ cashDenominations: notes }), expected, owner)).toBeNull();
    expect(
      closeShiftError(shift, close({ cashDenominations: notes.slice(0, 2) }), expected, owner),
    ).toBe('ยอดรวมแบงก์/เหรียญไม่ตรงกับยอดเงินสดที่นับ');
    expect(
      closeShiftError(shift, close({ cashDenominations: [{ value: 3, qty: 1 }] }), expected, owner),
    ).toBe('จำนวนแบงก์/เหรียญไม่ถูกต้อง');
    expect(closeShiftError(shift, close({ depositAmount: 4700 }), expected, owner)).toBeNull();
    expect(closeShiftError(shift, close({ depositAmount: 6701 }), expected, owner)).toBe(
      'เงินนำส่งต้องอยู่ระหว่าง 0 ถึงยอดเงินสดที่นับได้',
    );
  });

  it('lets only the cashier or an admin close an open shift', () => {
    expect(closeShiftError({ ...shift, status: 'closed' }, close(), expected, owner)).toBe(
      'กะนี้ปิดไปแล้ว',
    );
    expect(closeShiftError(shift, close(), expected, { user: 'suda', isAdmin: false })).toBe(
      'ปิดกะได้เฉพาะเจ้าของกะหรือผู้ดูแลระบบ',
    );
    expect(closeShiftError(shift, close(), expected, { user: 'admin', isAdmin: true })).toBeNull();
  });

  it('needs approval when any single method is off by more than the limit', () => {
    const offset = [
      { counted: 6620, expected: 6700 },
      { counted: 12980, expected: 12900 },
    ];
    expect(needsApproval(offset, 100)).toBe(false);
    expect(approvalStatusFor(offset, 100, null)).toBe('not_needed');
    const short = [{ counted: 6550, expected: 6700 }];
    expect(needsApproval(short, 100)).toBe(true);
    expect(approvalStatusFor(short, 100, null)).toBe('pending');
    expect(approvalStatusFor(short, 100, 'admin')).toBe('approved');
    expect(needsApproval([{ counted: null, expected: 9999 }], 100)).toBe(false);
  });

  it('builds the stored counts', () => {
    const counts = buildShiftCounts(
      expected,
      close({}, [
        input(1, { counted: 6680, firstCount: 6600, reasonCode: 'unknown', reason: ' ? ' }),
        input(2, { counted: 12900, reasonCode: 'other', reason: 'ignored' }),
      ]).counts,
      'somchai',
    );
    expect(counts[0]).toMatchObject({
      expected: 6700,
      counted: 6680,
      firstCount: 6600,
      reasonCode: 'unknown',
      reason: '?',
    });
    expect(counts[1]).toMatchObject({ counted: 12900, reasonCode: null, reason: '' });
    expect(counts[3]).toMatchObject({
      counted: null,
      closeCheck: 'confirm',
      confirmedBy: 'somchai',
    });
  });

  it('validates cash movements against the drawer', () => {
    const out = { type: 'out' as const, amount: 200, reason: 'ค่าส่งของ' };
    expect(cashMovementError(out, 6700)).toBeNull();
    expect(cashMovementError({ ...out, amount: 7000 }, 6700)).toBe(
      'เงินสดในลิ้นชักไม่พอ (คาดว่ามี 6,700 บาท)',
    );
    expect(cashMovementError({ ...out, type: 'in', amount: 7000 }, 6700)).toBeNull();
    expect(cashMovementError({ ...out, amount: 0 }, 6700)).toBe(
      'จำนวนเงินต้องมากกว่า 0 (ทศนิยมไม่เกิน 2 ตำแหน่ง)',
    );
    expect(cashMovementError({ ...out, reason: ' ' }, 6700)).toBe('กรุณาระบุเหตุผล');
  });

  it('validates opening a shift', () => {
    const p = { terminalId: 1, openingFloat: 2000, openingDenominations: [] };
    const free = { terminalHasOpenShift: false, userHasOpenShift: false };
    expect(openShiftError(p, free)).toBeNull();
    expect(openShiftError({ ...p, terminalId: 0 }, free)).toBe('ไม่ได้ระบุเครื่อง POS');
    expect(openShiftError({ ...p, openingFloat: -1 }, free)).toBe(
      'เงินทอนตั้งต้นต้องเป็นจำนวนเงินที่ไม่ติดลบ',
    );
    expect(openShiftError({ ...p, openingDenominations: [{ value: 1000, qty: 1 }] }, free)).toBe(
      'ยอดรวมแบงก์/เหรียญไม่ตรงกับเงินทอนตั้งต้น',
    );
    expect(
      openShiftError({ ...p, openingDenominations: [{ value: 1000, qty: 2 }] }, free),
    ).toBeNull();
    expect(openShiftError(p, { ...free, terminalHasOpenShift: true })).toBe(
      'เครื่องนี้มีกะที่เปิดอยู่แล้ว',
    );
    expect(openShiftError(p, { ...free, userHasOpenShift: true })).toBe(
      'คุณมีกะที่เปิดอยู่ที่เครื่องอื่น — ปิดกะนั้นก่อน',
    );
    expect(
      denominationTotal([
        { value: 1000, qty: 2 },
        { value: 0.25, qty: 3 },
      ]),
    ).toBe(2000.75);
  });

  it('blocks money actions without the right shift (S1 / S6)', () => {
    const base = { requireShift: true, shift, user: 'somchai', isAdmin: false };
    expect(shiftBlocker('sell', { ...base, requireShift: false, shift: null })).toBeNull();
    expect(shiftBlocker('sell', { ...base, shift: null })).toBe('ยังไม่ได้เปิดกะที่เครื่องนี้');
    expect(shiftBlocker('sell', { ...base, shift: { ...shift, status: 'closed' } })).toBe(
      'ยังไม่ได้เปิดกะที่เครื่องนี้',
    );
    expect(shiftBlocker('sell', base)).toBeNull();
    const admin = { ...base, user: 'admin', isAdmin: true };
    expect(shiftBlocker('sell', admin)).toBe('กะนี้เป็นของ somchai — ต้องปิดกะนั้นก่อนจึงจะขายได้');
    expect(shiftBlocker('void', admin)).toBeNull();
    expect(shiftBlocker('refund', admin)).toBeNull();
    const staff = { ...base, user: 'suda' };
    expect(shiftBlocker('void', staff)).toBe(
      'กะนี้เป็นของ somchai — ทำรายการนี้ได้เฉพาะเจ้าของกะหรือผู้ดูแลระบบ',
    );
    expect(shiftBlocker('cash_movement', staff)).not.toBeNull();
  });

  it('turns shifts off only when none is open', () => {
    expect(requireShiftChangeError(true, false, 2)).toBe(
      'ยังมีกะที่เปิดอยู่ 2 กะ — ปิดกะทั้งหมดก่อนปิดการใช้ระบบกะ',
    );
    expect(requireShiftChangeError(true, false, 0)).toBeNull();
    expect(requireShiftChangeError(false, true, 3)).toBeNull();
  });

  it('dates a shift by its opening day and flags one left open', () => {
    const openedAt = new Date(2026, 9, 10, 23, 30).toISOString();
    expect(shiftDay({ openedAt })).toBe('2026-10-10');
    const open = { status: 'open' as const, openedAt };
    const later = (hours: number) => new Date(new Date(openedAt).getTime() + hours * 3_600_000);
    expect(shiftOpenTooLong(open, later(13), 12)).toBe(true);
    expect(shiftOpenTooLong(open, later(11), 12)).toBe(false);
    expect(shiftOpenTooLong({ ...open, status: 'closed' }, later(13), 12)).toBe(false);
  });

  it('summarizes a shift and hides the per-method lines unless detailed (S2)', () => {
    const x = shiftSummary(shift, ctx, { detailed: false });
    expect(x).toMatchObject({
      billCount: 3,
      salesTotal: 21750,
      discountTotal: 100,
      voidCount: 0,
      refundCount: 1,
      refundTotal: 450,
      exchangeCount: 1,
      cashIn: 0,
      cashOut: 200,
      netSales: 21300,
    });
    expect(x.lines).toBeUndefined();
    expect(x.checklist).toEqual(closeChecklist(expected));
    expect(shiftSummary(shift, ctx, { detailed: true }).lines).toEqual(expected);
  });

  it('lists what to check at close without any amount (blind count)', () => {
    const list = closeChecklist(expected);
    expect(list.map((l) => [l.name, l.closeCheck])).toEqual([
      ['เงินสด', 'count'],
      ['บัตร', 'count'],
      ['QR', 'count'],
      ['โอน', 'confirm'],
    ]);
    expect(Object.keys(list[0]).sort()).toEqual(['closeCheck', 'methodId', 'name', 'type']);
  });

  it('reveals variances only from a complete count', () => {
    const counts = close({}, [input(1, { counted: 6680 })]).counts;
    expect(countInputsError(expected, counts)).toBeNull();
    expect(countInputsError(expected, close({}, [input(2)]).counts)).toBe(
      'กรุณากรอกยอดที่นับได้ของ บัตร',
    );
    const check = countCheck(expected, counts, 100);
    expect(check.needsApproval).toBe(false);
    expect(check.lines[0]).toMatchObject({ expected: 6700, counted: 6680, variance: -20 });
    expect(check.lines[3]).toMatchObject({ closeCheck: 'confirm', counted: null, variance: 0 });
    const short = close({}, [input(1, { counted: 6550 })]).counts;
    expect(countCheck(expected, short, 100).needsApproval).toBe(true);
  });

  it('reports variances per cashier over closed shifts', () => {
    const closed = (cashier: string, diffs: number[], approvalStatus = 'not_needed' as const) => ({
      cashier,
      status: 'closed' as const,
      approvalStatus,
      counts: diffs.map((d) => ({ counted: 1000 + d, expected: 1000 })),
    });
    const rows = varianceReport([
      closed('somchai', [-50, 0]),
      closed('somchai', [-50, 30]),
      closed('suda', [-150], 'pending' as never),
      { ...closed('suda', [-999]), status: 'open' as const },
    ]);
    expect(rows).toEqual([
      {
        cashier: 'suda',
        shifts: 1,
        shortCount: 1,
        overCount: 0,
        shortTotal: 150,
        overTotal: 0,
        pending: 1,
      },
      {
        cashier: 'somchai',
        shifts: 2,
        shortCount: 2,
        overCount: 1,
        shortTotal: 100,
        overTotal: 30,
        pending: 0,
      },
    ]);
  });
});
