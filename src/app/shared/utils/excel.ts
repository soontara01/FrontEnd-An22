import type { Worksheet } from 'exceljs';

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
