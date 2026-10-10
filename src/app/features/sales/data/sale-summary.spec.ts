import { CreditNote, SALE_DEFAULTS, Sale, SaleLine, SalePayment } from '@core/models';
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
    listPrice: amount,
    itemDiscount: 0,
    billDiscount: 0,
    manualDiscount: 0,
    amount,
    vatType: 'vat7',
    itemType: 'stock',
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
      { methodId: 1, name: 'เงินสด', type: 'cash', amount: 714, count: 2, refunded: 0 },
      { methodId: 3, name: 'QR', type: 'qr', amount: 570, count: 1, refunded: 0 },
    ]);
  });

  it('takes credit notes off net sales, profit and money per method', () => {
    const sales = [
      sale(1, {
        total: 1070,
        vat: 70,
        lines: [line(1070, 70, 600)],
        payments: [pay(1, 'เงินสด', 1070)],
      }),
    ];
    const cnLine = (restock: boolean) => ({
      saleLineIndex: 0,
      productId: 1,
      sku: 'A',
      name: 'A',
      shortName: 'A',
      unit: 'ชิ้น',
      factor: 1,
      qty: 1,
      amount: 535,
      vatType: 'vat7' as const,
      vat: 35,
      cogs: 300,
      serial: null,
      free: false,
      restock,
    });
    const note = (restock: boolean): CreditNote => ({
      id: 1,
      cnNo: 'CN-1',
      saleId: 9,
      orderNo: 'B9',
      taxInvoiceNo: null,
      buyer: null,
      saleDate: '2026-10-01T03:00:00Z',
      date: '2026-10-04T03:00:00Z',
      cashier: '',
      reason: 'x',
      lines: [cnLine(restock)],
      deductions: [],
      subtotal: 535,
      deduction: 0,
      total: 535,
      vat: 35,
      refunds: [pay(1, 'เงินสด', 535)],
    });
    // back in stock: −500 revenue, −300 cost
    expect(summarizeSales(sales, [note(true)])).toMatchObject({
      creditCount: 1,
      creditTotal: 535,
      posNet: 500,
      cogs: 300,
      grossProfit: 200,
    });
    // written off: the cost stays
    expect(summarizeSales(sales, [note(false)]).grossProfit).toBe(-100);
    expect(summarizeSales(sales, [note(true)]).byMethod[0]).toMatchObject({
      amount: 535,
      refunded: 535,
    });
  });

  it('is empty without sales', () => {
    expect(summarizeSales([])).toMatchObject({ count: 0, total: 0, average: 0, margin: null });
  });
});
