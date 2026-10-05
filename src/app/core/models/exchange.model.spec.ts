import { CreditNote } from './credit-note.model';
import {
  Exchange,
  ExchangeContext,
  exchangeBlocker,
  exchangeDeadline,
  exchangeError,
  exchangeNos,
  warrantyEnd,
} from './exchange.model';
import { SALE_DEFAULTS, Sale, SaleLine, currentSerial } from './sale.model';

const line = (over: Partial<SaleLine>): SaleLine => ({
  productId: 1,
  sku: 'SKU',
  name: 'สินค้า',
  shortName: 'สินค้า',
  unit: 'ชิ้น',
  factor: 1,
  qty: 1,
  unitPrice: 100,
  listPrice: 100,
  itemDiscount: 0,
  billDiscount: 0,
  amount: 100,
  vatType: 'vat7',
  itemType: 'stock',
  vat: 6.54,
  promotionIds: [],
  freeOfPromotionId: null,
  serial: null,
  warrantyMonths: 0,
  cogs: 60,
  ...over,
});

// Notebook (serial, 12-month warranty), 3 mice, setup service — sold 2026-10-01.
const sale: Sale = {
  ...SALE_DEFAULTS,
  id: 1,
  orderNo: 'POS-20261001-0001',
  date: new Date(2026, 9, 1, 10, 0).toISOString(),
  customer: '',
  subtotal: 0,
  total: 0,
  itemCount: 0,
  status: 'paid',
  lines: [
    line({ productId: 1, sku: 'NB', serial: 'NB-1', warrantyMonths: 12 }),
    line({ productId: 2, sku: 'MS', qty: 3 }),
    line({ productId: 9, sku: 'SETUP', itemType: 'service' }),
  ],
};

const exchange = (date: string, lines: Partial<Exchange['lines'][number]>[]): Exchange => ({
  id: 1,
  exNo: 'EX-1',
  saleId: 1,
  orderNo: sale.orderNo,
  saleDate: sale.date,
  date,
  cashier: '',
  reason: 'ชำรุด',
  lines: lines.map((l) => ({
    saleLineIndex: 0,
    productId: 1,
    sku: 'NB',
    name: '',
    shortName: '',
    unit: 'ชิ้น',
    factor: 1,
    qty: 1,
    oldSerial: null,
    newSerial: null,
    restock: false,
    costIn: 0,
    costOut: 0,
    ...l,
  })),
});

const ctx = (over: Partial<ExchangeContext> = {}): ExchangeContext => ({
  creditNotes: [],
  exchanges: [],
  store: { exchangeDays: 7 },
  isAdmin: false,
  today: '2026-10-05',
  products: [{ id: 2, sku: 'MS', stock: 5, unit: 'ชิ้น' }],
  ...over,
});

describe('exchange model', () => {
  const swapNotebook = { saleLineIndex: 0, qty: 1, newSerial: 'NB-2', restock: false };

  it('lets staff exchange within the store window and admins any time', () => {
    expect(exchangeDeadline(sale, { exchangeDays: 7 })).toBe('2026-10-08');
    expect(exchangeDeadline(sale, { exchangeDays: 0 })).toBeNull();
    expect(exchangeBlocker(sale, ctx({ today: '2026-10-08' }))).toBeNull();
    expect(exchangeBlocker(sale, ctx({ today: '2026-10-09' }))).toBe(
      'เกินกำหนดเปลี่ยนสินค้า 7 วัน — ให้ผู้ดูแลระบบทำรายการ',
    );
    expect(exchangeBlocker(sale, ctx({ today: '2026-10-09', isAdmin: true }))).toBeNull();
    expect(exchangeBlocker(sale, ctx({ today: '2027-01-01', store: { exchangeDays: 0 } }))).toBe(
      null,
    );
    expect(exchangeBlocker({ ...sale, status: 'cancelled' }, ctx())).toBe(
      'เปลี่ยนสินค้าได้เฉพาะบิลขายหน้าร้านที่ชำระแล้ว',
    );
  });

  it('checks lines, quantities held, serials and the reason', () => {
    const err = (lines: unknown[], reason = 'ชำรุด', c = ctx()) =>
      exchangeError(sale, { lines: lines as never, reason }, c);
    expect(err([swapNotebook])).toBeNull();
    expect(err([])).toBe('กรุณาเลือกสินค้าที่เปลี่ยน');
    expect(err([swapNotebook], ' ')).toBe('กรุณาระบุเหตุผลการเปลี่ยนสินค้า');
    expect(err([{ ...swapNotebook, newSerial: '' }])).toBe('NB: กรุณาเลือกซีเรียลเครื่องใหม่');
    expect(err([{ ...swapNotebook, newSerial: 'NB-1' }])).toBe(
      'NB: ซีเรียลใหม่ต้องไม่ใช่เครื่องเดิม',
    );
    expect(err([{ saleLineIndex: 2, qty: 1, newSerial: null, restock: false }])).toBe(
      'SETUP เป็นบริการ เปลี่ยนไม่ได้',
    );
    const mice = { saleLineIndex: 1, qty: 3, newSerial: null, restock: true };
    expect(err([mice])).toBeNull();
    // 2 mice already returned by a credit note: only 1 left with the customer
    const note = { lines: [{ saleLineIndex: 1, qty: 2 }] } as unknown as CreditNote;
    expect(err([mice], 'x', ctx({ creditNotes: [note] }))).toBe('MS เปลี่ยนได้ไม่เกิน 1 ชิ้น');
  });

  it('needs non-serial replacements on the shelf before the exchange', () => {
    const mice = { saleLineIndex: 1, qty: 3, newSerial: null, restock: true };
    const err = (stock: number, lines: unknown[] = [mice]) =>
      exchangeError(
        sale,
        { lines: lines as never, reason: 'x' },
        ctx({ products: [{ id: 2, sku: 'MS', stock, unit: 'ชิ้น' }] }),
      );
    expect(err(3)).toBeNull();
    // the 3 returned mice never count: stock 0 cannot hand out a replacement
    expect(err(0)).toBe('MS สต็อกไม่พอเปลี่ยน (คงเหลือ 0 ชิ้น)');
    expect(err(2)).toBe('MS สต็อกไม่พอเปลี่ยน (คงเหลือ 2 ชิ้น)');
    // lines of the same SKU add up (e.g. a paid line + its free line)
    const withFree: Sale = {
      ...sale,
      lines: [...sale.lines, line({ productId: 2, sku: 'MS', freeOfPromotionId: 3 })],
    };
    expect(
      exchangeError(
        withFree,
        {
          lines: [
            { ...mice, qty: 3 },
            { ...mice, saleLineIndex: 3, qty: 1 },
          ],
          reason: 'x',
        },
        ctx({ products: [{ id: 2, sku: 'MS', stock: 3, unit: 'ชิ้น' }] }),
      ),
    ).toBe('MS สต็อกไม่พอเปลี่ยน (คงเหลือ 3 ชิ้น)');
    // serial lines are checked by serial, not by count
    expect(
      exchangeError(sale, { lines: [swapNotebook], reason: 'x' }, ctx({ products: [] })),
    ).toBeNull();
  });

  it('follows the serial the customer holds across exchanges', () => {
    const first = exchange('2026-10-02T03:00:00Z', [{ oldSerial: 'NB-1', newSerial: 'NB-2' }]);
    const second = exchange('2026-10-03T03:00:00Z', [{ oldSerial: 'NB-2', newSerial: 'NB-3' }]);
    expect(currentSerial(sale, 0, [])).toBe('NB-1');
    expect(currentSerial(sale, 0, [second, first])).toBe('NB-3');
    expect(currentSerial(sale, 1, [first])).toBeNull();
    // the serial now held is "the old one" for the next exchange
    expect(
      exchangeError(
        sale,
        { lines: [{ ...swapNotebook, newSerial: 'NB-2' }], reason: 'x' },
        ctx({ exchanges: [first] }),
      ),
    ).toBe('NB: ซีเรียลใหม่ต้องไม่ใช่เครื่องเดิม');
    expect(exchangeNos([{ ...second, exNo: 'EX-2' }, first])).toEqual(['EX-1', 'EX-2']);
  });

  it('keeps the warranty counted from the sale day', () => {
    expect(warrantyEnd(sale, 12)).toBe('2027-10-01');
    expect(warrantyEnd({ date: new Date(2026, 0, 31, 10).toISOString() }, 1)).toBe('2026-02-28');
    expect(warrantyEnd(sale, 0)).toBeNull();
  });
});
