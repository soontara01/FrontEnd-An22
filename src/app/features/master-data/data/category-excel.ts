import type { Workbook } from 'exceljs';
import { loadExcel, styleHeaderRow, xlsxBlob } from '@shared/utils/excel';
import {
  CATEGORY_CODE_MAX,
  CATEGORY_LEVEL_LABEL,
  CATEGORY_MAX_LEVEL,
  CATEGORY_NAME_MAX,
  Category,
  CategoryPayload,
  categoryFieldError,
  categoryPath,
} from '@core/models';

/**
 * Excel (.xlsx) import of the category tree: all 3 levels in one sheet, parents named by code.
 * ExcelJS is loaded lazily (only when the user imports), so it stays out of the menu chunk.
 */

type ColumnKey = 'code' | 'name' | 'parentCode' | 'active';

interface Column {
  key: ColumnKey;
  header: string;
  width: number;
  help: string;
}

const IMPORT_SHEET = 'นำเข้าหมวดหมู่';

export const CATEGORY_COLUMNS: Column[] = [
  {
    key: 'code',
    header: 'รหัสหมวดหมู่*',
    width: 18,
    help: `A-Z, 0-9, - ไม่เกิน ${CATEGORY_CODE_MAX} ตัว (ใช้จับคู่: มีแล้ว = แก้ไข, ยังไม่มี = เพิ่มใหม่)`,
  },
  {
    key: 'name',
    header: 'ชื่อหมวดหมู่*',
    width: 32,
    help: `ไม่เกิน ${CATEGORY_NAME_MAX} ตัวอักษร`,
  },
  {
    key: 'parentCode',
    header: 'รหัสหมวดแม่',
    width: 18,
    help: 'ว่าง = แผนก · ใส่รหัสที่มีในระบบ หรือรหัสของแถวอื่นในไฟล์นี้ (แถวไหนมาก่อนก็ได้)',
  },
  {
    key: 'active',
    header: 'เปิดใช้งาน (Y/N)',
    width: 16,
    help: 'Y หรือ N (ว่าง = Y เมื่อเพิ่มใหม่)',
  },
];

function referenceSheet(workbook: Workbook, categories: Category[]): void {
  const sheet = workbook.addWorksheet('หมวดหมู่เดิม');
  sheet.columns = [
    { header: 'รหัสหมวดหมู่', key: 'code', width: 18 },
    { header: 'หมวดหมู่', key: 'path', width: 44 },
    { header: 'ระดับ', key: 'level', width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const c of [...categories].sort((a, b) => a.code.localeCompare(b.code))) {
    sheet.addRow({
      code: c.code,
      path: categoryPath(categories, c.id),
      level: CATEGORY_LEVEL_LABEL[c.level],
    });
  }
}

/** Import template with example rows, column help and the categories that already exist. */
export async function buildCategoryTemplate(categories: Category[]): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet(IMPORT_SHEET);
  sheet.columns = CATEGORY_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    // Codes as text so Excel never drops a leading zero
    style: c.key === 'code' || c.key === 'parentCode' ? { numFmt: '@' } : {},
  }));
  styleHeaderRow(sheet);
  sheet.addRow({ code: 'EX', name: 'ตัวอย่าง: แผนก', parentCode: '', active: 'Y' });
  sheet.addRow({ code: 'EX-A', name: 'ตัวอย่าง: หมวด', parentCode: 'EX', active: 'Y' });
  sheet.addRow({ code: 'EX-A-1', name: 'ตัวอย่าง: หมวดย่อย', parentCode: 'EX-A', active: 'Y' });
  for (const rowNo of [2, 3, 4]) {
    sheet.getRow(rowNo).font = { italic: true, color: { argb: 'FF757575' } };
  }

  const help = workbook.addWorksheet('คำอธิบาย');
  help.columns = [
    { header: 'คอลัมน์', key: 'header', width: 26 },
    { header: 'คำอธิบาย', key: 'help', width: 80 },
  ];
  help.getRow(1).font = { bold: true };
  CATEGORY_COLUMNS.forEach((c) => help.addRow({ header: c.header, help: c.help }));
  help.addRow({});
  help.addRow({
    header: 'หมายเหตุ',
    help: '* = จำเป็นเมื่อเพิ่มใหม่ · แก้ไขหมวดเดิม: ช่องที่เว้นว่างจะคงค่าเดิม · ย้ายหมวดไปใต้แม่อื่นไม่ได้ · ลบแถวตัวอย่างก่อนนำเข้า',
  });

  referenceSheet(workbook, categories);
  return xlsxBlob(await workbook.xlsx.writeBuffer());
}

/** Raw cell text per column key, plus the Excel row number. */
export type CategoryRawRow = Partial<Record<ColumnKey, string>> & { rowNo: number };

/** Reads the import sheet; columns are matched by header text. Empty rows are skipped. */
export async function readCategoryRows(file: File): Promise<CategoryRawRow[]> {
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
    const match = CATEGORY_COLUMNS.find(
      (c) => c.header === text || c.header.replaceAll('*', '') === text,
    );
    if (match) columnOf.set(col, match.key);
  });
  if (![...columnOf.values()].includes('code')) {
    throw new Error('ไม่พบคอลัมน์ "รหัสหมวดหมู่" — กรุณาใช้ไฟล์จากปุ่มดาวน์โหลดแม่แบบ');
  }

  const rows: CategoryRawRow[] = [];
  sheet.eachRow((row, rowNo) => {
    if (rowNo === 1) return;
    const raw: CategoryRawRow = { rowNo };
    columnOf.forEach((key, col) => {
      const text = row.getCell(col).text.trim();
      if (text) raw[key] = text;
    });
    if (Object.keys(raw).length > 1) rows.push(raw);
  });
  return rows;
}

export type CategoryImportAction = 'create' | 'update' | 'error';

export interface CategoryImportRow {
  rowNo: number;
  code: string;
  name: string;
  /** '' = a department. On an update always the category's own parent. */
  parentCode: string;
  active: boolean;
  /** 0 = could not be worked out (the row has an error) */
  level: number;
  action: CategoryImportAction;
  errors: string[];
  /** Matched existing category (update) */
  existingId?: number;
}

/**
 * Validates spreadsheet rows against the current tree + the other rows of the file.
 * Update: blank cells keep the existing value. Mirrors the server rules so problems show before
 * anything is saved; a row whose parent row has an error is an error too.
 */
export function validateCategoryRows(
  rows: CategoryRawRow[],
  categories: readonly Category[],
): CategoryImportRow[] {
  const saved = new Map(categories.map((c) => [c.code, c]));
  const savedById = new Map(categories.map((c) => [c.id, c]));

  const codeCount = new Map<string, number>();
  rows.forEach((r) => {
    const code = (r.code ?? '').toUpperCase();
    if (code) codeCount.set(code, (codeCount.get(code) ?? 0) + 1);
  });

  const results = rows.map((raw): CategoryImportRow => {
    const code = (raw.code ?? '').toUpperCase();
    const existing = saved.get(code);
    const ownParent = existing?.parentId == null ? '' : savedById.get(existing.parentId)?.code;
    const parentCode = (raw.parentCode ?? '').toUpperCase();
    const name = raw.name?.trim() || existing?.name || '';
    const activeText = (raw.active ?? '').toUpperCase();

    const errors: string[] = [];
    if (!code) errors.push('กรุณากรอกรหัสหมวดหมู่');
    else {
      const invalid = categoryFieldError(code, name);
      if (invalid) errors.push(invalid);
    }
    if ((codeCount.get(code) ?? 0) > 1) errors.push(`รหัส ${code} ซ้ำในไฟล์`);
    if (activeText && activeText !== 'Y' && activeText !== 'N') {
      errors.push('เปิดใช้งาน ต้องเป็น Y หรือ N');
    }
    if (existing && parentCode && parentCode !== ownParent) {
      errors.push(`ย้ายหมวดแม่ไม่ได้ (หมวดนี้อยู่ใต้ ${ownParent || 'ระดับแผนก'})`);
    }

    return {
      rowNo: raw.rowNo,
      code,
      name,
      parentCode: existing ? (ownParent ?? '') : parentCode,
      active: activeText ? activeText === 'Y' : (existing?.active ?? true),
      level: existing?.level ?? 0,
      action: existing ? 'update' : 'create',
      errors,
      existingId: existing?.id,
    };
  });

  const newRows = new Map<string, CategoryImportRow>();
  for (const row of results) {
    if (row.action === 'create' && row.code && !newRows.has(row.code)) newRows.set(row.code, row);
  }

  // The parent chain of each new row: ends at a saved category, at the top, or at a problem.
  for (const row of newRows.values()) {
    const seen = new Set([row.code]);
    let depth = 1;
    let cursor = row;
    let chainOk = true;
    while (cursor.parentCode) {
      const savedParent = saved.get(cursor.parentCode);
      if (savedParent) {
        depth += savedParent.level;
        if (cursor === row && savedParent.productCount) {
          row.errors.push(
            `${savedParent.name} มี SKU อยู่ ${savedParent.productCount} รายการ แบ่งหมวดย่อยไม่ได้`,
          );
        }
        break;
      }
      const parentRow = newRows.get(cursor.parentCode);
      if (!parentRow) {
        chainOk = false;
        if (cursor === row) row.errors.push(`ไม่พบหมวดแม่ ${row.parentCode}`);
        break;
      }
      if (seen.has(parentRow.code)) {
        chainOk = false;
        row.errors.push('หมวดแม่อ้างกันเป็นวง');
        break;
      }
      seen.add(parentRow.code);
      depth++;
      cursor = parentRow;
    }
    if (!chainOk) continue;
    if (depth > CATEGORY_MAX_LEVEL) {
      row.errors.push(`แบ่งหมวดหมู่ได้ไม่เกิน ${CATEGORY_MAX_LEVEL} ระดับ`);
    } else {
      row.level = depth;
    }
  }

  // A new parent that will not be saved takes its children with it.
  for (const row of newRows.values()) {
    if (row.errors.length) continue;
    let parent = newRows.get(row.parentCode);
    while (parent && !parent.errors.length) parent = newRows.get(parent.parentCode);
    if (parent) row.errors.push(`หมวดแม่ ${parent.code} (แถว ${parent.rowNo}) มีข้อผิดพลาด`);
  }

  for (const row of results) {
    if (row.errors.length) row.action = 'error';
  }
  return results;
}

/** The rows to save, parents before children whatever the order in the file. */
export const saveOrder = (rows: readonly CategoryImportRow[]): CategoryImportRow[] =>
  rows.filter((r) => r.action !== 'error').sort((a, b) => a.level - b.level);

/**
 * The row's payload, with the parent looked up in the current list (it may have been created
 * earlier in this import). null = the parent is not there — it failed to save.
 */
export function importPayload(
  row: CategoryImportRow,
  categories: readonly Category[],
): CategoryPayload | null {
  const parentId = row.parentCode ? categories.find((c) => c.code === row.parentCode)?.id : null;
  if (parentId === undefined) return null;
  return { code: row.code, name: row.name, active: row.active, parentId };
}
