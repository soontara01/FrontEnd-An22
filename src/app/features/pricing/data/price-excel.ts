import type { Workbook, Worksheet } from 'exceljs';
import {
  loadExcel,
  parseExcelDate,
  styleHeaderRow,
  thaiDateText,
  xlsxBlob,
} from '@shared/utils/excel';
import {
  Product,
  SkuPrice,
  SkuPricePayload,
  addDaysIso,
  formatDateRange,
  moneyInputError,
  priceStatus,
  rangesOverlap,
} from '@core/models';

/**
 * Excel (.xlsx) import/export of sale price periods: one row = one period of one SKU, matched by
 * SKU code + start date (a SKU's periods never overlap, so the start date names one). A new
 * period that starts inside an earlier one ends the earlier one the day before, when the new one
 * covers the rest of it. ExcelJS is loaded lazily, so it stays out of the menu chunk.
 */

type ColumnKey = 'sku' | 'name' | 'price' | 'startDate' | 'endDate' | 'note';

interface Column {
  key: ColumnKey;
  header: string;
  width: number;
  help: string;
  /** Reference only: grey header, ignored on import */
  info?: boolean;
  /** Written as text (codes, dates) so Excel never reformats them */
  text?: boolean;
}

const IMPORT_SHEET = 'นำเข้าราคา';

export const PRICE_COLUMNS: Column[] = [
  {
    key: 'sku',
    header: 'รหัส SKU*',
    width: 18,
    text: true,
    help: 'ใช้จับคู่ร่วมกับวันเริ่ม: SKU + วันเริ่มตรงกับช่วงที่มีอยู่ = แก้ไข, ไม่ตรง = เพิ่มช่วงใหม่',
  },
  {
    key: 'name',
    header: 'ชื่อสินค้า',
    width: 36,
    info: true,
    help: 'อ้างอิงเท่านั้น ไม่ถูกนำเข้า',
  },
  {
    key: 'price',
    header: 'ราคาขาย (รวม VAT)*',
    width: 16,
    help: 'บาท ทศนิยมไม่เกิน 2 ตำแหน่ง',
  },
  {
    key: 'startDate',
    header: 'วันเริ่ม*',
    width: 12,
    text: true,
    help: 'วัน/เดือน/ปี เช่น 1/12/2569 (ปี พ.ศ. หรือ ค.ศ.)',
  },
  {
    key: 'endDate',
    header: 'วันสิ้นสุด',
    width: 12,
    text: true,
    help: 'ว่าง = ไม่กำหนดวันสิ้นสุด · วันสุดท้ายที่ราคานี้ยังใช้',
  },
  { key: 'note', header: 'หมายเหตุ', width: 28, help: '' },
];

function importSheet(workbook: Workbook): Worksheet {
  const sheet = workbook.addWorksheet(IMPORT_SHEET);
  sheet.columns = PRICE_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    style: c.text ? { numFmt: '@' } : {},
  }));
  const infoCols = new Set(PRICE_COLUMNS.flatMap((c, i) => (c.info ? [i + 1] : [])));
  styleHeaderRow(sheet, infoCols);
  return sheet;
}

function helpSheet(workbook: Workbook, extraNote = ''): void {
  const help = workbook.addWorksheet('คำอธิบาย');
  help.columns = [
    { header: 'คอลัมน์', key: 'header', width: 22 },
    { header: 'คำอธิบาย', key: 'help', width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  PRICE_COLUMNS.forEach((c) => help.addRow({ header: c.header, help: c.help }));
  help.addRow({});
  help.addRow({
    header: 'หมายเหตุ',
    help:
      '* = จำเป็น · แก้ไขช่วงเดิม: ใช้ค่าตามไฟล์ทุกช่อง (วันสิ้นสุดว่าง = ไม่กำหนด) · ' +
      'ช่วงราคาของ SKU เดียวกันห้ามทับกัน — ราคาใหม่ที่เริ่มระหว่างช่วงเดิม จะปิดช่วงเดิมให้วันก่อนวันเริ่ม ' +
      'เมื่อราคาใหม่ครอบคลุมส่วนที่เหลือของช่วงเดิม · ไม่ลบช่วงราคา' +
      extraNote,
  });
}

function skuSheet(workbook: Workbook, products: readonly Product[]): void {
  const sheet = workbook.addWorksheet('SKU');
  sheet.columns = [
    { header: 'รหัส SKU', key: 'sku', width: 18 },
    { header: 'ชื่อ', key: 'name', width: 44 },
    { header: 'ราคาวันนี้', key: 'price', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  [...products]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .forEach((p) => sheet.addRow({ sku: p.sku, name: p.name, price: p.currentPrice ?? '' }));
}

/** Periods in effect today or later (expired ones are history), by SKU then start date. */
export async function exportPricesToExcel(
  prices: readonly SkuPrice[],
  products: readonly Product[],
  today: string,
): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  const sheet = importSheet(workbook);
  const productOf = new Map(products.map((p) => [p.id, p]));
  prices
    .filter((p) => priceStatus(p, today) !== 'expired' && productOf.has(p.productId))
    .map((p) => ({ price: p, product: productOf.get(p.productId)! }))
    .sort(
      (a, b) =>
        a.product.sku.localeCompare(b.product.sku) ||
        a.price.startDate.localeCompare(b.price.startDate),
    )
    .forEach(({ price, product }) =>
      sheet.addRow({
        sku: product.sku,
        name: product.name,
        price: price.price,
        startDate: thaiDateText(price.startDate),
        endDate: thaiDateText(price.endDate),
        note: price.note,
      }),
    );
  helpSheet(workbook);
  skuSheet(workbook, products);
  return xlsxBlob(await workbook.xlsx.writeBuffer());
}

/** Import template: example rows, column help and the SKU codes. */
export async function buildPriceTemplate(products: readonly Product[]): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  const sheet = importSheet(workbook);
  const [first, second] = [...products].sort((a, b) => a.sku.localeCompare(b.sku));
  const example = (p: Product | undefined, fallback: string) => ({
    sku: p?.sku ?? fallback,
    name: p?.name ?? '',
  });
  sheet.addRow({
    ...example(first, 'SKU-001'),
    price: 990,
    startDate: '1/12/2569',
    note: 'ตัวอย่าง: ราคาใหม่ (ราคาเดิมปิด 30/11/2569 ให้อัตโนมัติ)',
  });
  sheet.addRow({
    ...example(second, 'SKU-002'),
    price: 1290,
    startDate: '1/1/2570',
    endDate: '',
    note: 'ตัวอย่าง: ตั้งราคาล่วงหน้า',
  });
  for (const rowNo of [2, 3]) {
    sheet.getRow(rowNo).font = { italic: true, color: { argb: 'FF757575' } };
  }
  helpSheet(workbook, ' · ลบแถวตัวอย่างก่อนนำเข้า');
  skuSheet(workbook, products);
  return xlsxBlob(await workbook.xlsx.writeBuffer());
}

/** Raw cell per column key (text, or a Date for an Excel date cell), plus the row number. */
export type PriceRawRow = Partial<Record<ColumnKey, string | Date>> & { rowNo: number };

/** Reads the import sheet; columns are matched by header text. Empty rows are skipped. */
export async function readPriceRows(file: File): Promise<PriceRawRow[]> {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer()).catch(() => {
    throw new Error('อ่านไฟล์ไม่สำเร็จ (ต้องเป็น .xlsx)');
  });
  const sheet = workbook.getWorksheet(IMPORT_SHEET) ?? workbook.worksheets[0];
  if (!sheet) throw new Error('ไม่พบชีตในไฟล์');

  const columnOf = new Map<number, ColumnKey>();
  sheet.getRow(1).eachCell((cell, col) => {
    const text = cell.text.trim();
    const match = PRICE_COLUMNS.find(
      (c) => !c.info && (c.header === text || c.header.replaceAll('*', '') === text),
    );
    if (match) columnOf.set(col, match.key);
  });
  if (![...columnOf.values()].includes('sku')) {
    throw new Error('ไม่พบคอลัมน์ "รหัส SKU" — กรุณาใช้ไฟล์จากปุ่มดาวน์โหลดแม่แบบ');
  }

  const rows: PriceRawRow[] = [];
  sheet.eachRow((row, rowNo) => {
    if (rowNo === 1) return;
    const raw: PriceRawRow = { rowNo };
    columnOf.forEach((key, col) => {
      const cell = row.getCell(col);
      if (cell.value instanceof Date) raw[key] = cell.value;
      else {
        const text = cell.text.trim();
        if (text) raw[key] = text;
      }
    });
    if (Object.keys(raw).length > 1) rows.push(raw);
  });
  return rows;
}

/** `unchanged`: the period exists and the row says what is already saved — nothing to send. */
export type PriceImportAction = 'create' | 'update' | 'unchanged' | 'error';

/** An existing period ended early so a new one fits after it. */
export interface PriceClose {
  id: number;
  payload: SkuPricePayload;
  /** e.g. '฿24,900 (1 ก.ค. 2569 – ไม่กำหนด) ถึง 30/11/2569' */
  label: string;
}

export interface PriceImportRow {
  rowNo: number;
  sku: string;
  name: string;
  action: PriceImportAction;
  errors: string[];
  /** null when the row could not be read */
  payload: SkuPricePayload | null;
  /** Matched existing period (update) */
  existingId?: number;
  /** Stored periods to end first (PUT) before this row is saved */
  closes: PriceClose[];
  /** This row's own end date was moved to make room for a later row */
  closedFor?: string;
}

const text = (v: string | Date | undefined): string => (typeof v === 'string' ? v.trim() : '');

/** One period of a SKU while the plan is worked out. */
interface Slot {
  startDate: string;
  endDate: string | null;
  price: number;
  stored?: SkuPrice;
  row?: PriceImportRow;
}

const endOf = (s: Pick<Slot, 'endDate'>) => s.endDate ?? '9999-12-31';
const rangeText = (p: Pick<SkuPrice, 'price' | 'startDate' | 'endDate'>) =>
  `฿${p.price.toLocaleString('en-US')} (${formatDateRange(p)})`;

/** Reads one row; problems go into `errors`. */
function rowPayload(
  raw: PriceRawRow,
  products: readonly Product[],
  errors: string[],
): SkuPricePayload | null {
  const sku = text(raw.sku);
  const product = products.find((p) => p.sku.toUpperCase() === sku.toUpperCase());
  if (!sku) errors.push('กรุณากรอกรหัส SKU');
  else if (!product) errors.push(`ไม่พบ SKU ${sku}`);

  const priceText = text(raw.price).replaceAll(',', '');
  const price = priceText ? Number(priceText) : null;
  const priceProblem = moneyInputError(price, 'ราคา');
  if (priceProblem) errors.push(priceProblem);

  const startDate = parseExcelDate(raw.startDate);
  if (startDate === undefined) errors.push('กรุณากรอกวันเริ่ม');
  if (startDate === null) errors.push('วันเริ่ม ไม่ใช่วันที่ (วัน/เดือน/ปี เช่น 1/12/2569)');
  const endDate = parseExcelDate(raw.endDate);
  if (endDate === null) errors.push('วันสิ้นสุด ไม่ใช่วันที่ (วัน/เดือน/ปี เช่น 1/12/2569)');
  if (startDate && endDate && endDate < startDate) {
    errors.push('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
  }

  if (!product || price === null || priceProblem || !startDate || errors.length) return null;
  return {
    productId: product.id,
    price,
    startDate,
    endDate: endDate ?? null,
    note: text(raw.note),
  };
}

/**
 * Validates spreadsheet rows against the saved periods with the server's rules (price, dates,
 * no overlap within a SKU) and plans the periods to end early: a new or changed period B ends an
 * earlier period A at B's start − 1 when A overlaps B but does not run past B's end, and A is a
 * saved period the file leaves as it is. Any other overlap is an error on the row.
 */
export function validatePriceRows(
  rows: PriceRawRow[],
  products: readonly Product[],
  prices: readonly SkuPrice[],
): PriceImportRow[] {
  const results = rows.map((raw): PriceImportRow => {
    const errors: string[] = [];
    const payload = rowPayload(raw, products, errors);
    const product = payload && products.find((p) => p.id === payload.productId);
    return {
      rowNo: raw.rowNo,
      sku: product?.sku ?? text(raw.sku).toUpperCase(),
      name: product?.name ?? '',
      action: errors.length ? 'error' : 'create',
      errors,
      payload,
      closes: [],
    };
  });

  const byProduct = new Map<number, PriceImportRow[]>();
  for (const row of results) {
    if (!row.payload) continue;
    const list = byProduct.get(row.payload.productId) ?? [];
    byProduct.set(row.payload.productId, [...list, row]);
  }

  for (const [productId, own] of byProduct) {
    const starts = new Map<string, number>();
    own.forEach((r) =>
      starts.set(r.payload!.startDate, (starts.get(r.payload!.startDate) ?? 0) + 1),
    );
    for (const row of own) {
      if (starts.get(row.payload!.startDate)! > 1) {
        row.errors.push(
          `วันเริ่ม ${thaiDateText(row.payload!.startDate)} ซ้ำในไฟล์ (SKU เดียวกัน)`,
        );
      }
    }

    const slots: Slot[] = prices
      .filter((p) => p.productId === productId)
      .map((p) => ({ startDate: p.startDate, endDate: p.endDate, price: p.price, stored: p }));
    for (const row of own) {
      if (row.errors.length) continue;
      const p = row.payload!;
      const slot = slots.find((s) => s.stored && s.startDate === p.startDate);
      if (slot) {
        Object.assign(slot, { endDate: p.endDate, price: p.price, row });
        row.existingId = slot.stored!.id;
      } else {
        slots.push({ startDate: p.startDate, endDate: p.endDate, price: p.price, row });
      }
    }
    slots.sort((a, b) => a.startDate.localeCompare(b.startDate));

    for (const b of [...slots]) {
      if (!b.row) continue;
      // A later row of the file is checked on its own turn (it may end this one).
      const overlapping = slots.filter(
        (a) => a !== b && rangesOverlap(a, b) && !(a.row && a.startDate > b.startDate),
      );
      const closable = (a: Slot) =>
        a.stored &&
        a.startDate < b.startDate &&
        endOf(a) <= endOf(b) &&
        // the file does not set this period's end itself
        (!a.row || a.endDate === a.stored.endDate);
      const blocker = overlapping.find((a) => !closable(a));
      if (blocker) {
        b.row.errors.push(`ช่วงวันที่ทับกับราคา ${rangeText(blocker.stored ?? blocker)}`);
        // Leave the slot as stored (or drop a new one) so later rows see what will be there.
        if (b.stored) Object.assign(b, { endDate: b.stored.endDate, price: b.stored.price });
        else slots.splice(slots.indexOf(b), 1);
        continue;
      }
      for (const a of overlapping) {
        const stored = a.stored!;
        a.endDate = addDaysIso(b.startDate, -1);
        const label = `${rangeText(stored)} ถึง ${thaiDateText(a.endDate)}`;
        if (a.row) {
          a.row.payload = { ...a.row.payload!, endDate: a.endDate };
          a.row.closedFor = `ปิดช่วงนี้ถึง ${thaiDateText(a.endDate)} ให้ราคาแถว ${b.row.rowNo}`;
        } else {
          b.row.closes.push({
            id: stored.id,
            payload: {
              productId,
              price: stored.price,
              startDate: stored.startDate,
              endDate: a.endDate,
              note: stored.note,
            },
            label,
          });
        }
      }
    }
  }

  const storedById = new Map(prices.map((p) => [p.id, p]));
  for (const row of results) {
    if (row.errors.length) {
      row.action = 'error';
      row.closes = [];
      continue;
    }
    const stored = row.existingId === undefined ? undefined : storedById.get(row.existingId);
    const p = row.payload!;
    row.action = !stored
      ? 'create'
      : stored.price === p.price && stored.endDate === p.endDate && stored.note === p.note
        ? 'unchanged'
        : 'update';
  }
  return results;
}

/** Rows to send, earlier periods first, so an end moved by the file is saved before its successor. */
export const saveOrder = (rows: readonly PriceImportRow[]): PriceImportRow[] =>
  rows
    .filter((r) => r.action === 'create' || r.action === 'update')
    .sort(
      (a, b) =>
        a.payload!.productId - b.payload!.productId ||
        a.payload!.startDate.localeCompare(b.payload!.startDate),
    );
