import { CreditNote, SALE_DEFAULTS, Sale, SaleLine, TaxInvoice } from '@core/models';
import { buildSalesTaxReport } from './sales-tax-report';

describe('buildSalesTaxReport', () => {
  const at = (day: number, hour = 10, month = 10) =>
    new Date(2026, month - 1, day, hour).toISOString();
  const line = (amount: number, vat: number, vatType: 'vat7' | 'exempt' = 'vat7'): SaleLine => ({
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
    vatType,
    itemType: 'stock',
    vat,
    promotionIds: [],
    freeOfPromotionId: null,
    serial: null,
    warrantyMonths: 0,
    cogs: 0,
  });
  const sale = (
    id: number,
    orderNo: string,
    date: string,
    lines: SaleLine[],
    over: Partial<Sale> = {},
  ): Sale => ({
    ...SALE_DEFAULTS,
    id,
    orderNo,
    date,
    customer: '',
    lines,
    subtotal: lines.reduce((n, l) => n + l.amount, 0),
    total: lines.reduce((n, l) => n + l.amount, 0),
    vat: lines.reduce((n, l) => n + l.vat, 0),
    itemCount: lines.length,
    status: 'paid',
    ...over,
  });
  const invoice = (id: number, no: string, s: Sale, date: string, atSale: boolean): TaxInvoice => ({
    id,
    invoiceNo: no,
    saleId: s.id,
    orderNo: s.orderNo,
    saleDate: s.date,
    date,
    buyer: {
      name: 'บริษัท ลูกค้า จำกัด',
      taxId: '0105550123451',
      branchType: 'head',
      branchNo: '',
      address: 'กรุงเทพฯ',
    },
    issuedBy: 'Admin',
    cancelledAt: null,
    cancelReason: '',
    replacesInvoiceNo: null,
    replacedByNo: null,
    issuedAt: '2026-10-04T03:00:00Z',
    atSale,
  });

  const b1 = sale(1, 'POS-20261004-0001', at(4, 9), [line(1070, 70)]);
  const b2 = sale(2, 'POS-20261004-0002', at(4, 10), [line(535, 35)], { taxInvoiceNo: 'INV-1' });
  const b3 = sale(3, 'POS-20261004-0003', at(4, 11), [line(107, 7)], { status: 'cancelled' });
  const b4 = sale(4, 'POS-20261004-0004', at(4, 12), [line(200, 0, 'exempt')]);
  const b5 = sale(5, 'POS-20261005-0001', at(5), [line(214, 14)]);
  const other = sale(6, 'POS-20260930-0001', at(30, 10, 9), [line(107, 7)]);
  // INV-2 was requested on the 5th for b1 but is dated on its sale day (the 4th).
  const invoices = [
    invoice(1, 'INV-1', b2, b2.date, true),
    { ...invoice(2, 'INV-2', b1, b1.date, false), issuedAt: at(5, 15) },
  ];
  const note: CreditNote = {
    id: 1,
    cnNo: 'CN-20261006-0001',
    saleId: 2,
    orderNo: b2.orderNo,
    taxInvoiceNo: 'INV-1',
    buyer: invoices[0].buyer,
    saleDate: b2.date,
    date: at(6),
    cashier: '',
    reason: 'คืน',
    lines: [],
    deductions: [],
    subtotal: 535,
    deduction: 0,
    total: 535,
    vat: 35,
    refunds: [],
  };
  const report = buildSalesTaxReport('2026-10', [b1, b2, b3, b4, b5, other], invoices, [note]);

  it('summarises abbreviated invoices per day, leaving out bills with a full invoice at sale', () => {
    expect(report.rows[0]).toMatchObject({
      kind: 'abbreviated',
      date: '2026-10-04',
      docNo: 'POS-20261004-0001 – POS-20261004-0004',
      net: 1000,
      vat: 70,
      exempt: 200,
      total: 1270,
      counted: true,
      note: '2 ใบ · ยกเลิก 1 ใบ · ไม่รวมบิลที่ออกใบกำกับเต็มรูป 1 ใบ',
    });
  });

  it('lists full invoices issued at sale on their own line with the buyer', () => {
    expect(report.rows[1]).toMatchObject({
      kind: 'full',
      docNo: 'INV-1',
      buyerName: 'บริษัท ลูกค้า จำกัด',
      buyerTaxId: '0105550123451',
      buyerBranch: 'สำนักงานใหญ่',
      net: 500,
      vat: 35,
      counted: true,
    });
  });

  it('lists later full invoices for reference only and credit notes as negative lines', () => {
    expect(report.rows.map((r) => [r.date, r.kind, r.counted])).toEqual([
      ['2026-10-04', 'abbreviated', true],
      ['2026-10-04', 'full', true],
      ['2026-10-04', 'replacement', false],
      ['2026-10-05', 'abbreviated', true],
      ['2026-10-06', 'credit', true],
    ]);
    expect(report.rows[2].note).toBe(
      'ออกแทนใบกำกับภาษีอย่างย่อ POS-20261004-0001 (ภาษีนับในใบอย่างย่อแล้ว · ออกใบเมื่อ 2026-10-05)',
    );
    expect(report.rows[4]).toMatchObject({
      buyerName: 'บริษัท ลูกค้า จำกัด',
      buyerTaxId: '0105550123451',
      buyerBranch: 'สำนักงานใหญ่',
      net: -500,
      vat: -35,
      total: -535,
      note: 'ใบลดหนี้ อ้างอิง INV-1',
    });
    // 1270 + 535 + 214 − 535; VAT counted once per sale
    expect(report.totals).toEqual({ net: 1200, vat: 84, exempt: 200, total: 1484 });
  });

  it('shows retail as the buyer of a credit note on an abbreviated invoice', () => {
    const retail = { ...note, saleId: 1, orderNo: b1.orderNo, taxInvoiceNo: null, buyer: null };
    const r = buildSalesTaxReport('2026-10', [], [], [retail]);
    expect(r.rows[0]).toMatchObject({
      kind: 'credit',
      buyerName: 'ขายปลีก (ใบกำกับภาษีอย่างย่อ)',
      buyerTaxId: '',
      buyerBranch: '',
      note: `ใบลดหนี้ อ้างอิง ${b1.orderNo}`,
    });
  });

  it('counts a reissued invoice once: the cancelled one at 0, the replacement in full', () => {
    const original = {
      ...invoices[0],
      cancelledAt: at(6),
      cancelReason: 'ชื่อผิด',
      replacedByNo: 'INV-3',
    };
    const replacement = {
      ...invoice(3, 'INV-3', b2, b2.date, true),
      replacesInvoiceNo: 'INV-1',
      issuedAt: at(6),
    };
    const r = buildSalesTaxReport('2026-10', [b2], [original, replacement], []);
    expect(r.rows.map((x) => [x.docNo, x.total, x.note])).toEqual([
      ['INV-1', 0, 'ยกเลิก (ชื่อผิด) · แทนด้วย INV-3'],
      ['INV-3', 535, 'ออกแทนใบกำกับภาษี INV-1 ที่ยกเลิก'],
    ]);
    expect(r.totals).toMatchObject({ vat: 35, total: 535 });
  });

  it('shows a voided full invoice as cancelled with no amounts', () => {
    const cancelled = buildSalesTaxReport(
      '2026-10',
      [{ ...b2, status: 'cancelled' }],
      [{ ...invoices[0], cancelledAt: at(4, 18) }],
      [],
    );
    expect(cancelled.rows).toEqual([
      expect.objectContaining({ kind: 'full', total: 0, vat: 0, note: 'ยกเลิก' }),
    ]);
    expect(cancelled.totals.total).toBe(0);
  });
});
