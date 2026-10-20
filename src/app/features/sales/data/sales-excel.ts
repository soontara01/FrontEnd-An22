import type { Workbook } from 'exceljs';
import {
  CreditNote,
  ITEM_TYPE_LABEL,
  PAYMENT_TYPE_LABEL,
  RETURN_STATUS_LABEL,
  SALE_STATUS_LABEL,
  Sale,
  SalePayment,
  VAT_TYPE_LABEL,
} from '@core/models';
import {
  EXCEL_DATETIME,
  EXCEL_MONEY,
  excelDate,
  loadExcel,
  styleHeaderRow,
  xlsxBlob,
} from '@shared/utils/excel';

/** One column of a sheet; `cost` = left out for who cannot see cost (E43 / E46), `branch` = only when every branch is shown. */
interface Column {
  header: string;
  width: number;
  kind?: 'money' | 'date' | 'text' | 'int';
  cost?: boolean;
  branch?: boolean;
}

export interface SalesExportOptions {
  /** Bills to export, e.g. the page's filtered rows */
  sales: readonly Sale[];
  /** Credit notes of the same range / branch scope (their own sheet) */
  creditNotes: readonly CreditNote[];
  /** Line under each sheet's title, e.g. 'สาขา HQ · 1 ต.ค. 2569 – 31 ต.ค. 2569 · สถานะ: ชำระแล้ว' */
  scopeText: string;
  /** false: no cost / gross profit columns (E46) */
  seeCost: boolean;
  /** true: a branch column (every branch is shown) */
  showBranch: boolean;
  branchCode: (id: number | null | undefined) => string;
  terminalLabel: (id: number | null | undefined) => string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (ns: readonly number[]) => round2(ns.reduce((a, b) => a + b, 0));

/**
 * Cost / gross profit of a bill (net of VAT − cost of goods, as on the bill page) — null for older
 * orders without lines, whose cost is unknown (they are left out of the profit totals, like the
 * page's summary cards).
 */
const billCogs = (s: Sale): number | null =>
  s.lines.length ? sum(s.lines.map((l) => l.cogs ?? 0)) : null;
const billProfit = (s: Sale): number | null => {
  const cogs = billCogs(s);
  return cogs === null ? null : round2(s.total - s.vat - cogs);
};
const sumKnown = (ns: readonly (number | null)[]) => sum(ns.filter((n): n is number => n !== null));

/**
 * Excel of the sales list (S-menu การขาย): bills, their lines, their payments (+ credit-note
 * refunds as negative rows, to reconcile with EDC / bank slips) and the credit notes of the range.
 * Cancelled bills stay in (status column) but are left out of the totals rows.
 */
export async function salesXlsx(opts: SalesExportOptions): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const book = new ExcelJS.Workbook();
  addBillSheet(book, opts);
  addLineSheet(book, opts);
  addPaymentSheet(book, opts);
  addCreditNoteSheet(book, opts);
  return xlsxBlob(await book.xlsx.writeBuffer());
}

/** Columns kept for these options, and a function picking the matching cells of a row. */
function keep(columns: readonly Column[], opts: SalesExportOptions) {
  const keepIt = (c: Column) => (opts.seeCost || !c.cost) && (opts.showBranch || !c.branch);
  const kept = columns.filter(keepIt);
  const cells = (values: unknown[]) => values.filter((_, i) => keepIt(columns[i]!));
  return { kept, cells };
}

/** Title + scope line, a blank row, then the styled header; returns the header row number. */
function startSheet(
  book: Workbook,
  name: string,
  title: string,
  columns: readonly Column[],
  opts: SalesExportOptions,
) {
  const sheet = book.addWorksheet(name);
  sheet.columns = columns.map((c) => ({ width: c.width }));
  sheet.addRow([title]).font = { bold: true, size: 14 };
  sheet.addRow([opts.scopeText]);
  sheet.addRow([]);
  const header = sheet.addRow(columns.map((c) => c.header));
  styleHeaderRow(sheet, new Set(), header.number);
  return sheet;
}

/** Number formats by column kind (from the header row down). */
function formatColumns(
  sheet: import('exceljs').Worksheet,
  columns: readonly Column[],
  fromRow: number,
): void {
  columns.forEach((c, i) => {
    const col = sheet.getColumn(i + 1);
    col.eachCell((cell, rowNumber) => {
      if (rowNumber < fromRow) return;
      if (c.kind === 'money') cell.numFmt = EXCEL_MONEY;
      else if (c.kind === 'date') cell.numFmt = EXCEL_DATETIME;
      else if (c.kind === 'text') cell.numFmt = '@';
    });
  });
}

const BILL_COLUMNS: readonly Column[] = [
  { header: 'เลขที่บิล', width: 26, kind: 'text' },
  { header: 'วันที่-เวลา', width: 17, kind: 'date' },
  { header: 'สาขา', width: 8, branch: true },
  { header: 'เครื่อง POS', width: 24 },
  { header: 'POS ID', width: 16, kind: 'text' },
  { header: 'ลูกค้า', width: 24 },
  { header: 'พนักงาน', width: 18 },
  { header: 'จำนวนชิ้น', width: 9, kind: 'int' },
  { header: 'ยอดก่อนส่วนลด', width: 14, kind: 'money' },
  { header: 'ส่วนลดโปรสินค้า', width: 14, kind: 'money' },
  { header: 'ส่วนลดโปรท้ายบิล', width: 14, kind: 'money' },
  { header: 'ส่วนลดพิเศษ', width: 12, kind: 'money' },
  { header: 'ยอดสุทธิ', width: 14, kind: 'money' },
  { header: 'VAT', width: 12, kind: 'money' },
  { header: 'ปัดเศษ', width: 9, kind: 'money' },
  { header: 'เงินทอน', width: 11, kind: 'money' },
  { header: 'ชำระโดย', width: 26 },
  { header: 'ใบกำกับเต็มรูป', width: 22, kind: 'text' },
  { header: 'สถานะ', width: 10 },
  { header: 'เหตุผลยกเลิก', width: 24 },
  { header: 'คืนสินค้า', width: 11 },
  { header: 'ยอดลดหนี้', width: 12, kind: 'money' },
  { header: 'ใบลดหนี้', width: 22 },
  { header: 'เหตุผลส่วนลดพิเศษ', width: 22 },
  { header: 'ต้นทุนขาย', width: 13, kind: 'money', cost: true },
  { header: 'กำไรขั้นต้น', width: 13, kind: 'money', cost: true },
];

function addBillSheet(book: Workbook, opts: SalesExportOptions): void {
  const { kept, cells } = keep(BILL_COLUMNS, opts);
  const sheet = startSheet(book, 'บิล', 'บิลขาย', kept, opts);
  const first = sheet.rowCount + 1;
  for (const s of opts.sales) {
    sheet.addRow(
      cells([
        s.orderNo,
        excelDate(s.date),
        opts.branchCode(s.branchId),
        opts.terminalLabel(s.terminalId),
        s.posId ?? '',
        s.customer || 'ลูกค้าทั่วไป',
        s.cashier,
        s.itemCount,
        s.subtotal,
        s.itemDiscount,
        s.billDiscount,
        s.manualDiscount,
        s.total,
        s.vat,
        s.rounding,
        s.change,
        [...new Set(s.payments.map((p) => p.name))].join(', '),
        s.taxInvoiceNo ?? '',
        SALE_STATUS_LABEL[s.status],
        s.voidReason,
        RETURN_STATUS_LABEL[s.returnStatus],
        s.creditedTotal || null,
        s.creditNoteNos.join(', '),
        s.manualDiscountReason,
        billCogs(s),
        billProfit(s),
      ]),
    );
  }
  const live = opts.sales.filter((s) => s.status !== 'cancelled');
  const totals = sheet.addRow(
    cells([
      `รวม ${live.length} บิล (ไม่รวมบิลที่ยกเลิก)`,
      null,
      null,
      null,
      null,
      null,
      null,
      live.reduce((n, s) => n + s.itemCount, 0),
      sum(live.map((s) => s.subtotal)),
      sum(live.map((s) => s.itemDiscount)),
      sum(live.map((s) => s.billDiscount)),
      sum(live.map((s) => s.manualDiscount)),
      sum(live.map((s) => s.total)),
      sum(live.map((s) => s.vat)),
      sum(live.map((s) => s.rounding)),
      sum(live.map((s) => s.change)),
      null,
      null,
      null,
      null,
      null,
      sum(live.map((s) => s.creditedTotal)),
      null,
      null,
      sumKnown(live.map(billCogs)),
      sumKnown(live.map(billProfit)),
    ]),
  );
  totals.font = { bold: true };
  formatColumns(sheet, kept, first);
  totals.getCell(1).numFmt = '@';
}

const LINE_COLUMNS: readonly Column[] = [
  { header: 'เลขที่บิล', width: 26, kind: 'text' },
  { header: 'วันที่-เวลา', width: 17, kind: 'date' },
  { header: 'สาขา', width: 8, branch: true },
  { header: 'สถานะบิล', width: 10 },
  { header: 'ลำดับ', width: 6, kind: 'int' },
  { header: 'SKU', width: 16, kind: 'text' },
  { header: 'ชื่อสินค้า', width: 34 },
  { header: 'ประเภท', width: 8 },
  { header: 'ของแถม', width: 8 },
  { header: 'Serial', width: 18, kind: 'text' },
  { header: 'หน่วย', width: 8 },
  { header: 'จำนวน', width: 8 },
  { header: 'จำนวน (หน่วยฐาน)', width: 10 },
  { header: 'ราคา/หน่วย', width: 12, kind: 'money' },
  { header: 'ส่วนลดโปรสินค้า', width: 14, kind: 'money' },
  { header: 'ส่วนลดโปรท้ายบิล (ส่วนแบ่ง)', width: 16, kind: 'money' },
  { header: 'ส่วนลดพิเศษ', width: 12, kind: 'money' },
  { header: 'ยอดสุทธิ', width: 14, kind: 'money' },
  { header: 'VAT', width: 11, kind: 'money' },
  { header: 'ภาษี', width: 12 },
  { header: 'ต้นทุนขาย', width: 13, kind: 'money', cost: true },
  { header: 'กำไรขั้นต้น', width: 13, kind: 'money', cost: true },
];

function addLineSheet(book: Workbook, opts: SalesExportOptions): void {
  const { kept, cells } = keep(LINE_COLUMNS, opts);
  const sheet = startSheet(book, 'รายการสินค้า', 'รายการสินค้าในบิล', kept, opts);
  const first = sheet.rowCount + 1;
  for (const s of opts.sales) {
    s.lines.forEach((l, i) => {
      sheet.addRow(
        cells([
          s.orderNo,
          excelDate(s.date),
          opts.branchCode(s.branchId),
          SALE_STATUS_LABEL[s.status],
          i + 1,
          l.sku,
          l.name,
          ITEM_TYPE_LABEL[l.itemType],
          l.freeOfPromotionId !== null ? 'ใช่' : '',
          l.serial ?? '',
          l.unit,
          l.qty,
          l.qty * l.factor,
          l.unitPrice,
          l.itemDiscount,
          l.billDiscount,
          l.manualDiscount,
          l.amount,
          l.vat,
          VAT_TYPE_LABEL[l.vatType],
          l.cogs ?? 0,
          round2(l.amount - l.vat - (l.cogs ?? 0)),
        ]),
      );
    });
  }
  formatColumns(sheet, kept, first);
}

const PAYMENT_COLUMNS: readonly Column[] = [
  { header: 'เลขที่เอกสาร', width: 26, kind: 'text' },
  { header: 'วันที่-เวลา', width: 17, kind: 'date' },
  { header: 'สาขา', width: 8, branch: true },
  { header: 'รายการ', width: 18 },
  { header: 'สถานะบิล', width: 10 },
  { header: 'ช่องทาง', width: 22 },
  { header: 'ประเภท', width: 14 },
  { header: 'จำนวนเงิน', width: 14, kind: 'money' },
  { header: 'รับเงินมา', width: 14, kind: 'money' },
  { header: 'เงินทอน', width: 11, kind: 'money' },
  { header: 'เลขอนุมัติ / อ้างอิง', width: 20, kind: 'text' },
  { header: 'ผ่อน (เดือน)', width: 10 },
];

function addPaymentSheet(book: Workbook, opts: SalesExportOptions): void {
  const { kept, cells } = keep(PAYMENT_COLUMNS, opts);
  const sheet = startSheet(
    book,
    'การชำระเงิน',
    'การชำระเงิน (คืนเงินตามใบลดหนี้เป็นยอดติดลบ)',
    kept,
    opts,
  );
  const first = sheet.rowCount + 1;
  const row = (
    no: string,
    date: string,
    branchId: number | null | undefined,
    kind: string,
    status: string,
    p: SalePayment,
    sign: 1 | -1,
  ) =>
    sheet.addRow(
      cells([
        no,
        excelDate(date),
        opts.branchCode(branchId),
        kind,
        status,
        p.name,
        PAYMENT_TYPE_LABEL[p.type],
        sign * p.amount,
        sign === 1 ? p.tendered : null,
        sign === 1 && p.tendered > p.amount ? round2(p.tendered - p.amount) : null,
        p.reference,
        p.installmentMonths ?? '',
      ]),
    );
  for (const s of opts.sales) {
    for (const p of s.payments)
      row(s.orderNo, s.date, s.branchId, 'ขาย', SALE_STATUS_LABEL[s.status], p, 1);
  }
  for (const n of opts.creditNotes) {
    for (const p of n.refunds) row(n.cnNo, n.date, n.branchId, `คืนเงิน (${n.orderNo})`, '', p, -1);
  }
  formatColumns(sheet, kept, first);
}

const CREDIT_NOTE_COLUMNS: readonly Column[] = [
  { header: 'เลขที่ใบลดหนี้', width: 24, kind: 'text' },
  { header: 'วันที่-เวลา', width: 17, kind: 'date' },
  { header: 'สาขา', width: 8, branch: true },
  { header: 'อ้างอิงบิล', width: 26, kind: 'text' },
  { header: 'ใบกำกับอ้างอิง', width: 22, kind: 'text' },
  { header: 'วันที่ขาย', width: 17, kind: 'date' },
  { header: 'พนักงาน', width: 18 },
  { header: 'เหตุผล', width: 24 },
  { header: 'สินค้าที่รับคืน', width: 40 },
  { header: 'ยอดสินค้าคืน', width: 13, kind: 'money' },
  { header: 'หักของแถม', width: 12, kind: 'money' },
  { header: 'ยอดคืน', width: 13, kind: 'money' },
  { header: 'VAT', width: 11, kind: 'money' },
  { header: 'คืนเงินผ่าน', width: 24 },
];

function addCreditNoteSheet(book: Workbook, opts: SalesExportOptions): void {
  const { kept, cells } = keep(CREDIT_NOTE_COLUMNS, opts);
  const sheet = startSheet(book, 'ใบลดหนี้', 'ใบลดหนี้', kept, opts);
  const first = sheet.rowCount + 1;
  for (const n of opts.creditNotes) {
    sheet.addRow(
      cells([
        n.cnNo,
        excelDate(n.date),
        opts.branchCode(n.branchId),
        n.orderNo,
        n.taxInvoiceNo ?? '',
        excelDate(n.saleDate),
        n.cashier,
        n.reason,
        n.lines
          .map((l) => `${l.sku}${l.serial ? ` (${l.serial})` : ''} × ${l.qty} ${l.unit}`)
          .join(', '),
        n.subtotal,
        n.deduction,
        n.total,
        n.vat,
        [...new Set(n.refunds.map((p) => p.name))].join(', '),
      ]),
    );
  }
  const totals = sheet.addRow(
    cells([
      `รวม ${opts.creditNotes.length} ใบ`,
      ...Array<null>(8).fill(null),
      sum(opts.creditNotes.map((n) => n.subtotal)),
      sum(opts.creditNotes.map((n) => n.deduction)),
      sum(opts.creditNotes.map((n) => n.total)),
      sum(opts.creditNotes.map((n) => n.vat)),
      null,
    ]),
  );
  totals.font = { bold: true };
  formatColumns(sheet, kept, first);
  totals.getCell(1).numFmt = '@';
}
