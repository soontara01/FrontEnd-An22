import {
  Product,
  canPurchase,
  effectiveCost,
  isDiscontinued,
  mainSupplier,
  serialFormatError,
} from '@core/models';
import { loadExcel, styleHeaderRow, xlsxBlob } from '@shared/utils/excel';

/**
 * Excel goods receipt for the Inventory menu (many SKUs in one file).
 * Normal SKU: one row with a quantity (optionally in a pack unit).
 * Serial SKU: one row per serial number. Costs exclude VAT and are per the row's unit.
 */

type ReceiveKey = 'sku' | 'qty' | 'unit' | 'serial' | 'cost' | 'note';

interface ReceiveColumn {
  key: ReceiveKey;
  header: string;
  width: number;
  help: string;
}

export const RECEIVE_COLUMNS: ReceiveColumn[] = [
  { key: 'sku', header: 'รหัส SKU*', width: 14, help: 'จำเป็น ดูได้จากชีต "รายการ SKU"' },
  {
    key: 'qty',
    header: 'จำนวน',
    width: 9,
    help: 'สินค้าทั่วไป: จำนวนเต็ม > 0 · สินค้าคุม Serial: เว้นว่าง (1 แถว = 1 เครื่อง)',
  },
  {
    key: 'unit',
    header: 'หน่วย',
    width: 10,
    help: 'เว้นว่าง = หน่วยฐาน หรือใส่หน่วยแพ็ค เช่น กล่อง (คูณจำนวนต่อแพ็คให้)',
  },
  {
    key: 'serial',
    header: 'Serial',
    width: 20,
    help: 'สินค้าคุม Serial เท่านั้น: 1 แถวต่อ 1 Serial (ยิงบาร์โค้ดลงคอลัมน์นี้ได้)',
  },
  {
    key: 'cost',
    header: 'ต้นทุนต่อหน่วย (ไม่รวม VAT)',
    width: 14,
    help: 'ต่อหน่วยที่ระบุ · เว้นว่าง = ราคาซื้อผู้จำหน่ายหลัก / ต้นทุนปัจจุบัน',
  },
  {
    key: 'note',
    header: 'อ้างอิง / หมายเหตุ',
    width: 22,
    help: 'เช่น เลขที่ใบกำกับภาษีของผู้จำหน่าย (บันทึกลงบัตรสต็อก)',
  },
];

const TEXT_COLUMNS: ReceiveKey[] = ['sku', 'serial', 'note'];

/** Default purchase cost per base unit: main supplier price, else actual/standard cost. */
export const defaultBaseCost = (p: Product): number => mainSupplier(p)?.cost ?? effectiveCost(p);

/** Template with example rows, column help and the list of receivable SKUs. */
export async function buildReceiveTemplate(products: Product[]): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  const receivable = products.filter((p) => !isDiscontinued(p) && canPurchase(p));

  const sheet = workbook.addWorksheet('รับเข้า');
  sheet.columns = RECEIVE_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    style: TEXT_COLUMNS.includes(c.key) ? { numFmt: '@' } : {},
  }));
  styleHeaderRow(sheet);
  const normal = receivable.find((p) => !p.serialControl);
  const serial = receivable.find((p) => p.serialControl);
  if (normal)
    sheet.addRow({ sku: normal.sku, qty: 10, cost: defaultBaseCost(normal), note: 'INV-0001' });
  if (serial) {
    sheet.addRow({
      sku: serial.sku,
      serial: `${serial.serialPrefix ? serial.serialPrefix + '-' : ''}XXXXXXXX`,
      cost: defaultBaseCost(serial),
      note: 'INV-0001',
    });
  }
  sheet.getRows(2, 2)?.forEach((r) => (r.font = { italic: true, color: { argb: 'FF757575' } }));

  const help = workbook.addWorksheet('คำอธิบาย');
  help.columns = [
    { header: 'คอลัมน์', key: 'header', width: 28 },
    { header: 'คำอธิบาย', key: 'help', width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  RECEIVE_COLUMNS.forEach((c) => help.addRow({ header: c.header, help: c.help }));
  help.addRow({});
  help.addRow({
    header: 'หมายเหตุ',
    help: 'ลบแถวตัวอย่างก่อนนำเข้า · ระบบตรวจทุกแถวก่อนบันทึก แถวที่ผิดจะถูกข้าม',
  });

  const list = workbook.addWorksheet('รายการ SKU');
  list.columns = [
    { header: 'รหัส SKU', key: 'sku', width: 14, style: { numFmt: '@' } },
    { header: 'ชื่อสินค้า', key: 'name', width: 30 },
    { header: 'คุม Serial', key: 'serial', width: 10 },
    { header: 'หน่วยฐาน', key: 'unit', width: 10 },
    { header: 'หน่วยแพ็ค', key: 'packs', width: 18 },
    { header: 'ต้นทุนตั้งต้น/หน่วยฐาน', key: 'cost', width: 14 },
    { header: 'คงเหลือ', key: 'stock', width: 10 },
  ];
  styleHeaderRow(list);
  for (const p of receivable) {
    list.addRow({
      sku: p.sku,
      name: p.name,
      serial: p.serialControl ? 'Y' : 'N',
      unit: p.unit,
      packs: p.packUnits.map((u) => `${u.unit} ×${u.factor}`).join(', '),
      cost: defaultBaseCost(p),
      stock: p.stock,
    });
  }
  return xlsxBlob(await workbook.xlsx.writeBuffer());
}

export type RawReceiveRow = Partial<Record<ReceiveKey, string>> & { rowNo: number };

/** Reads sheet "รับเข้า" (or the first sheet); columns matched by header text. */
export async function readReceiveRows(file: File): Promise<RawReceiveRow[]> {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet('รับเข้า') ?? workbook.worksheets[0];
  if (!sheet) throw new Error('ไม่พบชีตในไฟล์');

  const columnOf = new Map<number, ReceiveKey>();
  sheet.getRow(1).eachCell((cell, col) => {
    const text = cell.text.trim();
    const match = RECEIVE_COLUMNS.find(
      (c) => c.header === text || c.header.replace('*', '') === text,
    );
    if (match) columnOf.set(col, match.key);
  });
  if (![...columnOf.values()].includes('sku')) {
    throw new Error('ไม่พบคอลัมน์ "รหัส SKU" — กรุณาใช้ไฟล์จากปุ่มดาวน์โหลดแม่แบบ');
  }

  const rows: RawReceiveRow[] = [];
  sheet.eachRow((row, rowNo) => {
    if (rowNo === 1) return;
    const raw: RawReceiveRow = { rowNo };
    columnOf.forEach((key, col) => {
      const text = row.getCell(col).text.trim();
      if (text) raw[key] = text;
    });
    if (Object.keys(raw).length > 1) rows.push(raw);
  });
  return rows;
}

export interface ReceiveLine {
  rowNo: number;
  sku: string;
  productId?: number;
  name: string;
  kind: 'qty' | 'serial';
  /** Unit as entered ('' = base) and its label */
  unitLabel: string;
  /** Quantity in base units */
  baseQty: number;
  serial?: string;
  /** Cost per base unit, excl. VAT */
  unitCostBase: number;
  value: number;
  note: string;
  errors: string[];
}

/**
 * Validates receipt rows (mirrors the server rules and the receive dialogs).
 * `inStockSerials`: serials currently in stock per product id (to catch re-receiving).
 */
export function validateReceiveRows(
  rows: RawReceiveRow[],
  ctx: { products: Product[]; inStockSerials: ReadonlyMap<number, ReadonlySet<string>> },
): ReceiveLine[] {
  const firstRowOfSerial = new Map<string, number>();

  return rows.map((raw) => {
    const errors: string[] = [];
    const sku = (raw.sku ?? '').toUpperCase();
    const product = ctx.products.find((p) => p.sku.toUpperCase() === sku);
    const note = raw.note ?? '';
    const line: ReceiveLine = {
      rowNo: raw.rowNo,
      sku,
      productId: product?.id,
      name: product?.name ?? '',
      kind: product?.serialControl || raw.serial ? 'serial' : 'qty',
      unitLabel: product?.unit ?? raw.unit ?? '',
      baseQty: 0,
      serial: raw.serial?.toUpperCase(),
      unitCostBase: 0,
      value: 0,
      note,
      errors,
    };

    if (!sku) {
      errors.push('ไม่มีรหัส SKU');
      return line;
    }
    if (!product) {
      errors.push(`ไม่พบ SKU ${sku}`);
      return line;
    }
    if (isDiscontinued(product) || !canPurchase(product)) {
      errors.push('สถานะ SKU ห้ามรับเข้า');
    }

    // Unit + cost (cost is per the entered unit → per base unit)
    const pack =
      raw.unit && raw.unit !== product.unit
        ? product.packUnits.find((u) => u.unit === raw.unit)
        : undefined;
    if (raw.unit && raw.unit !== product.unit && !pack) {
      errors.push(`ไม่พบหน่วย "${raw.unit}" ของ ${sku}`);
    }
    const factor = pack?.factor ?? 1;
    line.unitLabel = pack?.unit ?? product.unit;

    let unitCostBase = defaultBaseCost(product);
    if (raw.cost !== undefined) {
      const cost = Number(raw.cost.replace(/,/g, ''));
      if (!Number.isFinite(cost) || cost < 0) errors.push(`ต้นทุนไม่ถูกต้อง (${raw.cost})`);
      else unitCostBase = cost / factor;
    }
    line.unitCostBase = unitCostBase;

    if (product.serialControl) {
      line.kind = 'serial';
      const serial = (raw.serial ?? '').toUpperCase();
      if (!serial) errors.push('สินค้าคุม Serial ต้องระบุ Serial (1 แถวต่อ 1 เครื่อง)');
      if (raw.qty !== undefined && raw.qty !== '1')
        errors.push('สินค้าคุม Serial ใส่ได้ 1 Serial ต่อแถว');
      if (pack) errors.push('สินค้าคุม Serial มีหน่วยเดียว');
      if (serial) {
        const formatError = serialFormatError(serial, product);
        const earlier = firstRowOfSerial.get(serial);
        if (formatError) errors.push(`Serial ${serial}: ${formatError}`);
        else if (earlier !== undefined) errors.push(`Serial ${serial} ซ้ำกับแถว ${earlier}`);
        else if (ctx.inStockSerials.get(product.id)?.has(serial)) {
          errors.push(`Serial ${serial} มีอยู่ในคลังแล้ว`);
        }
        if (earlier === undefined) firstRowOfSerial.set(serial, raw.rowNo);
      }
      line.serial = serial;
      line.baseQty = 1;
    } else {
      line.kind = 'qty';
      if (raw.serial) errors.push('สินค้านี้ไม่คุม Serial (ลบค่าในคอลัมน์ Serial)');
      const qty = Number((raw.qty ?? '').replace(/,/g, ''));
      if (!Number.isInteger(qty) || qty <= 0)
        errors.push(`จำนวนต้องเป็นจำนวนเต็มมากกว่า 0 (${raw.qty ?? 'ว่าง'})`);
      else line.baseQty = qty * factor;
    }

    line.value = Math.round(line.baseQty * line.unitCostBase * 100) / 100;
    return line;
  });
}

/** One save request. */
export type ReceiveGroup =
  | {
      kind: 'qty';
      productId: number;
      rowNos: number[];
      baseQty: number;
      unitCostBase: number;
      note: string;
    }
  | {
      kind: 'serial';
      productId: number;
      rowNos: number[];
      serials: string[];
      unitCostBase: number;
      note: string;
    };

/** Valid lines → requests: one per quantity row; serial rows merged per (SKU, cost, note). */
export function groupReceiveLines(lines: ReceiveLine[]): ReceiveGroup[] {
  const groups: ReceiveGroup[] = [];
  const serialGroups = new Map<string, Extract<ReceiveGroup, { kind: 'serial' }>>();
  for (const line of lines) {
    if (line.errors.length || line.productId === undefined) continue;
    if (line.kind === 'qty') {
      groups.push({
        kind: 'qty',
        productId: line.productId,
        rowNos: [line.rowNo],
        baseQty: line.baseQty,
        unitCostBase: line.unitCostBase,
        note: line.note,
      });
      continue;
    }
    const key = `${line.productId}|${line.unitCostBase}|${line.note}`;
    let group = serialGroups.get(key);
    if (!group) {
      group = {
        kind: 'serial',
        productId: line.productId,
        rowNos: [],
        serials: [],
        unitCostBase: line.unitCostBase,
        note: line.note,
      };
      serialGroups.set(key, group);
      groups.push(group);
    }
    group.rowNos.push(line.rowNo);
    group.serials.push(line.serial!);
  }
  return groups;
}
