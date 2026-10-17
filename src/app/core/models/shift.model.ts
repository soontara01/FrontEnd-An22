import { CreditNote } from './credit-note.model';
import { Exchange } from './exchange.model';
import { CloseCheck, PaymentMethod, PaymentType, closeCheckOf } from './payment-method.model';
import { moneyInputError } from './money.model';
import { toIsoDate } from './price.model';
import { withDefaults } from './defaults';
import { Sale } from './sale.model';

/**
 * POS shifts (docs/shift-plan.md, decided 2026-10-11): 1 shift = 1 terminal (cash drawer) + 1
 * cashier. Money moves count in the shift where they happen; closing compares a blind count per
 * payment method with `expectedByMethod()`. The functions here are the single rule for the POS and
 * the server.
 */
export type ShiftStatus = 'open' | 'closed';
export type ShiftApproval = 'not_needed' | 'pending' | 'approved';
export type VarianceReason =
  'wrong_change' | 'wrong_received' | 'wrong_method' | 'unknown' | 'other';
export type CashMovementType = 'in' | 'out';
/** Actions at the drawer that need an open shift when `StoreInfo.requireShift` is on. */
export type ShiftAction = 'sell' | 'void' | 'refund' | 'cash_movement' | 'drawer_open';
/** Why a closed shift's count was adjusted afterwards (S8). */
export type AdjustmentReason = 'count_error' | 'found_cash' | 'late_settlement' | 'other';

export const ADJUSTMENT_REASON_LABEL: Record<AdjustmentReason, string> = {
  count_error: 'นับผิด',
  found_cash: 'พบเงินภายหลัง',
  late_settlement: 'ยอดโอน / บัตรเข้าช้า',
  other: 'อื่น ๆ',
};

/** Quick reasons for opening the drawer without a sale (S7). */
export const DRAWER_OPEN_REASONS: readonly string[] = [
  'แลกเหรียญ / แลกแบงก์',
  'ตรวจนับเงินระหว่างกะ',
  'ใส่ / หยิบเอกสาร',
];

export const SHIFT_STATUS_LABEL: Record<ShiftStatus, string> = {
  open: 'เปิดอยู่',
  closed: 'ปิดแล้ว',
};

export const SHIFT_APPROVAL_LABEL: Record<ShiftApproval, string> = {
  not_needed: 'ไม่ต้องอนุมัติ',
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
};

export const SHIFT_APPROVAL_BADGE: Record<ShiftApproval, string> = {
  not_needed: 'badge-success',
  pending: 'badge-warn',
  approved: 'badge-success',
};

export const VARIANCE_REASON_LABEL: Record<VarianceReason, string> = {
  wrong_change: 'ทอนเงินผิด',
  wrong_received: 'รับเงินผิด',
  wrong_method: 'กดช่องทางชำระผิด',
  unknown: 'ไม่ทราบสาเหตุ',
  other: 'อื่น ๆ',
};

/** Thai banknotes and coins, largest first (counting helper). */
export const THAI_DENOMINATIONS: readonly number[] = [
  1000, 500, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.25,
];

export interface DenominationCount {
  value: number;
  qty: number;
}

export interface ShiftCount {
  methodId: number;
  /** Snapshot of the method name */
  name: string;
  /** System amount at close (snapshot) */
  expected: number;
  /** Final counted amount; null = `confirm` / `none` (no variance) */
  counted: number | null;
  /** Snapshot of the method's check at close */
  closeCheck: CloseCheck;
  /** Who ticked "checked" (`confirm`) */
  confirmedBy: string | null;
  /** First count when the cashier recounted after seeing the variance (S2) */
  firstCount: number | null;
  /** Required when the variance is not 0 (S3) */
  reasonCode: VarianceReason | null;
  reason: string;
}

export interface Shift {
  id: number;
  /** 'SH-<branch>-<open day YYYYMMDD>-NN' (E21; older without branch), issued by the server */
  shiftNo: string;
  terminalId: number;
  /** Branch of the terminal when the shift was opened (server-set, E24; older data = by terminal) */
  branchId?: number | null;
  /** The terminal's Revenue Dept POS ID when the shift was opened (server-set snapshot) */
  posId?: string;
  /** Who opened it = who is responsible for the drawer */
  cashier: string;
  status: ShiftStatus;
  /** ISO timestamp; the shift belongs to this local day (S5) */
  openedAt: string;
  openingFloat: number;
  openingDenominations: DenominationCount[];
  closedAt: string | null;
  /** Who closed it: the cashier, or an admin closing on their behalf (S1) */
  closedBy: string | null;
  counts: ShiftCount[];
  cashDenominations: DenominationCount[];
  /** Cash taken out of the drawer at close (safe / bank) */
  depositAmount: number;
  /** Cash left in the drawer = the next shift's default opening float */
  floatLeft: number;
  approvalStatus: ShiftApproval;
  approvedBy: string | null;
  approvedAt: string | null;
  note: string;
  /** Read-only, server-derived: Σ adjustments made after closing (S8; missing = none) */
  adjustmentTotal?: number;
}

/** Defaults for shift fields an older record or an API that drops `null` may leave out (B24). */
export const SHIFT_DEFAULTS: Omit<
  Shift,
  'id' | 'shiftNo' | 'terminalId' | 'posId' | 'cashier' | 'openedAt' | 'adjustmentTotal'
> = {
  status: 'open',
  openingFloat: 0,
  openingDenominations: [],
  closedAt: null,
  closedBy: null,
  counts: [],
  cashDenominations: [],
  depositAmount: 0,
  floatLeft: 0,
  approvalStatus: 'not_needed',
  approvedBy: null,
  approvedAt: null,
  note: '',
};

/** Defaults per count line; `counted: null` keeps its meaning (`confirm` / `none`, no variance). */
export const SHIFT_COUNT_DEFAULTS: Omit<ShiftCount, 'methodId' | 'name' | 'expected'> = {
  counted: null,
  closeCheck: 'count',
  confirmedBy: null,
  firstCount: null,
  reasonCode: null,
  reason: '',
};

type StoredShift = Pick<Shift, 'id' | 'shiftNo' | 'terminalId' | 'cashier' | 'openedAt'> &
  Partial<Shift>;

/**
 * A shift as read from the server or the mock db with every field that may be missing filled in
 * (like `normalizeSale()`). Call it wherever a `Shift` comes in.
 */
export function normalizeShift(s: StoredShift): Shift {
  const counts = (s.counts ?? []).map((c) => withDefaults(SHIFT_COUNT_DEFAULTS, c));
  return { ...withDefaults(SHIFT_DEFAULTS, s), counts } as Shift;
}

/** The drawer opened without a sale (S7) — no money, logged for control. */
export interface DrawerOpen {
  id: number;
  shiftId: number;
  reason: string;
  by: string;
  /** ISO timestamp */
  at: string;
}

export interface DrawerOpenPayload {
  reason: string;
}

/**
 * Correction of a closed shift's count, recorded separately (S8): the counts and the original Z
 * report never change. `amount` + = more than counted (e.g. cash found), − = less.
 */
export interface ShiftAdjustment {
  id: number;
  shiftId: number;
  methodId: number;
  /** Snapshot of the method name */
  name: string;
  amount: number;
  reasonCode: AdjustmentReason;
  reason: string;
  by: string;
  /** ISO timestamp */
  at: string;
}

export interface ShiftAdjustmentPayload {
  methodId: number;
  amount: number;
  reasonCode: AdjustmentReason;
  reason: string;
}

/** Cash put into / taken out of the drawer during a shift (not a sale). */
export interface CashMovement {
  id: number;
  shiftId: number;
  type: CashMovementType;
  amount: number;
  reason: string;
  by: string;
  /** ISO timestamp */
  at: string;
}

export interface ShiftOpenPayload {
  terminalId: number;
  openingFloat: number;
  /** Optional count per banknote / coin; when given it must add up to `openingFloat` */
  openingDenominations: DenominationCount[];
}

export interface CashMovementPayload {
  type: CashMovementType;
  amount: number;
  reason: string;
}

export interface ShiftCountInput {
  methodId: number;
  /** Final count (`count` methods) */
  counted: number | null;
  /** First count, when recounted (S2) */
  firstCount: number | null;
  /** Ticked "checked" (`confirm` methods) */
  confirmed: boolean;
  reasonCode: VarianceReason | null;
  reason: string;
}

export interface ShiftClosePayload {
  counts: ShiftCountInput[];
  cashDenominations: DenominationCount[];
  depositAmount: number;
  note: string;
  /** An admin's login typed at the terminal to approve the variance; the server checks it */
  approval: ApprovalCredentials | null;
}

export interface ApprovalCredentials {
  username: string;
  password: string;
}

/** What to check per method at close — no amounts, so the count stays blind (S2). */
export type CloseChecklistItem = Pick<ExpectedLine, 'methodId' | 'name' | 'type' | 'closeCheck'>;

/** One line revealed after a blind count (`countCheck()`). */
export interface CountCheckLine {
  methodId: number;
  name: string;
  type: PaymentType;
  closeCheck: CloseCheck;
  expected: number;
  /** null = not counted (`confirm` / `none`) */
  counted: number | null;
  variance: number;
}

export interface CountCheckResult {
  lines: CountCheckLine[];
  /** Some method is off by more than `StoreInfo.shiftVarianceLimit` (S3) */
  needsApproval: boolean;
}

/** System amount of one payment method in a shift. Cash methods share one drawer line. */
export interface ExpectedLine {
  methodId: number;
  name: string;
  type: PaymentType;
  closeCheck: CloseCheck;
  /** Opening float (drawer line only) */
  opening: number;
  /** Paid in by sales made in this shift */
  sales: number;
  /** Paid out by voids and credit notes made in this shift */
  refunds: number;
  /** Cash movements (drawer line only) */
  cashIn: number;
  cashOut: number;
  expected: number;
}

type ShiftSale = Pick<
  Sale,
  | 'shiftId'
  | 'voidShiftId'
  | 'payments'
  | 'total'
  | 'itemDiscount'
  | 'billDiscount'
  | 'manualDiscount'
>;

/** Everything that moved money (or goods) in or around a shift. */
export interface ShiftContext {
  sales: readonly ShiftSale[];
  creditNotes: readonly Pick<CreditNote, 'shiftId' | 'refunds' | 'total'>[];
  movements: readonly Pick<CashMovement, 'shiftId' | 'type' | 'amount'>[];
  methods: readonly PaymentMethod[];
  exchanges?: readonly Pick<Exchange, 'shiftId'>[];
  drawerOpens?: readonly Pick<DrawerOpen, 'shiftId'>[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const baht = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
/** A non-negative amount with at most 2 decimals. */
const isMoney = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && round2(n) === n;
/** An amount with at most 2 decimals that may be negative (net of refunds, S9). */
const isSignedMoney = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && round2(n) === n;

export const denominationTotal = (counts: readonly DenominationCount[]): number =>
  round2(counts.reduce((sum, c) => sum + c.value * c.qty, 0));

const denominationsValid = (counts: readonly DenominationCount[]): boolean =>
  counts.every(
    (c) => THAI_DENOMINATIONS.includes(c.value) && Number.isInteger(c.qty) && c.qty >= 0,
  );

/** Local day the shift belongs to: its opening day, even when it runs past midnight (S5). */
export const shiftDay = (shift: Pick<Shift, 'openedAt'>): string =>
  toIsoDate(new Date(shift.openedAt));

/** The cash method the drawer line is shown under: the first active cash method. */
function drawerMethod(methods: readonly PaymentMethod[]): PaymentMethod | undefined {
  const cash = methods
    .filter((m) => m.type === 'cash')
    .sort((a, b) => Number(b.active) - Number(a.active) || a.sortOrder - b.sortOrder);
  return cash[0];
}

/**
 * System amount per payment method: payments of sales made in the shift, minus payments of bills
 * voided in it and refunds of credit notes issued in it. Every cash payment goes into one drawer
 * line, which also holds the opening float and cash movements. Lists all active methods, plus
 * inactive ones that moved money in the shift.
 */
export function expectedByMethod(
  shift: Pick<Shift, 'id' | 'openingFloat'>,
  ctx: ShiftContext,
): ExpectedLine[] {
  const drawer = drawerMethod(ctx.methods);
  const drawerKey = drawer?.id ?? 0;
  const lines = new Map<number, ExpectedLine>();

  const lineFor = (methodId: number, name: string, type: PaymentType): ExpectedLine => {
    const key = type === 'cash' ? drawerKey : methodId;
    let line = lines.get(key);
    if (!line) {
      const method = ctx.methods.find((m) => m.id === key);
      const lineType = method?.type ?? type;
      line = {
        methodId: key,
        name: method?.name ?? (type === 'cash' ? 'เงินสด' : name),
        type: lineType,
        closeCheck: closeCheckOf({ type: lineType, closeCheck: method?.closeCheck }),
        opening: 0,
        sales: 0,
        refunds: 0,
        cashIn: 0,
        cashOut: 0,
        expected: 0,
      };
      lines.set(key, line);
    }
    return line;
  };

  lineFor(drawerKey, 'เงินสด', 'cash').opening = shift.openingFloat;
  for (const m of ctx.methods) if (m.active) lineFor(m.id, m.name, m.type);

  for (const sale of ctx.sales) {
    for (const p of sale.payments) {
      if (sale.shiftId === shift.id) lineFor(p.methodId, p.name, p.type).sales += p.amount;
      if (sale.voidShiftId === shift.id) lineFor(p.methodId, p.name, p.type).refunds += p.amount;
    }
  }
  for (const note of ctx.creditNotes) {
    if (note.shiftId !== shift.id) continue;
    for (const p of note.refunds) lineFor(p.methodId, p.name, p.type).refunds += p.amount;
  }
  const cash = lineFor(drawerKey, 'เงินสด', 'cash');
  for (const m of ctx.movements) {
    if (m.shiftId !== shift.id) continue;
    if (m.type === 'in') cash.cashIn += m.amount;
    else cash.cashOut += m.amount;
  }

  const order = (l: ExpectedLine) =>
    l.methodId === drawerKey
      ? -Infinity
      : (ctx.methods.find((m) => m.id === l.methodId)?.sortOrder ?? Infinity);
  return [...lines.values()]
    .map((l) => ({
      ...l,
      sales: round2(l.sales),
      refunds: round2(l.refunds),
      cashIn: round2(l.cashIn),
      cashOut: round2(l.cashOut),
      expected: round2(l.opening + l.sales - l.refunds + l.cashIn - l.cashOut),
    }))
    .sort((a, b) => order(a) - order(b));
}

/** Cash the drawer should hold now. */
export const drawerExpected = (lines: readonly ExpectedLine[]): number =>
  lines.find((l) => l.type === 'cash')?.expected ?? 0;

/** Counted − expected (+ over / − short); 0 for methods that are not counted. */
export const variance = (c: Pick<ShiftCount, 'counted' | 'expected'>): number =>
  c.counted === null ? 0 : round2(c.counted - c.expected);

/** Approval is needed when any single method is off by more than the limit (not the total). */
export const needsApproval = (
  counts: readonly Pick<ShiftCount, 'counted' | 'expected'>[],
  limit: number,
): boolean => counts.some((c) => Math.abs(variance(c)) > limit);

export const approvalStatusFor = (
  counts: readonly Pick<ShiftCount, 'counted' | 'expected'>[],
  limit: number,
  approvedBy: string | null,
): ShiftApproval =>
  !needsApproval(counts, limit) ? 'not_needed' : approvedBy ? 'approved' : 'pending';

/** Stored counts of a close: inputs matched to the expected lines (after `closeShiftError()`). */
export function buildShiftCounts(
  expected: readonly ExpectedLine[],
  inputs: readonly ShiftCountInput[],
  user: string,
): ShiftCount[] {
  return expected.map((line) => {
    const input = inputs.find((i) => i.methodId === line.methodId);
    const counted = line.closeCheck === 'count' ? (input?.counted ?? null) : null;
    const off = counted !== null && round2(counted - line.expected) !== 0;
    return {
      methodId: line.methodId,
      name: line.name,
      expected: line.expected,
      counted,
      closeCheck: line.closeCheck,
      confirmedBy: line.closeCheck === 'confirm' && input?.confirmed ? user : null,
      firstCount: counted !== null ? (input?.firstCount ?? null) : null,
      reasonCode: off ? (input?.reasonCode ?? null) : null,
      reason: off ? (input?.reason ?? '').trim() : '',
    };
  });
}

/** Rule for opening a shift (POS + server). Thai message or null. */
export function openShiftError(
  p: ShiftOpenPayload,
  ctx: { terminalHasOpenShift: boolean; userHasOpenShift: boolean },
): string | null {
  if (!Number.isInteger(p.terminalId) || p.terminalId <= 0) return 'ไม่ได้ระบุเครื่อง POS';
  const floatProblem = moneyInputError(p.openingFloat, 'เงินทอนตั้งต้น');
  if (floatProblem) return floatProblem;
  if (!denominationsValid(p.openingDenominations)) return 'จำนวนแบงก์/เหรียญไม่ถูกต้อง';
  if (
    p.openingDenominations.length &&
    denominationTotal(p.openingDenominations) !== p.openingFloat
  ) {
    return 'ยอดรวมแบงก์/เหรียญไม่ตรงกับเงินทอนตั้งต้น';
  }
  if (ctx.terminalHasOpenShift) return 'เครื่องนี้มีกะที่เปิดอยู่แล้ว';
  if (ctx.userHasOpenShift) return 'คุณมีกะที่เปิดอยู่ที่เครื่องอื่น — ปิดกะนั้นก่อน';
  return null;
}

/**
 * Whether `user` may do a money action now (S1 / S6). Shifts off → always allowed. Selling needs
 * the user's own open shift; voids, refunds and cash movements in someone else's shift are for
 * admins only (recorded under the admin's name).
 */
export function shiftBlocker(
  action: ShiftAction,
  ctx: {
    requireShift: boolean;
    shift: Pick<Shift, 'status' | 'cashier'> | null;
    user: string;
    isAdmin: boolean;
  },
): string | null {
  if (!ctx.requireShift) return null;
  const shift = ctx.shift;
  if (!shift || shift.status !== 'open') return 'ยังไม่ได้เปิดกะที่เครื่องนี้';
  if (ctx.user === shift.cashier) return null;
  if (action === 'sell') return `กะนี้เป็นของ ${shift.cashier} — ต้องปิดกะนั้นก่อนจึงจะขายได้`;
  if (!ctx.isAdmin) {
    return `กะนี้เป็นของ ${shift.cashier} — ทำรายการนี้ได้เฉพาะเจ้าของกะหรือผู้ดูแลระบบ`;
  }
  return null;
}

/**
 * Rule for a cash movement (POS + server). `expectedCash` = what the drawer should hold now; only
 * admins see it in the "not enough cash" message, so a cashier cannot probe it before a blind count.
 */
export function cashMovementError(
  p: CashMovementPayload,
  expectedCash: number,
  isAdmin: boolean,
): string | null {
  if (p.type !== 'in' && p.type !== 'out') return 'ประเภทรายการไม่ถูกต้อง';
  if (!isMoney(p.amount) || p.amount === 0)
    return 'จำนวนเงินต้องมากกว่า 0 (ทศนิยมไม่เกิน 2 ตำแหน่ง)';
  const reason = (p.reason ?? '').trim();
  if (!reason) return 'กรุณาระบุเหตุผล';
  if (reason.length > 200) return 'เหตุผลต้องไม่เกิน 200 ตัวอักษร';
  if (p.type === 'out' && p.amount > expectedCash) {
    // Blind count (B19): only admins learn the expected cash from the refusal.
    return isAdmin
      ? `เงินสดในลิ้นชักไม่พอ (คาดว่ามี ${baht(expectedCash)} บาท)`
      : 'เงินสดในลิ้นชักไม่พอ';
  }
  return null;
}

/** Rule for logging a drawer opened without a sale (S7): a reason is required. */
export function drawerOpenError(p: DrawerOpenPayload): string | null {
  const reason = (p.reason ?? '').trim();
  if (!reason) return 'กรุณาระบุเหตุผลที่เปิดลิ้นชัก';
  if (reason.length > 200) return 'เหตุผลต้องไม่เกิน 200 ตัวอักษร';
  return null;
}

/**
 * Rule for adjusting a closed shift (S8): admins only, closed shifts only, a method that was
 * counted in it, a non-zero amount (2 decimals) and a reason (`other` needs a text).
 */
export function shiftAdjustmentError(
  shift: Pick<Shift, 'status'> & {
    counts: readonly Pick<ShiftCount, 'methodId' | 'counted'>[];
  },
  p: ShiftAdjustmentPayload,
  isAdmin: boolean,
): string | null {
  if (!isAdmin) return 'ปรับปรุงกะได้เฉพาะผู้ดูแลระบบ';
  if (shift.status !== 'closed') return 'ปรับปรุงได้เฉพาะกะที่ปิดแล้ว';
  const count = shift.counts.find((c) => c.methodId === p.methodId);
  if (!count || count.counted === null) return 'ปรับปรุงได้เฉพาะช่องทางที่นับตอนปิดกะ';
  const amount = Number(p.amount);
  if (!Number.isFinite(amount) || amount === 0 || round2(amount) !== amount) {
    return 'จำนวนเงินต้องไม่เป็น 0 (ทศนิยมไม่เกิน 2 ตำแหน่ง)';
  }
  if (!(p.reasonCode in ADJUSTMENT_REASON_LABEL)) return 'กรุณาเลือกสาเหตุ';
  const reason = (p.reason ?? '').trim();
  if (p.reasonCode === 'other' && !reason) return 'กรุณาอธิบายสาเหตุ';
  if (reason.length > 200) return 'สาเหตุต้องไม่เกิน 200 ตัวอักษร';
  return null;
}

/** Variance of one method after the closed shift's adjustments (S8). */
export function adjustedVariance(
  count: Pick<ShiftCount, 'methodId' | 'counted' | 'expected'>,
  adjustments: readonly Pick<ShiftAdjustment, 'methodId' | 'amount'>[],
): number {
  const extra = adjustments
    .filter((a) => a.methodId === count.methodId)
    .reduce((sum, a) => sum + a.amount, 0);
  return round2(variance(count) + extra);
}

/** Methods to check at close, without their amounts (blind count). */
export const closeChecklist = (expected: readonly ExpectedLine[]): CloseChecklistItem[] =>
  expected.map(({ methodId, name, type, closeCheck }) => ({ methodId, name, type, closeCheck }));

/**
 * Every `count` method has an amount (2 decimals) and every `confirm` one is ticked. Cash is ≥ 0;
 * other counted methods may be negative — their evidence (e.g. the EDC settlement) is net of
 * refunds, which can exceed what came in (S9 / B23). Always allowed, not only when the expected
 * amount is negative, so the input never hints at it (blind count).
 */
export function countInputsError(
  expected: readonly Pick<ExpectedLine, 'methodId' | 'name' | 'type' | 'closeCheck'>[],
  inputs: readonly ShiftCountInput[],
): string | null {
  for (const line of expected) {
    const input = inputs.find((c) => c.methodId === line.methodId);
    if (line.closeCheck === 'none') continue;
    if (line.closeCheck === 'confirm') {
      if (!input?.confirmed) return `กรุณาตรวจยอด ${line.name} แล้วติ๊ก "ตรวจแล้ว"`;
      continue;
    }
    const valid = line.type === 'cash' ? isMoney : isSignedMoney;
    if (!input || !valid(input.counted)) return `กรุณากรอกยอดที่นับได้ของ ${line.name}`;
    if (input.firstCount !== null && !valid(input.firstCount)) {
      return `ยอดนับครั้งแรกของ ${line.name} ไม่ถูกต้อง`;
    }
  }
  return null;
}

/**
 * Reveals the expected amounts and variances after a blind count (server side, so the cashier
 * never sees them before counting). Call only once `countInputsError()` passed.
 */
export function countCheck(
  expected: readonly ExpectedLine[],
  inputs: readonly ShiftCountInput[],
  limit: number,
): CountCheckResult {
  const lines = expected.map((line) => {
    const counted =
      line.closeCheck === 'count'
        ? (inputs.find((c) => c.methodId === line.methodId)?.counted ?? null)
        : null;
    return {
      methodId: line.methodId,
      name: line.name,
      type: line.type,
      closeCheck: line.closeCheck,
      expected: line.expected,
      counted,
      variance: variance({ counted, expected: line.expected }),
    };
  });
  return { lines, needsApproval: needsApproval(lines, limit) };
}

/**
 * Rule for closing a shift (POS + server): open shift, closed by its cashier or an admin, every
 * line checked per its `closeCheck`, a reason for every variance, deposit within the counted cash.
 * Approval is not an error: a variance above the limit without `approvedBy` closes as `pending`.
 */
export function closeShiftError(
  shift: Pick<Shift, 'status' | 'cashier'>,
  p: ShiftClosePayload,
  expected: readonly Pick<ExpectedLine, 'methodId' | 'name' | 'type' | 'closeCheck' | 'expected'>[],
  ctx: { user: string; isAdmin: boolean },
): string | null {
  if (shift.status !== 'open') return 'กะนี้ปิดไปแล้ว';
  if (ctx.user !== shift.cashier && !ctx.isAdmin) {
    return 'ปิดกะได้เฉพาะเจ้าของกะหรือผู้ดูแลระบบ';
  }
  const countProblem = countInputsError(expected, p.counts);
  if (countProblem) return countProblem;
  for (const line of expected) {
    if (line.closeCheck !== 'count') continue;
    const input = p.counts.find((c) => c.methodId === line.methodId)!;
    const diff = round2((input.counted ?? 0) - line.expected);
    if (diff === 0) continue;
    if (!input.reasonCode || !(input.reasonCode in VARIANCE_REASON_LABEL)) {
      return `${line.name} ${diff > 0 ? 'เกิน' : 'ขาด'} ${baht(Math.abs(diff))} บาท — กรุณาระบุสาเหตุ`;
    }
    const reason = (input.reason ?? '').trim();
    if (input.reasonCode === 'other' && !reason) {
      return `กรุณาอธิบายสาเหตุส่วนต่างของ ${line.name}`;
    }
    if (reason.length > 200) return 'สาเหตุต้องไม่เกิน 200 ตัวอักษร';
  }
  const drawer = expected.find((l) => l.type === 'cash');
  const cashCounted = drawer
    ? (p.counts.find((c) => c.methodId === drawer.methodId)?.counted ?? 0)
    : 0;
  if (!denominationsValid(p.cashDenominations)) return 'จำนวนแบงก์/เหรียญไม่ถูกต้อง';
  if (p.cashDenominations.length && denominationTotal(p.cashDenominations) !== cashCounted) {
    return 'ยอดรวมแบงก์/เหรียญไม่ตรงกับยอดเงินสดที่นับ';
  }
  if (!isMoney(p.depositAmount) || p.depositAmount > cashCounted) {
    return 'เงินนำส่งต้องอยู่ระหว่าง 0 ถึงยอดเงินสดที่นับได้';
  }
  if ((p.note ?? '').length > 500) return 'หมายเหตุต้องไม่เกิน 500 ตัวอักษร';
  return null;
}

export interface ShiftSummary {
  /** Sales made in the shift (including ones voided later) */
  billCount: number;
  salesTotal: number;
  /** Promotion + manual discounts of those sales */
  discountTotal: number;
  /** Voids made in the shift */
  voidCount: number;
  voidTotal: number;
  /** Credit notes issued in the shift */
  refundCount: number;
  refundTotal: number;
  exchangeCount: number;
  /** Drawer opened without a sale (S7) */
  drawerOpenCount: number;
  cashIn: number;
  cashOut: number;
  /** salesTotal − voidTotal − refundTotal */
  netSales: number;
  /** What to check per method at close (no amounts — for everyone) */
  checklist: CloseChecklistItem[];
  /** Per method (expected amounts) — admins only while the shift is open (S2) */
  lines?: ExpectedLine[];
}

/** X report (open shift) / Z report (closed). `detailed: false` leaves out the per-method lines. */
export function shiftSummary(
  shift: Pick<Shift, 'id' | 'openingFloat'>,
  ctx: ShiftContext,
  opts: { detailed: boolean },
): ShiftSummary {
  const sold = ctx.sales.filter((s) => s.shiftId === shift.id);
  const voided = ctx.sales.filter((s) => s.voidShiftId === shift.id);
  const notes = ctx.creditNotes.filter((n) => n.shiftId === shift.id);
  const moves = ctx.movements.filter((m) => m.shiftId === shift.id);
  const sum = <T>(items: readonly T[], f: (x: T) => number) =>
    round2(items.reduce((acc, x) => acc + f(x), 0));
  const salesTotal = sum(sold, (s) => s.total);
  const voidTotal = sum(voided, (s) => s.total);
  const refundTotal = sum(notes, (n) => n.total);
  const expected = expectedByMethod(shift, ctx);
  return {
    billCount: sold.length,
    salesTotal,
    discountTotal: sum(sold, (s) => s.itemDiscount + s.billDiscount + s.manualDiscount),
    voidCount: voided.length,
    voidTotal,
    refundCount: notes.length,
    refundTotal,
    exchangeCount: (ctx.exchanges ?? []).filter((x) => x.shiftId === shift.id).length,
    drawerOpenCount: (ctx.drawerOpens ?? []).filter((d) => d.shiftId === shift.id).length,
    cashIn: sum(
      moves.filter((m) => m.type === 'in'),
      (m) => m.amount,
    ),
    cashOut: sum(
      moves.filter((m) => m.type === 'out'),
      (m) => m.amount,
    ),
    netSales: round2(salesTotal - voidTotal - refundTotal),
    checklist: closeChecklist(expected),
    ...(opts.detailed ? { lines: expected } : {}),
  };
}

/** Open longer than `maxHours` — probably left open (S5; warning only, never blocks). */
export const shiftOpenTooLong = (
  shift: Pick<Shift, 'status' | 'openedAt'>,
  now: Date,
  maxHours: number,
): boolean =>
  shift.status === 'open' &&
  now.getTime() - new Date(shift.openedAt).getTime() > maxHours * 3_600_000;

/** Variance per cashier over closed shifts (S3: spots small shortages that never hit the limit). */
export interface VarianceReportRow {
  cashier: string;
  /** Closed shifts */
  shifts: number;
  /** Shifts with at least one method short / over */
  shortCount: number;
  overCount: number;
  /** Σ shortages (positive) / Σ overages over all methods */
  shortTotal: number;
  overTotal: number;
  /** Shifts still waiting for approval */
  pending: number;
  /** Drawer opened without a sale in those shifts (S7) */
  drawerOpens: number;
}

/**
 * Closed shifts grouped by cashier, biggest shortage first. Variances are taken after the shifts'
 * adjustments (S8); `drawerOpens` counts no-sale drawer openings (S7).
 */
export function varianceReport(
  shifts: readonly (Pick<Shift, 'id' | 'cashier' | 'status' | 'approvalStatus'> & {
    counts: readonly Pick<ShiftCount, 'methodId' | 'counted' | 'expected'>[];
  })[],
  opts: {
    adjustments?: readonly Pick<ShiftAdjustment, 'shiftId' | 'methodId' | 'amount'>[];
    drawerOpens?: readonly Pick<DrawerOpen, 'shiftId'>[];
  } = {},
): VarianceReportRow[] {
  const rows = new Map<string, VarianceReportRow>();
  for (const shift of shifts) {
    if (shift.status !== 'closed') continue;
    const row = rows.get(shift.cashier) ?? {
      cashier: shift.cashier,
      shifts: 0,
      shortCount: 0,
      overCount: 0,
      shortTotal: 0,
      overTotal: 0,
      pending: 0,
      drawerOpens: 0,
    };
    const adjustments = (opts.adjustments ?? []).filter((a) => a.shiftId === shift.id);
    const diffs = shift.counts.map((c) => adjustedVariance(c, adjustments));
    const opens = (opts.drawerOpens ?? []).filter((d) => d.shiftId === shift.id).length;
    const short = round2(diffs.filter((d) => d < 0).reduce((sum, d) => sum - d, 0));
    const over = round2(diffs.filter((d) => d > 0).reduce((sum, d) => sum + d, 0));
    rows.set(shift.cashier, {
      ...row,
      shifts: row.shifts + 1,
      shortCount: row.shortCount + (short > 0 ? 1 : 0),
      overCount: row.overCount + (over > 0 ? 1 : 0),
      shortTotal: round2(row.shortTotal + short),
      overTotal: round2(row.overTotal + over),
      pending: row.pending + (shift.approvalStatus === 'pending' ? 1 : 0),
      drawerOpens: row.drawerOpens + opens,
    });
  }
  return [...rows.values()].sort(
    (a, b) => b.shortTotal - a.shortTotal || a.cashier.localeCompare(b.cashier),
  );
}

/** Shifts can be turned off only when no shift is open (otherwise its cash is never counted). */
export function requireShiftChangeError(
  current: boolean,
  next: boolean,
  openShiftCount: number,
): string | null {
  if (current && !next && openShiftCount > 0) {
    return `ยังมีกะที่เปิดอยู่ ${openShiftCount} กะ — ปิดกะทั้งหมดก่อนปิดการใช้ระบบกะ`;
  }
  return null;
}
