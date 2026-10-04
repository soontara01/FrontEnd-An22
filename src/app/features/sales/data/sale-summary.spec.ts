import { SALE_DEFAULTS, Sale, SaleLine, SalePayment } from '@core/models';
import { summarizeSales } from './sale-summary';

describe('summarizeSales', () => {
  const line = (amount: number, vat: number, cogs: number): SaleLine => ({
    productId: 1,
    sku: 'A',
    name: 'A',
    shortName: 'A',
    unit: 'ชิ้น',
    factor: 1,
    qty: 1,
    unitPrice: amount,
    itemDiscount: 0,
    billDiscount: 0,
    amount,
    vatType: 'vat7',
    vat,
    promotionIds: [],
    freeOfPromotionId: null,
    serial: null,
    warrantyMonths: 0,
    cogs,
  });
  const pay = (methodId: number, name: string, amount: number): SalePayment => ({
    methodId,
    name,
    type: methodId === 1 ? 'cash' : 'qr',
    amount,
    tendered: amount,
    reference: '',
    installmentMonths: null,
  });
  const sale = (id: number, over: Partial<Sale>): Sale => ({
    ...SALE_DEFAULTS,
    id,
    orderNo: `B${id}`,
    date: '2026-10-04T03:00:00Z',
    customer: '',
    subtotal: 0,
    total: 0,
    itemCount: 1,
    status: 'paid',
    ...over,
  });

  it('totals paid bills, profit of POS bills and money in per method', () => {
    const sales = [
      sale(1, {
        total: 1070,
        vat: 70,
        lines: [line(1070, 70, 600)],
        payments: [pay(1, 'เงินสด', 500), pay(3, 'QR', 570)],
      }),
      sale(2, {
        total: 214,
        vat: 14,
        lines: [line(214, 14, 100)],
        payments: [pay(1, 'เงินสด', 214)],
      }),
      sale(3, { total: 500, lines: [line(500, 32.71, 300)], status: 'cancelled' }),
      sale(4, { total: 999 }), // pre-POS order: in sales total, not in profit
    ];
    const s = summarizeSales(sales);
    expect(s).toMatchObject({
      count: 3,
      total: 2283,
      vat: 84,
      average: 761,
      cancelledCount: 1,
      cancelledTotal: 500,
      posNet: 1200,
      cogs: 700,
      grossProfit: 500,
      margin: 41.67,
    });
    expect(s.byMethod).toEqual([
      { methodId: 1, name: 'เงินสด', type: 'cash', amount: 714, count: 2 },
      { methodId: 3, name: 'QR', type: 'qr', amount: 570, count: 1 },
    ]);
  });

  it('is empty without sales', () => {
    expect(summarizeSales([])).toMatchObject({ count: 0, total: 0, average: 0, margin: null });
  });
});
