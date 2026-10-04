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

/** Bold white header on blue; reference-only columns (1-based indexes in `infoCols`) in grey. */
export function styleHeaderRow(sheet: Worksheet, infoCols: ReadonlySet<number> = new Set()): void {
  const header = sheet.getRow(1);
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
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}
