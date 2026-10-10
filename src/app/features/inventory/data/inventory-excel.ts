import type { Workbook } from 'exceljs';
import {
  Product,
  SKU_STATUS_LABEL,
  SerialNumber,
  StockLevel,
  costValue,
  stockInPacks,
  stockLevel,
} from '@core/models';
import { loadExcel, styleHeaderRow, xlsxBlob } from '@shared/utils/excel';

export const STOCK_LEVEL_LABEL: Record<StockLevel, string> = {
  ok: 'ปกติ',
  low: 'ใกล้หมด',
  out: 'หมด',
};

const COLUMNS = [
  { header: 'SKU', width: 16 },
  { header: 'บาร์โค้ด', width: 16 },
  { header: 'ชื่อสินค้า', width: 36 },
  { header: 'หมวดหมู่', width: 30 },
  { header: 'หน่วย', width: 8 },
  { header: 'Serial', width: 8 },
  { header: 'สถานะสินค้า', width: 14 },
  { header: 'คงเหลือ', width: 10 },
  { header: 'คงเหลือตามแพ็ค', width: 18 },
  { header: 'จุดสั่งซื้อ', width: 10 },
  { header: 'สถานะสต็อก', width: 11 },
  { header: 'ต้นทุนเฉลี่ย', width: 13 },
  { header: 'มูลค่าทุน', width: 14 },
  { header: 'ราคาขาย', width: 12 },
  { header: 'มูลค่าตามราคาขาย', width: 16 },
];

/** 1-based columns with baht amounts. */
const MONEY_COLS = [12, 13, 14, 15];

const SERIAL_COLUMNS = [
  { header: 'ลำดับ', width: 7 },
  { header: 'SKU', width: 16 },
  { header: 'ชื่อสินค้า', width: 36 },
  { header: 'Serial', width: 24 },
  { header: 'ต้นทุน', width: 14 },
  { header: 'วันที่รับเข้า', width: 17 },
  { header: 'หมายเหตุ', width: 30 },
];

/**
 * Excel snapshot of the inventory list (the rows given, e.g. the page's filtered rows): stock per
 * SKU valued at actual cost (`costValue()`) and at today's sale price, with a totals row. In-stock
 * `serials` of those SKUs go on a second sheet (one row per unit, at its own cost).
 */
export async function inventoryXlsx(
  products: readonly Product[],
  serials: readonly SerialNumber[] = [],
  at = new Date(),
): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const book = new ExcelJS.Workbook();
  const when = new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'short' }).format(
    at,
  );
  addStockSheet(book, products, when);
  const inStock = serials.filter((s) => s.status === 'in_stock');
  if (inStock.length) addSerialSheet(book, products, inStock, when);
  return xlsxBlob(await book.xlsx.writeBuffer());
}

function addStockSheet(book: Workbook, products: readonly Product[], when: string): void {
  const sheet = book.addWorksheet('คลังสินค้า');
  sheet.columns = COLUMNS.map((c) => ({ width: c.width }));
  sheet.addRow([`สต็อกคงเหลือ ณ ${when}`]).font = { bold: true, size: 14 };
  sheet.addRow([]);
  const headerRow = sheet.addRow(COLUMNS.map((c) => c.header));
  styleHeaderRow(sheet, new Set(), headerRow.number);

  for (const p of products) {
    const row = sheet.addRow([
      p.sku,
      p.barcode,
      p.name,
      p.categoryPath,
      p.unit,
      p.serialControl ? 'ใช่' : '',
      SKU_STATUS_LABEL[p.saleStatus],
      p.stock,
      p.packUnits.length && p.stock ? stockInPacks(p) : '',
      p.minStock,
      STOCK_LEVEL_LABEL[stockLevel(p)],
      p.avgCost,
      costValue(p),
      p.currentPrice,
      (p.currentPrice ?? 0) * p.stock,
    ]);
    row.getCell(1).numFmt = '@';
    row.getCell(2).numFmt = '@';
  }

  const totals = sheet.addRow([
    null,
    null,
    `รวม ${products.length} รายการ`,
    ...Array<null>(9).fill(null),
    products.reduce((sum, p) => sum + costValue(p), 0),
    null,
    products.reduce((sum, p) => sum + (p.currentPrice ?? 0) * p.stock, 0),
  ]);
  totals.font = { bold: true };
  for (const col of MONEY_COLS) {
    sheet.getColumn(col).eachCell((cell, rowNumber) => {
      if (rowNumber > headerRow.number) cell.numFmt = '#,##0.00';
    });
  }
  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `1:${headerRow.number}`,
  };
}

function addSerialSheet(
  book: Workbook,
  products: readonly Product[],
  serials: readonly SerialNumber[],
  when: string,
): void {
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows = serials
    .map((s) => ({ s, p: byId.get(s.productId) }))
    .sort(
      (a, b) =>
        (a.p?.sku ?? '').localeCompare(b.p?.sku ?? '') || a.s.serial.localeCompare(b.s.serial),
    );

  const sheet = book.addWorksheet('Serial');
  sheet.columns = SERIAL_COLUMNS.map((c) => ({ width: c.width }));
  sheet.addRow([`Serial คงคลัง ณ ${when}`]).font = { bold: true, size: 14 };
  sheet.addRow([]);
  const headerRow = sheet.addRow(SERIAL_COLUMNS.map((c) => c.header));
  styleHeaderRow(sheet, new Set(), headerRow.number);

  rows.forEach(({ s, p }, i) => {
    const row = sheet.addRow([
      i + 1,
      p?.sku ?? '',
      p?.name ?? '',
      s.serial,
      s.cost,
      new Date(s.receivedAt),
      s.note,
    ]);
    row.getCell(2).numFmt = '@';
    row.getCell(4).numFmt = '@';
    row.getCell(5).numFmt = '#,##0.00';
    row.getCell(6).numFmt = 'dd/mm/yyyy hh:mm';
  });

  const totals = sheet.addRow([
    null,
    null,
    `รวม ${rows.length} เครื่อง`,
    null,
    rows.reduce((sum, r) => sum + r.s.cost, 0),
  ]);
  totals.font = { bold: true };
  totals.getCell(5).numFmt = '#,##0.00';
  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `1:${headerRow.number}`,
  };
}
