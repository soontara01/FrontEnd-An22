import {
  CreditNote,
  CreditNotePayload,
  creditNoteError,
  draftCreditNote,
  refundOptions,
  remainingQty,
} from './credit-note.model';
import { PAYMENT_METHOD_DEFAULTS, PaymentMethod } from './payment-method.model';
import { PROMOTION_DEFAULTS, Promotion } from './promotion.model';
import { SALE_DEFAULTS, Sale, SaleLine } from './sale.model';

const line = (over: Partial<SaleLine>): SaleLine => ({
  productId: 1,
  sku: 'SKU',
  name: 'สินค้า',
  shortName: 'สินค้า',
  unit: 'ชิ้น',
  factor: 1,
  qty: 1,
  unitPrice: 0,
  listPrice: 0,
  itemDiscount: 0,
  billDiscount: 0,
  amount: 0,
  vatType: 'vat7',
  itemType: 'stock',
  vat: 0,
  promotionIds: [],
  freeOfPromotionId: null,
  serial: null,
  warrantyMonths: 0,
  cogs: 0,
  ...over,
});

// Notebook (earns a free mouse + setup service), 3 mice at −10%, paid by card + cash.
const sale: Sale = {
  ...SALE_DEFAULTS,
  id: 1,
  orderNo: 'POS-20261001-0001',
  date: new Date(2026, 9, 1, 10, 0).toISOString(),
  customer: '',
  status: 'paid',
  lines: [
    line({
      productId: 1,
      sku: 'NB',
      unitPrice: 24900,
      listPrice: 24900,
      billDiscount: 300,
      amount: 24600,
      vat: 1609.35,
      cogs: 19900,
      serial: 'NB-1',
      promotionIds: [3],
    }),
    line({
      productId: 2,
      sku: 'MS',
      qty: 3,
      unitPrice: 590,
      listPrice: 590,
      itemDiscount: 177,
      amount: 1593,
      vat: 104.21,
      cogs: 1050,
      promotionIds: [1],
    }),
    line({
      productId: 2,
      sku: 'MS',
      listPrice: 590,
      cogs: 350,
      promotionIds: [3],
      freeOfPromotionId: 3,
    }),
    line({
      productId: 9,
      sku: 'SETUP',
      unit: 'ครั้ง',
      listPrice: 500,
      itemType: 'service',
      promotionIds: [3],
      freeOfPromotionId: 3,
    }),
  ],
  payments: [
    {
      methodId: 2,
      name: 'บัตร',
      type: 'card',
      amount: 20000,
      tendered: 20000,
      reference: 'A',
      installmentMonths: null,
    },
    {
      methodId: 1,
      name: 'เงินสด',
      type: 'cash',
      amount: 6193,
      tendered: 6200,
      reference: '',
      installmentMonths: null,
    },
  ],
  subtotal: 26670,
  itemDiscount: 177,
  billDiscount: 300,
  total: 26193,
  itemCount: 6,
};

const promotions: Promotion[] = [
  {
    ...PROMOTION_DEFAULTS,
    id: 3,
    code: 'NB-GIFT',
    name: 'แถม',
    startDate: '2026-09-01',
    type: 'free_goods',
    minQty: 1,
    discount: null,
    scope: { all: false, productIds: [1], categoryIds: [] },
    freeGoods: {
      items: [
        { productId: 2, qty: 1 },
        { productId: 9, qty: 1 },
      ],
      repeat: true,
      maxSets: null,
    },
  },
];

const methods: PaymentMethod[] = [
  { ...PAYMENT_METHOD_DEFAULTS, id: 1, code: 'CASH', name: 'เงินสด', type: 'cash', sortOrder: 1 },
  {
    ...PAYMENT_METHOD_DEFAULTS,
    id: 2,
    code: 'CARD',
    name: 'บัตร',
    type: 'card',
    sortOrder: 2,
    requireReference: true,
    referenceLabel: 'เลขอนุมัติ',
  },
  { ...PAYMENT_METHOD_DEFAULTS, id: 3, code: 'QR', name: 'QR', type: 'qr', sortOrder: 3 },
];

const note = (over: Partial<CreditNote>): CreditNote => ({
  id: 1,
  cnNo: 'CN-1',
  saleId: 1,
  orderNo: sale.orderNo,
  saleDate: sale.date,
  date: sale.date,
  cashier: '',
  reason: 'x',
  lines: [],
  deductions: [],
  subtotal: 0,
  deduction: 0,
  total: 0,
  vat: 0,
  refunds: [],
  ...over,
});

const ret = (saleLineIndex: number, qty = 1, restock = true) => ({ saleLineIndex, qty, restock });

describe('credit note model', () => {
  it('refunds a share of what was paid and keeps the exact remainder for the last units', () => {
    const first = draftCreditNote(sale, [], [ret(1)], promotions);
    expect(first.error).toBeNull();
    expect(first.lines[0]).toMatchObject({ qty: 1, amount: 531, vat: 34.74, cogs: 350 });
    expect(first.total).toBe(531);

    const earlier = note({ lines: first.lines });
    expect(remainingQty(sale, [earlier], 1)).toBe(2);
    const rest = draftCreditNote(sale, [earlier], [ret(1, 2)], promotions);
    expect(rest.lines[0]).toMatchObject({ amount: 1062, vat: 69.47, cogs: 700 });
    expect(draftCreditNote(sale, [earlier], [ret(1, 3)], promotions).error).toBe(
      'MS คืนได้ไม่เกิน 2 ชิ้น',
    );
  });

  it('deducts free goods the customer keeps when the main item comes back', () => {
    const draft = draftCreditNote(sale, [], [ret(0)], promotions);
    expect(draft.deductions.map((d) => [d.sku, d.qty, d.amount])).toEqual([
      ['MS', 1, 590],
      ['SETUP', 1, 500],
    ]);
    expect(draft).toMatchObject({ subtotal: 24600, deduction: 1090, total: 23510, vat: 1538.04 });
  });

  it('charges nothing when the free goods come back too (services never restock)', () => {
    const draft = draftCreditNote(sale, [], [ret(0), ret(2), ret(3)], promotions);
    expect(draft.deductions).toEqual([]);
    expect(draft.total).toBe(24600);
    expect(draft.lines.find((l) => l.sku === 'SETUP')).toMatchObject({
      free: true,
      restock: false,
    });
  });

  it('never charges the same kept free goods twice', () => {
    const first = draftCreditNote(sale, [], [ret(0)], promotions);
    const earlier = note({ lines: first.lines, deductions: first.deductions });
    expect(draftCreditNote(sale, [earlier], [ret(1)], promotions).deductions).toEqual([]);
  });

  it('offers cash and the bill’s own methods up to what is left', () => {
    expect(refundOptions(sale, [], methods).map((o) => [o.method.code, o.max])).toEqual([
      ['CASH', null],
      ['CARD', 20000],
    ]);
    const earlier = note({
      refunds: [{ ...sale.payments[0], amount: 5000, tendered: 5000 }],
    });
    expect(refundOptions(sale, [earlier], methods)[1].max).toBe(15000);
  });

  describe('creditNoteError', () => {
    const ctx = { promotions, methods, today: '2026-10-04' };
    const payload = (over: Partial<CreditNotePayload>): CreditNotePayload => ({
      lines: [ret(1)],
      refunds: [{ methodId: 1, amount: 531, reference: '', installmentMonths: null }],
      reason: 'ชำรุด',
      expectedTotal: 531,
      ...over,
    });
    const refund = (methodId: number, amount: number, reference = '') => ({
      methodId,
      amount,
      reference,
      installmentMonths: null,
    });

    it('accepts a valid return', () => {
      expect(creditNoteError(sale, [], payload({}), ctx)).toBeNull();
      expect(
        creditNoteError(sale, [], payload({ refunds: [refund(2, 531, 'R1')] }), ctx),
      ).toBeNull();
    });

    it('rejects same-day bills, missing reason and a changed total', () => {
      expect(creditNoteError(sale, [], payload({}), { ...ctx, today: '2026-10-01' })).toBe(
        'บิลของวันนี้ให้ยกเลิกบิลแทนการออกใบลดหนี้',
      );
      expect(creditNoteError({ ...sale, status: 'cancelled' }, [], payload({}), ctx)).toBe(
        'ออกใบลดหนี้ได้เฉพาะบิลขายหน้าร้านที่ชำระแล้ว',
      );
      expect(creditNoteError(sale, [], payload({ reason: ' ' }), ctx)).toBe(
        'กรุณาระบุเหตุผลการลดหนี้',
      );
      expect(creditNoteError(sale, [], payload({ expectedTotal: 590 }), ctx)).toBe(
        'ยอดลดหนี้เปลี่ยน กรุณาตรวจสอบอีกครั้ง',
      );
    });

    it('checks refund methods, caps, references and the refunded sum', () => {
      expect(creditNoteError(sale, [], payload({ refunds: [refund(3, 531)] }), ctx)).toBe(
        'คืนเงินได้เฉพาะเงินสดหรือช่องทางที่ลูกค้าชำระบิลนี้',
      );
      expect(creditNoteError(sale, [], payload({ refunds: [refund(2, 531)] }), ctx)).toBe(
        'บัตร: กรุณากรอกเลขอนุมัติ',
      );
      expect(
        creditNoteError(
          sale,
          [],
          payload({ lines: [ret(0)], expectedTotal: 23510, refunds: [refund(2, 23510, 'R')] }),
          ctx,
        ),
      ).toBe('บัตร: คืนได้ไม่เกิน 20,000 บาท');
      expect(creditNoteError(sale, [], payload({ refunds: [refund(1, 500)] }), ctx)).toBe(
        'ยอดคืนเงิน 500 ไม่เท่ายอดลดหนี้ 531',
      );
    });
  });
});
