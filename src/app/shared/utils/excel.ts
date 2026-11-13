import type { CellValue, Worksheet } from 'exceljs';

/**
 * Shared ExcelJS helpers. ExcelJS (~1 MB) must stay in its own lazy chunk:
 * always load it through `loadExcel()`, never with a static import (`import type` is fine).
 */
export async function loadExcel() {
  return (await import('exceljs')).default;
}

export function xlsxBlob(buffer: ArrayBuffer): Blob {
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Bold white header on blue (row `rowNumber`, frozen with the rows above it); reference-only
 * columns (1-based indexes in `infoCols`) in grey.
 */
export function styleHeaderRow(
  sheet: Worksheet,
  infoCols: ReadonlySet<number> = new Set(),
  rowNumber = 1,
): void {
  const header = sheet.getRow(rowNumber);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 30;
  header.eachCell((cell, col) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: infoCols.has(col) ? 'FF9E9E9E' : 'FF1565C0' },
    };
  });
  sheet.views = [{ state: 'frozen', ySplit: rowNumber }];
}

/**
 * An ISO timestamp as an Excel date cell that shows the **local** time — ExcelJS turns a `Date`
 * into a serial from its UTC value, so a 12:42 sale in Bangkok would read 05:42. Use with a
 * date `numFmt` such as `EXCEL_DATETIME`.
 */
export function excelDate(iso: string): Date {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
}

export const EXCEL_DATETIME = 'dd/mm/yyyy hh:mm';
export const EXCEL_MONEY = '#,##0.00';

const BE_OFFSET = 543;

/** 'YYYY-MM-DD' → '1/12/2569' (what a Thai user types). */
export function thaiDateText(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}/${m}/${y + BE_OFFSET}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A typed `d/m/yyyy` (year ≥ 2400 = พ.ศ., same rule as `ThaiDateAdapter`) or an Excel date cell
 * → 'YYYY-MM-DD'. undefined = blank, null = not a date.
 */
export function parseExcelDate(value: CellValue | undefined): string | null | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value instanceof Date) {
    // ExcelJS gives a date cell as midnight UTC of that day.
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  const parts = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(String(value).trim());
  if (!parts) return null;
  const [day, month, typedYear] = parts.slice(1).map(Number);
  const year = typedYear >= 2400 ? typedYear - BE_OFFSET : typedYear;
  const date = new Date(year, month - 1, day);
  if (year < 1000 || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}
