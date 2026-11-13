import type { Workbook, Worksheet } from 'exceljs';
import {
  loadExcel,
  parseExcelDate,
  styleHeaderRow,
  thaiDateText,
  xlsxBlob,
} from '@shared/utils/excel';
import {
  Branch,
  Category,
  DiscountKind,
  PROMOTION_DEFAULTS,
  PROMOTION_TYPE_LABEL,
  Product,
  Promotion,
  PromotionPayload,
  PromotionType,
  categoryPath,
  promotionBranchScopeError,
  promotionError,
} from '@core/models';

/**
 * Excel (.xlsx) import/export of promotions: one row = one promotion, lists (SKUs, categories,
 * free goods, branches) in one cell separated by commas. Every cell is taken as written (a blank
 * end date = open-ended), so the export is the full state of each promotion. ExcelJS is loaded
 * lazily, so it stays out of the menu chunk.
 */

type ColumnKey =
  | 'code'
  | 'name'
  | 'type'
  | 'startDate'
  | 'endDate'
  | 'enabled'
  | 'priority'
  | 'stackable'
  | 'scopeAll'
  | 'productCodes'
  | 'categoryCodes'
  | 'minQty'
  | 'minAmount'
  | 'discountKind'
  | 'discountValue'
  | 'maxDiscount'
  | 'freeItems'
  | 'repeat'
  | 'maxSets'
  | 'branchCodes'
  | 'note';

interface Column {
  key: ColumnKey;
  header: string;
  width: number;
  help: string;
  /** Written as text (codes, dates) so Excel never reformats them */
  text?: boolean;
}

const IMPORT_SHEET = 'นำเข้าโปรโมชั่น';
const DISCOUNT_KIND_TEXT: Record<DiscountKind, string> = { percent: '%', amount: 'บาท' };

export const PROMOTION_COLUMNS: Column[] = [
  {
    key: 'code',
    header: 'รหัสโปร*',
    width: 16,
    text: true,
    help: 'A-Z, 0-9, - ไม่เกิน 30 ตัว (ใช้จับคู่: มีแล้ว = แก้ไข, ยังไม่มี = เพิ่มใหม่)',
  },
  { key: 'name', header: 'ชื่อโปรโมชั่น*', width: 32, help: 'ชื่อที่แสดงในหน้าจอขาย' },
  {
    key: 'type',
    header: 'ประเภท*',
    width: 14,
    help: Object.values(PROMOTION_TYPE_LABEL).join(' / '),
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
    help: 'ว่าง = ไม่กำหนดวันสิ้นสุด · วันสุดท้ายที่ยังใช้ได้',
  },
  { key: 'enabled', header: 'เปิดใช้งาน (Y/N)', width: 12, help: 'ว่าง = Y' },
  {
    key: 'priority',
    header: 'ลำดับความสำคัญ',
    width: 12,
    help: 'จำนวนเต็ม 0 - 999 (ว่าง = 0) มากกว่าได้ก่อน',
  },
  {
    key: 'stackable',
    header: 'รวมกับโปรอื่น (Y/N)',
    width: 14,
    help: 'Y = ใช้ร่วมกับโปรอื่นในสินค้า/บิลเดียวกันได้ (ว่าง = N)',
  },
  {
    key: 'scopeAll',
    header: 'ทุกสินค้า (Y/N)',
    width: 12,
    help: 'Y = สินค้าทุกรายการร่วมรายการ (ว่าง = N) · ไม่ใช้กับลดท้ายบิล',
  },
  {
    key: 'productCodes',
    header: 'SKU ร่วมรายการ',
    width: 28,
    text: true,
    help: 'รหัส SKU คั่นด้วย , เช่น NB-001, NB-002 · ไม่ใช้กับลดท้ายบิล',
  },
  {
    key: 'categoryCodes',
    header: 'หมวดร่วมรายการ',
    width: 22,
    text: true,
    help: 'รหัสหมวดหมู่คั่นด้วย , (หมวดแม่ครอบคลุมทุกหมวดข้างใต้) · ไม่ใช้กับลดท้ายบิล',
  },
  {
    key: 'minQty',
    header: 'จำนวนขั้นต่ำ',
    width: 12,
    help: 'ลดราคาสินค้า: ชิ้นต่อรายการ (ว่าง = 1) · ของแถม: ชิ้นที่ต้องซื้อต่อชุด (ว่าง = 0 ใช้ยอดซื้อแทน)',
  },
  {
    key: 'minAmount',
    header: 'ยอดขั้นต่ำ (บาท)',
    width: 14,
    help: 'ลดท้ายบิล: ยอดบิลขั้นต่ำ · ของแถม: ยอดซื้อสินค้าร่วมรายการต่อชุด (ว่าง = 0)',
  },
  {
    key: 'discountKind',
    header: 'ชนิดส่วนลด',
    width: 10,
    help: '% หรือ บาท · เฉพาะลดราคาสินค้า / ลดท้ายบิล',
  },
  {
    key: 'discountValue',
    header: 'ส่วนลด',
    width: 10,
    help: 'ลดราคาสินค้า = ต่อชิ้น, ลดท้ายบิล = ต่อบิล',
  },
  {
    key: 'maxDiscount',
    header: 'เพดานส่วนลด (บาท)',
    width: 14,
    help: 'เฉพาะส่วนลด % (ว่าง = ไม่จำกัด)',
  },
  {
    key: 'freeItems',
    header: 'ของแถม',
    width: 28,
    text: true,
    help: 'เฉพาะโปรของแถม: รหัส SKU:จำนวน คั่นด้วย , เช่น SV-SETUP:1, MS-001:2 (ไม่ใส่จำนวน = 1)',
  },
  {
    key: 'repeat',
    header: 'แถมทวีคูณ (Y/N)',
    width: 12,
    help: 'Y = ซื้อครบทุกชุดได้แถมทุกชุด (ว่าง = N)',
  },
  {
    key: 'maxSets',
    header: 'ชุดสูงสุดต่อบิล',
    width: 12,
    help: 'จำนวนเต็ม ≥ 1 (ว่าง = ไม่จำกัด)',
  },
  {
    key: 'branchCodes',
    header: 'สาขา',
    width: 16,
    text: true,
    help: 'รหัสสาขาคั่นด้วย , (ว่าง = ทุกสาขา) · จำกัดสาขาได้เฉพาะผู้ดูแลระบบระดับบริษัท',
  },
  { key: 'note', header: 'หมายเหตุ', width: 28, help: 'แก้ได้เสมอ' },
];

export interface PromotionExcelContext {
  products: readonly Product[];
  categories: readonly Category[];
  branches: readonly Branch[];
}

function importSheet(workbook: Workbook): Worksheet {
  const sheet = workbook.addWorksheet(IMPORT_SHEET);
  sheet.columns = PROMOTION_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    style: c.text ? { numFmt: '@' } : {},
  }));
  styleHeaderRow(sheet);
  return sheet;
}

function helpSheet(workbook: Workbook, extraNote = ''): void {
  const help = workbook.addWorksheet('คำอธิบาย');
  help.columns = [
    { header: 'คอลัมน์', key: 'header', width: 22 },
    { header: 'คำอธิบาย', key: 'help', width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  PROMOTION_COLUMNS.forEach((c) => help.addRow({ header: c.header, help: c.help }));
  help.addRow({});
  help.addRow({
    header: 'หมายเหตุ',
    help:
      '* = จำเป็น · ทุกช่องใช้ค่าตามไฟล์ (แก้ไขโปรเดิมให้กรอกครบทั้งแถว — ใช้ไฟล์จากปุ่มส่งออกได้) · ' +
      'โปรที่เริ่มแล้วแก้ได้เฉพาะวันสิ้นสุด (ให้เร็วขึ้น) เปิดใช้งาน และหมายเหตุ · ไม่ลบโปร' +
      extraNote,
  });
}

function referenceSheets(workbook: Workbook, ctx: PromotionExcelContext): void {
  const add = (name: string, columns: { header: string; key: string; width: number }[]) => {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = columns;
    sheet.getRow(1).font = { bold: true };
    return sheet;
  };
  const skus = add('SKU', [
    { header: 'รหัส SKU', key: 'sku', width: 18 },
    { header: 'ชื่อ', key: 'name', width: 44 },
  ]);
  [...ctx.products]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .forEach((p) => skus.addRow({ sku: p.sku, name: p.name }));
  const cats = add('หมวดหมู่', [
    { header: 'รหัสหมวดหมู่', key: 'code', width: 18 },
    { header: 'หมวดหมู่', key: 'path', width: 44 },
  ]);
  [...ctx.categories]
    .sort((a, b) => a.code.localeCompare(b.code))
    .forEach((c) => cats.addRow({ code: c.code, path: categoryPath(ctx.categories, c.id) }));
  const branches = add('สาขา', [
    { header: 'รหัสสาขา', key: 'code', width: 14 },
    { header: 'ชื่อ', key: 'name', width: 32 },
  ]);
  ctx.branches.forEach((b) => branches.addRow({ code: b.code, name: b.name }));
}

const yn = (b: boolean) => (b ? 'Y' : 'N');

/** One promotion as a sheet row (ids → codes; an id that no longer resolves stays `#id`). */
function exportRow(p: Promotion, ctx: PromotionExcelContext): Record<ColumnKey, string | number> {
  const sku = new Map(ctx.products.map((x) => [x.id, x.sku]));
  const cat = new Map(ctx.categories.map((x) => [x.id, x.code]));
  const branch = new Map(ctx.branches.map((x) => [x.id, x.code]));
  const codes = (ids: number[], map: Map<number, string>) =>
    ids.map((id) => map.get(id) ?? `#${id}`).join(', ');
  const isBill = p.type === 'bill_discount';
  return {
    code: p.code,
    name: p.name,
    type: PROMOTION_TYPE_LABEL[p.type],
    startDate: thaiDateText(p.startDate),
    endDate: thaiDateText(p.endDate),
    enabled: yn(p.enabled),
    priority: p.priority,
    stackable: yn(p.stackable),
    scopeAll: isBill ? '' : yn(p.scope.all),
    productCodes: isBill ? '' : codes(p.scope.productIds, sku),
    categoryCodes: isBill ? '' : codes(p.scope.categoryIds, cat),
    minQty: p.minQty,
    minAmount: p.minAmount,
    discountKind: p.discount ? DISCOUNT_KIND_TEXT[p.discount.kind] : '',
    discountValue: p.discount?.value ?? '',
    maxDiscount: p.discount?.maxDiscount ?? '',
    freeItems: p.freeGoods
      ? p.freeGoods.items
          .map((i) => `${sku.get(i.productId) ?? `#${i.productId}`}:${i.qty}`)
          .join(', ')
      : '',
    repeat: p.freeGoods ? yn(p.freeGoods.repeat) : '',
    maxSets: p.freeGoods?.maxSets ?? '',
    branchCodes: codes(p.branchIds ?? [], branch),
    note: p.note,
  };
}

/** Every promotion in the import format: edit it and upload it back. */
export async function exportPromotionsToExcel(
  promotions: readonly Promotion[],
  ctx: PromotionExcelContext,
): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  const sheet = importSheet(workbook);
  [...promotions]
    .sort((a, b) => a.code.localeCompare(b.code))
    .forEach((p) => sheet.addRow(exportRow(p, ctx)));
  helpSheet(workbook);
  referenceSheets(workbook, ctx);
  return xlsxBlob(await workbook.xlsx.writeBuffer());
}

/** Import template: one example per type, column help and the codes that exist. */
export async function buildPromotionTemplate(ctx: PromotionExcelContext): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  const sheet = importSheet(workbook);
  const sku = [...ctx.products].sort((a, b) => a.sku.localeCompare(b.sku))[0]?.sku ?? 'SKU-001';
  const cat = ctx.categories[0]?.code ?? 'IT';
  sheet.addRow({
    code: 'EX-ITEM',
    name: 'ตัวอย่าง: ลด 10% สูงสุด 500 บาท',
    type: PROMOTION_TYPE_LABEL.item_discount,
    startDate: '1/12/2569',
    endDate: '31/12/2569',
    productCodes: sku,
    categoryCodes: cat,
    minQty: 1,
    discountKind: '%',
    discountValue: 10,
    maxDiscount: 500,
  });
  sheet.addRow({
    code: 'EX-BILL',
    name: 'ตัวอย่าง: ซื้อครบ 5,000 ลด 200',
    type: PROMOTION_TYPE_LABEL.bill_discount,
    startDate: '1/12/2569',
    minAmount: 5000,
    discountKind: 'บาท',
    discountValue: 200,
  });
  sheet.addRow({
    code: 'EX-FREE',
    name: 'ตัวอย่าง: ซื้อ 2 แถม 1',
    type: PROMOTION_TYPE_LABEL.free_goods,
    startDate: '1/12/2569',
    endDate: '31/1/2570',
    productCodes: sku,
    minQty: 2,
    freeItems: `${sku}:1`,
    repeat: 'Y',
    maxSets: 3,
  });
  for (const rowNo of [2, 3, 4]) {
    sheet.getRow(rowNo).font = { italic: true, color: { argb: 'FF757575' } };
  }
  helpSheet(workbook, ' · ลบแถวตัวอย่างก่อนนำเข้า');
  referenceSheets(workbook, ctx);
  return xlsxBlob(await workbook.xlsx.writeBuffer());
}

/** Raw cell per column key (text, or a Date for an Excel date cell), plus the row number. */
export type PromotionRawRow = Partial<Record<ColumnKey, string | Date>> & { rowNo: number };

/** Reads the import sheet; columns are matched by header text. Empty rows are skipped. */
export async function readPromotionRows(file: File): Promise<PromotionRawRow[]> {
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
    const match = PROMOTION_COLUMNS.find(
      (c) => c.header === text || c.header.replaceAll('*', '') === text,
    );
    if (match) columnOf.set(col, match.key);
  });
  if (![...columnOf.values()].includes('code')) {
    throw new Error('ไม่พบคอลัมน์ "รหัสโปร" — กรุณาใช้ไฟล์จากปุ่มดาวน์โหลดแม่แบบ');
  }

  const rows: PromotionRawRow[] = [];
  sheet.eachRow((row, rowNo) => {
    if (rowNo === 1) return;
    const raw: PromotionRawRow = { rowNo };
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

/** `unchanged`: the code exists and the row says what is already saved — nothing to send. */
export type PromotionImportAction = 'create' | 'update' | 'unchanged' | 'error';

export interface PromotionImportRow {
  rowNo: number;
  code: string;
  name: string;
  type: PromotionType | null;
  action: PromotionImportAction;
  errors: string[];
  /** null when the row could not be read */
  payload: PromotionPayload | null;
  /** Matched existing promotion (update) */
  existingId?: number;
}

export interface PromotionValidationContext extends PromotionExcelContext {
  promotions: readonly Promotion[];
  today: string;
  /** Only company admins limit a promotion to branches (E6) */
  isCompanyAdmin: boolean;
}

/** Stable JSON (sorted keys at every level), to tell an unchanged row. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

const samePromotion = (payload: PromotionPayload, existing: Promotion): boolean => {
  const stored: Partial<Promotion> = { ...PROMOTION_DEFAULTS, ...existing };
  delete stored.id;
  return stableJson(payload) === stableJson(stored);
};

const text = (v: string | Date | undefined): string => (typeof v === 'string' ? v.trim() : '');
const list = (v: string | Date | undefined): string[] =>
  text(v)
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Reads one row into a payload; problems go into `errors`. */
function rowPayload(
  raw: PromotionRawRow,
  ctx: PromotionValidationContext,
  errors: string[],
): PromotionPayload | null {
  const typeText = text(raw.type);
  const type = (Object.keys(PROMOTION_TYPE_LABEL) as PromotionType[]).find(
    (t) => PROMOTION_TYPE_LABEL[t] === typeText || t === typeText,
  );
  if (!type) {
    errors.push(
      typeText
        ? `ประเภท "${typeText}" ไม่ถูกต้อง (${Object.values(PROMOTION_TYPE_LABEL).join(' / ')})`
        : 'กรุณากรอกประเภท',
    );
  }

  const flag = (key: ColumnKey, label: string, blank: boolean): boolean => {
    const v = text(raw[key]).toUpperCase();
    if (!v) return blank;
    if (v !== 'Y' && v !== 'N') errors.push(`${label} ต้องเป็น Y หรือ N`);
    return v === 'Y';
  };
  const num = (key: ColumnKey, label: string): number | null => {
    const v = text(raw[key]).replaceAll(',', '');
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      errors.push(`${label} ต้องเป็นตัวเลข`);
      return null;
    }
    return n;
  };
  const date = (key: ColumnKey, label: string): string | null => {
    const iso = parseExcelDate(raw[key]);
    if (iso === null) errors.push(`${label} ไม่ใช่วันที่ (วัน/เดือน/ปี เช่น 1/12/2569)`);
    return iso ?? null;
  };
  const lookup = <T extends { id: number }>(
    codes: string[],
    items: readonly T[],
    codeOf: (x: T) => string,
    label: string,
  ): number[] =>
    codes.flatMap((code) => {
      const found = items.find((x) => codeOf(x).toUpperCase() === code.toUpperCase());
      if (!found) errors.push(`ไม่พบ${label} ${code}`);
      return found ? [found.id] : [];
    });

  const startDate = date('startDate', 'วันเริ่ม');
  if (!raw.startDate) errors.push('กรุณากรอกวันเริ่ม');
  const endDate = date('endDate', 'วันสิ้นสุด');
  const enabled = flag('enabled', 'เปิดใช้งาน', true);
  const stackable = flag('stackable', 'รวมกับโปรอื่น', false);
  const priority = num('priority', 'ลำดับความสำคัญ') ?? 0;
  const branchIds = lookup(list(raw.branchCodes), ctx.branches, (b) => b.code, 'สาขา');

  const isBill = type === 'bill_discount';
  const scope = isBill
    ? { all: true, productIds: [], categoryIds: [] }
    : {
        all: flag('scopeAll', 'ทุกสินค้า', false),
        productIds: lookup(list(raw.productCodes), ctx.products, (p) => p.sku, 'SKU'),
        categoryIds: lookup(list(raw.categoryCodes), ctx.categories, (c) => c.code, 'หมวดหมู่'),
      };
  const minQty = num('minQty', 'จำนวนขั้นต่ำ') ?? (type === 'item_discount' ? 1 : 0);
  const minAmount = num('minAmount', 'ยอดขั้นต่ำ') ?? 0;

  let discount: PromotionPayload['discount'] = null;
  let freeGoods: PromotionPayload['freeGoods'] = null;
  if (type === 'free_goods') {
    const items = list(raw.freeItems).flatMap((entry) => {
      const [code, qtyText] = entry.split(':').map((s) => s.trim());
      const productId = lookup([code], ctx.products, (p) => p.sku, 'สินค้าแถม')[0];
      const qty = qtyText ? Number(qtyText) : 1;
      if (Number.isNaN(qty)) errors.push(`จำนวนของแถม ${entry} ต้องเป็นตัวเลข`);
      return productId === undefined ? [] : [{ productId, qty }];
    });
    freeGoods = {
      items,
      repeat: flag('repeat', 'แถมทวีคูณ', false),
      maxSets: num('maxSets', 'ชุดสูงสุดต่อบิล'),
    };
  } else if (type) {
    const kindText = text(raw.discountKind).toLowerCase();
    const kind: DiscountKind | null =
      kindText === '%' || kindText === 'percent'
        ? 'percent'
        : kindText === 'บาท' || kindText === 'amount'
          ? 'amount'
          : null;
    if (!kind) {
      errors.push(kindText ? 'ชนิดส่วนลด ต้องเป็น % หรือ บาท' : 'กรุณากรอกชนิดส่วนลด');
    }
    const value = num('discountValue', 'ส่วนลด');
    if (value === null && !text(raw.discountValue)) errors.push('กรุณากรอกส่วนลด');
    discount = {
      kind: kind ?? 'percent',
      value: value ?? 0,
      maxDiscount: num('maxDiscount', 'เพดานส่วนลด'),
    };
  }

  if (!type || !startDate) return null;
  return {
    code: text(raw.code).toUpperCase(),
    name: text(raw.name),
    note: text(raw.note),
    type,
    startDate,
    endDate,
    enabled,
    priority,
    stackable,
    scope,
    minQty,
    minAmount,
    discount,
    freeGoods,
    branchIds,
  };
}

/**
 * Validates spreadsheet rows against the saved promotions with the same rules as the form and the
 * server (`promotionError()`, `promotionBranchScopeError()`), so problems show before anything is
 * saved. Started promotions only take the fields that may still change.
 */
export function validatePromotionRows(
  rows: PromotionRawRow[],
  ctx: PromotionValidationContext,
): PromotionImportRow[] {
  const saved = new Map(ctx.promotions.map((p) => [p.code, p]));
  const codeCount = new Map<string, number>();
  rows.forEach((r) => {
    const code = text(r.code).toUpperCase();
    if (code) codeCount.set(code, (codeCount.get(code) ?? 0) + 1);
  });

  return rows.map((raw): PromotionImportRow => {
    const code = text(raw.code).toUpperCase();
    const existing = saved.get(code);
    const errors: string[] = [];
    if (!code) errors.push('กรุณากรอกรหัสโปร');
    if ((codeCount.get(code) ?? 0) > 1) errors.push(`รหัส ${code} ซ้ำในไฟล์`);

    const payload = rowPayload(raw, ctx, errors);
    if (payload && !errors.length) {
      const problem =
        promotionBranchScopeError(payload, existing ?? null, ctx.isCompanyAdmin) ??
        promotionError(payload, ctx, existing);
      if (problem) errors.push(problem);
    }

    const action: PromotionImportAction = errors.length
      ? 'error'
      : !existing
        ? 'create'
        : payload && samePromotion(payload, existing)
          ? 'unchanged'
          : 'update';
    return {
      rowNo: raw.rowNo,
      code,
      name: payload?.name ?? text(raw.name),
      type: payload?.type ?? null,
      action,
      errors,
      payload,
      existingId: existing?.id,
    };
  });
}
