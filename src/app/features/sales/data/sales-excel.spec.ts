import type { Worksheet } from 'exceljs';
import { CreditNote, SALE_DEFAULTS, Sale, SaleLine, SalePayment } from '@core/models';
import { loadExcel } from '@shared/utils/excel';
import { SalesExportOptions, salesXlsx } from './sales-excel';

describe('sales list Excel', () => {
  const line = (extra: Partial<SaleLine>): SaleLine => ({
    productId: 1,
    sku: 'MS-010',
    name: 'เมาส์ไร้สาย',
    shortName: 'เมาส์',
    unit: 'ชิ้น',
    factor: 1,
    qty: 1,
    unitPrice: 590,
    listPrice: 590,
    itemDiscount: 59,
    billDiscount: 0,
    manualDiscount: 0,
    amount: 531,
    vatType: 'vat7',
    itemType: 'stock',
    vat: 34.74,
    promotionIds: [],
    freeOfPromotionId: null,
    serial: null,
    warrantyMonths: 12,
    cogs: 330,
    ...extra,
  });
  const cash = (amount: number, tendered = amount): SalePayment => ({
    methodId: 1,
    name: 'เงินสด',
    type: 'cash',
    amount,
    tendered,
    reference: '',
    installmentMonths: null,
  });
  const sale = (id: number, extra: Partial<Sale>): Sale => ({
    ...SALE_DEFAULTS,
    id,
    orderNo: `POS-HQ-1-20261020-000${id}`,
    date: '2026-10-20T05:51:00.000Z', // 12:51 in Bangkok
    customer: '',
    subtotal: 590,
    itemDiscount: 59,
    total: 531,
    vat: 34.74,
    itemCount: 1,
    status: 'paid',
    cashier: 'Admin',
    branchId: 1,
    terminalId: 1,
    posId: 'E051234567890',
    lines: [line({})],
    payments: [cash(531, 600)],
    change: 69,
    ...extra,
  });
  const note: CreditNote = {
    id: 1,
    cnNo: 'CN-HQ-20261020-0001',
    saleId: 1,
    orderNo: 'POS-HQ-1-20261020-0001',
    taxInvoiceNo: null,
    buyer: null,
    saleDate: '2026-10-20T05:51:00.000Z',
    date: '2026-10-20T07:00:00.000Z',
    cashier: 'Admin',
    reason: 'ลูกค้าคืนสินค้า',
    lines: [
      {
        saleLineIndex: 0,
        productId: 1,
        sku: 'MS-010',
        name: 'เมาส์ไร้สาย',
        shortName: 'เมาส์',
        unit: 'ชิ้น',
        factor: 1,
        qty: 1,
        amount: 531,
        vatType: 'vat7',
        vat: 34.74,
        cogs: 330,
        serial: null,
        free: false,
        restock: true,
      },
    ],
    deductions: [],
    subtotal: 531,
    deduction: 0,
    total: 531,
    vat: 34.74,
    refunds: [cash(531)],
    branchId: 1,
  } as CreditNote;

  const options = (extra: Partial<SalesExportOptions> = {}): SalesExportOptions => ({
    sales: [
      sale(1, {}),
      sale(2, {
        status: 'cancelled',
        voidReason: 'คีย์รายการผิด',
        total: 1000,
        subtotal: 1000,
        itemDiscount: 0,
        lines: [line({ amount: 1000, itemDiscount: 0, unitPrice: 1000, cogs: 500 })],
      }),
    ],
    creditNotes: [note],
    scopeText: 'สาขา HQ · ช่วงวันที่: 20 ต.ค. 2569',
    seeCost: true,
    showBranch: false,
    branchCode: (id) => (id === 1 ? 'HQ' : '-'),
    terminalLabel: (id) => `เครื่อง ${id}`,
    ...extra,
  });

  const open = async (opts: SalesExportOptions) => {
    const ExcelJS = await loadExcel();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await (await salesXlsx(opts)).arrayBuffer());
    return book;
  };
  /** Header row (row 4) → column number by header text */
  const headers = (sheet: Worksheet) => {
    const map = new Map<string, number>();
    sheet.getRow(4).eachCell((cell, col) => map.set(String(cell.value), col));
    return map;
  };
  const value = (sheet: Worksheet, row: number, header: string) =>
    sheet.getRow(row).getCell(headers(sheet).get(header) ?? 0).value;

  it('has bills, lines, payments and credit notes, each with the title and scope', async () => {
    const book = await open(options());
    expect(book.worksheets.map((s) => s.name)).toEqual([
      'บิล',
      'รายการสินค้า',
      'การชำระเงิน',
      'ใบลดหนี้',
    ]);
    for (const sheet of book.worksheets) {
      expect(String(sheet.getCell('A2').value)).toBe('สาขา HQ · ช่วงวันที่: 20 ต.ค. 2569');
    }
  });

  it('writes one row per bill with discounts, payments, status and the local sale time', async () => {
    const [bills] = (await open(options())).worksheets;
    expect(value(bills, 5, 'เลขที่บิล')).toBe('POS-HQ-1-20261020-0001');
    expect(value(bills, 5, 'ยอดก่อนส่วนลด')).toBe(590);
    expect(value(bills, 5, 'ส่วนลดโปรสินค้า')).toBe(59);
    expect(value(bills, 5, 'ยอดสุทธิ')).toBe(531);
    expect(value(bills, 5, 'เงินทอน')).toBe(69);
    expect(value(bills, 5, 'ชำระโดย')).toBe('เงินสด');
    expect(value(bills, 5, 'ลูกค้า')).toBe('ลูกค้าทั่วไป');
    expect(value(bills, 5, 'เครื่อง POS')).toBe('เครื่อง 1');
    // local wall-clock time is stored, so Excel shows 12:51 — not 05:51 UTC
    const when = value(bills, 5, 'วันที่-เวลา') as Date;
    expect([when.getUTCHours(), when.getUTCMinutes()]).toEqual([
      new Date('2026-10-20T05:51:00.000Z').getHours(),
      51,
    ]);
    expect(value(bills, 6, 'สถานะ')).toBe('ยกเลิก');
    expect(value(bills, 6, 'เหตุผลยกเลิก')).toBe('คีย์รายการผิด');
  });

  it('totals leave out cancelled bills; gross profit = net of VAT − cost', async () => {
    const [bills] = (await open(options())).worksheets;
    expect(value(bills, 7, 'เลขที่บิล')).toBe('รวม 1 บิล (ไม่รวมบิลที่ยกเลิก)');
    expect(value(bills, 7, 'ยอดสุทธิ')).toBe(531);
    expect(value(bills, 5, 'ต้นทุนขาย')).toBe(330);
    expect(value(bills, 5, 'กำไรขั้นต้น')).toBe(166.26); // 531 − 34.74 − 330
    expect(value(bills, 7, 'กำไรขั้นต้น')).toBe(166.26);
  });

  it('leaves cost / profit blank for older orders without lines (cost unknown) and out of the totals', async () => {
    const legacy = sale(3, {
      orderNo: 'SO-2026-0007',
      lines: [],
      payments: [],
      total: 49800,
      subtotal: 49800,
      itemDiscount: 0,
      vat: 0,
    });
    const [bills] = (await open(options({ sales: [sale(1, {}), legacy] }))).worksheets;
    expect(value(bills, 6, 'เลขที่บิล')).toBe('SO-2026-0007');
    expect(value(bills, 6, 'ต้นทุนขาย')).toBeNull();
    expect(value(bills, 6, 'กำไรขั้นต้น')).toBeNull();
    expect(value(bills, 7, 'ยอดสุทธิ')).toBe(50331);
    expect(value(bills, 7, 'กำไรขั้นต้น')).toBe(166.26);
  });

  it('has no cost / profit columns for who cannot see cost (E46)', async () => {
    const book = await open(options({ seeCost: false }));
    for (const sheet of book.worksheets) {
      expect(headers(sheet).has('ต้นทุนขาย')).toBe(false);
      expect(headers(sheet).has('กำไรขั้นต้น')).toBe(false);
    }
  });

  it('adds the branch column only when every branch is shown', async () => {
    expect(headers((await open(options())).worksheets[0]).has('สาขา')).toBe(false);
    const all = (await open(options({ showBranch: true }))).worksheets[0];
    expect(value(all, 5, 'สาขา')).toBe('HQ');
  });

  it('lists every line with its own profit, and payments with refunds as negative rows', async () => {
    const [, lines, payments] = (await open(options())).worksheets;
    expect(value(lines, 5, 'SKU')).toBe('MS-010');
    expect(value(lines, 5, 'ยอดสุทธิ')).toBe(531);
    expect(value(lines, 5, 'กำไรขั้นต้น')).toBe(166.26);
    expect(value(lines, 6, 'สถานะบิล')).toBe('ยกเลิก');

    expect(value(payments, 5, 'รายการ')).toBe('ขาย');
    expect(value(payments, 5, 'จำนวนเงิน')).toBe(531);
    expect(value(payments, 5, 'รับเงินมา')).toBe(600);
    expect(value(payments, 5, 'เงินทอน')).toBe(69);
    const refund = 7; // after the 2 sale payments
    expect(value(payments, refund, 'เลขที่เอกสาร')).toBe('CN-HQ-20261020-0001');
    expect(value(payments, refund, 'รายการ')).toBe('คืนเงิน (POS-HQ-1-20261020-0001)');
    expect(value(payments, refund, 'จำนวนเงิน')).toBe(-531);
  });

  it('lists the credit notes with what came back and a totals row', async () => {
    const [, , , notes] = (await open(options())).worksheets;
    expect(value(notes, 5, 'อ้างอิงบิล')).toBe('POS-HQ-1-20261020-0001');
    expect(value(notes, 5, 'สินค้าที่รับคืน')).toBe('MS-010 × 1 ชิ้น');
    expect(value(notes, 5, 'ยอดคืน')).toBe(531);
    expect(value(notes, 5, 'คืนเงินผ่าน')).toBe('เงินสด');
    expect(value(notes, 6, 'เลขที่ใบลดหนี้')).toBe('รวม 1 ใบ');
    expect(value(notes, 6, 'ยอดคืน')).toBe(531);
  });
});
