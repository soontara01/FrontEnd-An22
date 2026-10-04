import type { Workbook, Worksheet } from 'exceljs';
import { loadExcel, styleHeaderRow, xlsxBlob } from '@shared/utils/excel';
import {
  Category,
  PRODUCT_DEFAULTS,
  PackUnit,
  Product,
  ProductPayload,
  SHORT_NAME_MAX,
  SkuStatus,
  Supplier,
  VatType,
  allBarcodes,
  categoryPath,
  isLeaf,
  mainSupplier,
} from '@core/models';

/**
 * Excel (.xlsx) import/export of the SKU master.
 * ExcelJS is loaded lazily (only when the user exports/imports), so it stays out of the menu chunk.
 */

type ColumnKey =
  | 'sku'
  | 'name'
  | 'shortName'
  | 'categoryCode'
  | 'categoryPath'
  | 'brand'
  | 'model'
  | 'unit'
  | 'barcode'
  | 'packs'
  | 'vatType'
  | 'cost'
  | 'minStock'
  | 'maxStock'
  | 'warrantyMonths'
  | 'serialControl'
  | 'serialPrefix'
  | 'serialLength'
  | 'saleStatus'
  | 'mainSupplier'
  | 'stock'
  | 'avgCost'
  | 'currentPrice';

interface Column {
  key: ColumnKey;
  header: string;
  width: number;
  /** Reference-only column: exported, ignored on import */
  info?: boolean;
  /** Explanation for the template's "คำอธิบาย" sheet */
  help: string;
}

export const SKU_COLUMNS: Column[] = [
  {
    key: 'sku',
    header: 'รหัส SKU*',
    width: 14,
    help: 'A-Z, 0-9, - (ใช้จับคู่: มีแล้ว = แก้ไข, ยังไม่มี = เพิ่มใหม่)',
  },
  { key: 'name', header: 'ชื่อสินค้า*', width: 30, help: 'จำเป็น' },
  {
    key: 'shortName',
    header: 'ชื่อย่อใบเสร็จ',
    width: 20,
    help: `ไม่เกิน ${SHORT_NAME_MAX} ตัวอักษร (ว่าง = ใช้ชื่อสินค้า)`,
  },
  {
    key: 'categoryCode',
    header: 'รหัสหมวดหมู่*',
    width: 14,
    help: 'รหัสหมวดหมู่ย่อยสุด ดูในชีต "หมวดหมู่"',
  },
  {
    key: 'categoryPath',
    header: 'หมวดหมู่ (อ้างอิง)',
    width: 34,
    info: true,
    help: 'อ้างอิงเท่านั้น ไม่ถูกนำเข้า',
  },
  { key: 'brand', header: 'ยี่ห้อ', width: 12, help: '' },
  { key: 'model', header: 'รุ่น', width: 14, help: '' },
  { key: 'unit', header: 'หน่วยฐาน*', width: 10, help: 'หน่วยที่นับสต็อก เช่น ชิ้น, เครื่อง' },
  {
    key: 'barcode',
    header: 'บาร์โค้ด',
    width: 16,
    help: 'ตัวเลขไม่เกิน 14 หลัก ห้ามซ้ำกับ SKU อื่น',
  },
  {
    key: 'packs',
    header: 'หน่วยแพ็ค',
    width: 28,
    help: 'หน่วย:จำนวน:บาร์โค้ด คั่นด้วย ; เช่น กล่อง:20:8850000000126; ลัง:100:',
  },
  { key: 'vatType', header: 'VAT', width: 8, help: 'VAT7 หรือ EXEMPT (ว่าง = VAT7)' },
  {
    key: 'cost',
    header: 'ต้นทุนมาตรฐาน',
    width: 10,
    help: 'ต่อหน่วยฐาน ไม่รวม VAT (ค่าตั้งต้นตอนรับเข้า — ต้นทุนจริงคำนวณจากการรับเข้า)',
  },
  { key: 'minStock', header: 'จุดสั่งซื้อ', width: 10, help: 'สต็อกขั้นต่ำ' },
  { key: 'maxStock', header: 'สต็อกสูงสุด', width: 10, help: '0 = 2 เท่าจุดสั่งซื้อ' },
  { key: 'warrantyMonths', header: 'รับประกัน (เดือน)', width: 10, help: '0 = ไม่มี' },
  {
    key: 'serialControl',
    header: 'คุม Serial',
    width: 9,
    help: 'Y หรือ N (คุม Serial ห้ามมีหน่วยแพ็ค)',
  },
  { key: 'serialPrefix', header: 'Prefix Serial', width: 10, help: 'A-Z, 0-9, - ไม่เกิน 10 ตัว' },
  { key: 'serialLength', header: 'ความยาว Serial', width: 10, help: '1-50 (ว่าง = ไม่กำหนด)' },
  {
    key: 'saleStatus',
    header: 'สถานะ',
    width: 14,
    help: 'ACTIVE, NO_SALE, NO_PURCHASE, DISCONTINUED (ว่าง = ACTIVE)',
  },
  {
    key: 'mainSupplier',
    header: 'ผู้จำหน่ายหลัก (อ้างอิง)',
    width: 26,
    info: true,
    help: 'อ้างอิงเท่านั้น (ผูกผู้จำหน่ายในหน้าแก้ไข SKU)',
  },
  {
    key: 'stock',
    header: 'คงเหลือ (อ้างอิง)',
    width: 10,
    info: true,
    help: 'อ้างอิงเท่านั้น (ปรับที่เมนูคลังสินค้า)',
  },
  {
    key: 'avgCost',
    header: 'ต้นทุนเฉลี่ย (อ้างอิง)',
    width: 12,
    info: true,
    help: 'อ้างอิงเท่านั้น (คำนวณจากการรับเข้า)',
  },
  {
    key: 'currentPrice',
    header: 'ราคาวันนี้ (อ้างอิง)',
    width: 12,
    info: true,
    help: 'อ้างอิงเท่านั้น (กำหนดที่เมนูจัดการราคา)',
  },
];

const VAT_CODES: Record<string, VatType> = { VAT7: 'vat7', EXEMPT: 'exempt' };
const STATUS_CODES: Record<string, SkuStatus> = {
  ACTIVE: 'active',
  NO_SALE: 'no_sale',
  NO_PURCHASE: 'no_purchase',
  DISCONTINUED: 'discontinued',
};
const codeOf = <T extends string>(map: Record<string, T>, value: T): string =>
  Object.entries(map).find(([, v]) => v === value)?.[0] ?? '';

/** Pack units as 'กล่อง:20:8850000000126; ลัง:100:' */
export const formatPacks = (packs: PackUnit[]): string =>
  packs.map((p) => `${p.unit}:${p.factor}:${p.barcode}`).join('; ');

function skuSheet(workbook: Workbook): Worksheet {
  const sheet = workbook.addWorksheet('SKU');
  sheet.columns = SKU_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    // Codes/barcodes as text so Excel never turns them into 8.85E+12
    style: ['sku', 'barcode', 'packs', 'categoryCode', 'serialPrefix'].includes(c.key)
      ? { numFmt: '@' }
      : {},
  }));
  styleHeaderRow(sheet, new Set(SKU_COLUMNS.flatMap((c, i) => (c.info ? [i + 1] : []))));
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
  return sheet;
}

function categorySheet(workbook: Workbook, categories: Category[]): void {
  const sheet = workbook.addWorksheet('หมวดหมู่');
  sheet.columns = [
    { header: 'รหัสหมวดหมู่', key: 'code', width: 16 },
    { header: 'หมวดหมู่', key: 'path', width: 40 },
    { header: 'ใช้กับ SKU ได้', key: 'usable', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const c of [...categories].sort((a, b) => a.code.localeCompare(b.code))) {
    sheet.addRow({
      code: c.code,
      path: categoryPath(categories, c.id),
      usable: c.active && isLeaf(categories, c.id) ? 'ได้' : '-',
    });
  }
}

/** Builds the export workbook (SKU sheet + category reference sheet). */
export async function exportSkusToExcel(
  products: Product[],
  categories: Category[],
  suppliers: Supplier[],
): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  const sheet = skuSheet(workbook);
  for (const p of products) {
    const main = mainSupplier(p);
    sheet.addRow({
      sku: p.sku,
      name: p.name,
      shortName: p.shortName,
      categoryCode: categories.find((c) => c.id === p.categoryId)?.code ?? '',
      categoryPath: p.categoryPath,
      brand: p.brand,
      model: p.model,
      unit: p.unit,
      barcode: p.barcode,
      packs: formatPacks(p.packUnits),
      vatType: codeOf(VAT_CODES, p.vatType),
      cost: p.cost,
      minStock: p.minStock,
      maxStock: p.maxStock,
      warrantyMonths: p.warrantyMonths,
      serialControl: p.serialControl ? 'Y' : 'N',
      serialPrefix: p.serialPrefix,
      serialLength: p.serialLength ?? '',
      saleStatus: codeOf(STATUS_CODES, p.saleStatus),
      mainSupplier: main ? (suppliers.find((s) => s.id === main.supplierId)?.name ?? '') : '',
      stock: p.stock,
      avgCost: p.avgCost,
      currentPrice: p.currentPrice ?? '',
    });
  }
  categorySheet(workbook, categories);
  return xlsxBlob(await workbook.xlsx.writeBuffer());
}

/** Empty import template with an example row, column help and category codes. */
export async function buildImportTemplate(categories: Category[]): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  const sheet = skuSheet(workbook);
  const leaf = categories.find((c) => c.active && isLeaf(categories, c.id));
  sheet.addRow({
    sku: 'EX-001',
    name: 'ตัวอย่าง: เมาส์ไร้สาย',
    shortName: 'เมาส์ไร้สาย',
    categoryCode: leaf?.code ?? '',
    unit: 'ชิ้น',
    barcode: '',
    packs: 'กล่อง:20:',
    vatType: 'VAT7',
    cost: 300,
    minStock: 10,
    maxStock: 40,
    warrantyMonths: 12,
    serialControl: 'N',
    saleStatus: 'ACTIVE',
  });
  sheet.getRow(2).font = { italic: true, color: { argb: 'FF757575' } };

  const help = workbook.addWorksheet('คำอธิบาย');
  help.columns = [
    { header: 'คอลัมน์', key: 'header', width: 26 },
    { header: 'คำอธิบาย', key: 'help', width: 80 },
  ];
  help.getRow(1).font = { bold: true };
  SKU_COLUMNS.forEach((c) => help.addRow({ header: c.header, help: c.help }));
  help.addRow({});
  help.addRow({
    header: 'หมายเหตุ',
    help: '* = จำเป็นเมื่อเพิ่มใหม่ · แก้ไข SKU เดิม: ช่องที่เว้นว่างจะคงค่าเดิม · ลบแถวตัวอย่างก่อนนำเข้า',
  });

  categorySheet(workbook, categories);
  return xlsxBlob(await workbook.xlsx.writeBuffer());
}

/** Raw cell text per column key, plus the Excel row number. */
export type RawRow = Partial<Record<ColumnKey, string>> & { rowNo: number };

/** Reads the first sheet; columns are matched by header text. Empty rows are skipped. */
export async function readSkuRows(file: File): Promise<RawRow[]> {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet('SKU') ?? workbook.worksheets[0];
  if (!sheet) throw new Error('ไม่พบชีตในไฟล์');

  const columnOf = new Map<number, ColumnKey>();
  sheet.getRow(1).eachCell((cell, col) => {
    const text = cell.text.trim();
    const match = SKU_COLUMNS.find((c) => c.header === text || c.header.replace('*', '') === text);
    if (match && !match.info) columnOf.set(col, match.key);
  });
  if (![...columnOf.values()].includes('sku')) {
    throw new Error('ไม่พบคอลัมน์ "รหัส SKU" — กรุณาใช้ไฟล์จากปุ่มดาวน์โหลดแม่แบบ/ส่งออก');
  }

  const rows: RawRow[] = [];
  sheet.eachRow((row, rowNo) => {
    if (rowNo === 1) return;
    const raw: RawRow = { rowNo };
    columnOf.forEach((key, col) => {
      const text = row.getCell(col).text.trim();
      if (text) raw[key] = text;
    });
    if (Object.keys(raw).length > 1) rows.push(raw);
  });
  return rows;
}

export type ImportAction = 'create' | 'update' | 'error';

export interface ImportRow {
  rowNo: number;
  sku: string;
  name: string;
  action: ImportAction;
  errors: string[];
  /** Ready-to-save payload (when no errors) */
  payload?: ProductPayload;
  /** Matched existing SKU (update) */
  existingId?: number;
}

/**
 * Validates spreadsheet rows against the current SKU master + categories.
 * Update: blank cells keep the existing value. Create: blank cells use defaults.
 * Mirrors the server rules so problems show before anything is saved.
 */
export function validateImportRows(
  rows: RawRow[],
  ctx: { skus: Product[]; categories: Category[] },
): ImportRow[] {
  const codeCount = new Map<string, number>();
  rows.forEach((r) => {
    const code = (r.sku ?? '').toUpperCase();
    if (code) codeCount.set(code, (codeCount.get(code) ?? 0) + 1);
  });

  const results = rows.map((raw) => validateRow(raw, ctx, codeCount));

  // Barcodes must be unique across the file and against SKUs not in this row.
  const owners = new Map<string, string>();
  for (const sku of ctx.skus) for (const code of allBarcodes(sku)) owners.set(code, sku.sku);
  const fileOwners = new Map<string, string>();
  for (const r of results) {
    if (!r.payload) continue;
    for (const code of allBarcodes(r.payload)) {
      const existing = owners.get(code);
      if (existing && existing.toUpperCase() !== r.sku.toUpperCase()) {
        r.errors.push(`บาร์โค้ด ${code} ใช้แล้วกับ ${existing}`);
      }
      const inFile = fileOwners.get(code);
      if (inFile && inFile !== r.sku) r.errors.push(`บาร์โค้ด ${code} ซ้ำกับแถวของ ${inFile}`);
      fileOwners.set(code, r.sku);
    }
  }
  for (const r of results) {
    if (r.errors.length) {
      r.action = 'error';
      r.payload = undefined;
    }
  }
  return results;
}

function validateRow(
  raw: RawRow,
  ctx: { skus: Product[]; categories: Category[] },
  codeCount: Map<string, number>,
): ImportRow {
  const errors: string[] = [];
  const sku = (raw.sku ?? '').toUpperCase();
  const existing = ctx.skus.find((s) => s.sku.toUpperCase() === sku);
  const base: ProductPayload = existing
    ? withoutServerFields(existing)
    : { ...withoutServerFields({ ...PRODUCT_DEFAULTS, id: 0, sku: '', name: '' }) };

  if (!sku) errors.push('ไม่มีรหัส SKU');
  else if (!/^[A-Z0-9-]+$/.test(sku)) errors.push('รหัส SKU ใช้ได้เฉพาะ A-Z, 0-9 และ -');
  if (sku && (codeCount.get(sku) ?? 0) > 1) errors.push('รหัส SKU ซ้ำกันในไฟล์');

  const text = (key: ColumnKey, current: string) => raw[key] ?? current;
  const number = (key: ColumnKey, current: number, label: string, opts = { min: 0, max: 1e9 }) => {
    if (raw[key] === undefined) return current;
    const n = Number(raw[key]!.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < opts.min || n > opts.max) {
      errors.push(`${label} ไม่ถูกต้อง (${raw[key]})`);
      return current;
    }
    return n;
  };
  const integer = (key: ColumnKey, current: number, label: string, max = 1e9) => {
    const n = number(key, current, label, { min: 0, max });
    if (!Number.isInteger(n)) errors.push(`${label} ต้องเป็นจำนวนเต็ม`);
    return n;
  };

  const name = text('name', base.name);
  if (!name) errors.push('ไม่มีชื่อสินค้า');
  const shortName = raw.shortName ?? (base.shortName || name.slice(0, SHORT_NAME_MAX));
  if (shortName.length > SHORT_NAME_MAX) errors.push(`ชื่อย่อเกิน ${SHORT_NAME_MAX} ตัวอักษร`);

  let categoryId = base.categoryId;
  if (raw.categoryCode !== undefined) {
    const category = ctx.categories.find((c) => c.code === raw.categoryCode!.toUpperCase());
    if (!category) errors.push(`ไม่พบรหัสหมวดหมู่ ${raw.categoryCode}`);
    else if (!category.active || !isLeaf(ctx.categories, category.id)) {
      errors.push(`หมวดหมู่ ${raw.categoryCode} ต้องเป็นหมวดย่อยสุดที่เปิดใช้งาน`);
    } else categoryId = category.id;
  } else if (categoryId === null) {
    errors.push('ไม่มีรหัสหมวดหมู่');
  }

  const unit = text('unit', base.unit);
  if (!unit) errors.push('ไม่มีหน่วยฐาน');
  const barcode = text('barcode', base.barcode);
  if (barcode && !/^\d{1,14}$/.test(barcode)) errors.push('บาร์โค้ดต้องเป็นตัวเลขไม่เกิน 14 หลัก');

  let packUnits = base.packUnits;
  if (raw.packs !== undefined) {
    packUnits = [];
    for (const part of raw.packs
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)) {
      const [packUnit = '', factorText = '', packBarcode = ''] = part
        .split(':')
        .map((x) => x.trim());
      const factor = Number(factorText);
      if (!packUnit || !Number.isInteger(factor) || factor <= 1) {
        errors.push(`หน่วยแพ็ค "${part}" ไม่ถูกต้อง (หน่วย:จำนวนเต็ม>1:บาร์โค้ด)`);
      } else if (packBarcode && !/^\d{1,14}$/.test(packBarcode)) {
        errors.push(`บาร์โค้ดของ ${packUnit} ไม่ถูกต้อง`);
      } else {
        packUnits.push({ unit: packUnit, factor, barcode: packBarcode });
      }
    }
    const names = packUnits.map((p) => p.unit);
    if (names.includes(unit) || new Set(names).size !== names.length) {
      errors.push('ชื่อหน่วยแพ็คซ้ำกันหรือซ้ำหน่วยฐาน');
    }
  }

  let vatType = base.vatType;
  if (raw.vatType !== undefined) {
    const v = VAT_CODES[raw.vatType.toUpperCase()];
    if (v) vatType = v;
    else errors.push(`VAT ต้องเป็น VAT7 หรือ EXEMPT (${raw.vatType})`);
  }

  let saleStatus = base.saleStatus;
  if (raw.saleStatus !== undefined) {
    const s = STATUS_CODES[raw.saleStatus.toUpperCase()];
    if (s) saleStatus = s;
    else errors.push(`สถานะไม่ถูกต้อง (${raw.saleStatus})`);
  }

  let serialControl = base.serialControl;
  if (raw.serialControl !== undefined) {
    const v = raw.serialControl.toUpperCase();
    if (v === 'Y' || v === 'N') serialControl = v === 'Y';
    else errors.push('คุม Serial ต้องเป็น Y หรือ N');
  }
  if (existing && existing.stock > 0 && serialControl !== existing.serialControl) {
    errors.push('ยังมีสต็อก เปลี่ยนการคุม Serial ไม่ได้');
  }
  if (serialControl && packUnits.length) errors.push('สินค้าคุม Serial มีหน่วยแพ็คไม่ได้');

  const serialPrefix = text('serialPrefix', base.serialPrefix).toUpperCase();
  if (serialPrefix && !/^[A-Z0-9-]{1,10}$/.test(serialPrefix))
    errors.push('Prefix Serial ไม่ถูกต้อง');
  const serialLength =
    raw.serialLength !== undefined
      ? integer('serialLength', 0, 'ความยาว Serial', 50) || null
      : base.serialLength;

  const minStock = integer('minStock', base.minStock, 'จุดสั่งซื้อ');
  const maxStock = integer('maxStock', base.maxStock, 'สต็อกสูงสุด');
  if (maxStock > 0 && maxStock < minStock) errors.push('สต็อกสูงสุดต้องไม่น้อยกว่าจุดสั่งซื้อ');

  const payload: ProductPayload = {
    ...base,
    sku,
    name,
    shortName,
    categoryId,
    brand: text('brand', base.brand),
    model: text('model', base.model),
    unit,
    barcode,
    packUnits: serialControl ? [] : packUnits,
    vatType,
    cost: number('cost', base.cost, 'ต้นทุน'),
    minStock,
    maxStock,
    warrantyMonths: integer('warrantyMonths', base.warrantyMonths, 'รับประกัน', 120),
    serialControl,
    serialPrefix: serialControl ? serialPrefix : '',
    serialLength: serialControl ? serialLength : null,
    saleStatus,
  };

  return {
    rowNo: raw.rowNo,
    sku,
    name,
    action: errors.length ? 'error' : existing ? 'update' : 'create',
    errors,
    payload: errors.length ? undefined : payload,
    existingId: existing?.id,
  };
}

/** Product → editable payload (drops id / stock / derived fields). */
function withoutServerFields(p: Product): ProductPayload {
  const payload = { ...p } as Partial<Product>;
  delete payload.id;
  delete payload.stock;
  delete payload.currentPrice;
  delete payload.categoryPath;
  return payload as ProductPayload;
}
