import { StoreInfo, branchLabel, fromIsoDate, placeName } from '@core/models';
import { loadExcel, styleHeaderRow, xlsxBlob } from '@shared/utils/excel';
import { SalesTaxReport } from './sales-tax-report';

const COLUMNS = [
  { header: 'ลำดับ', width: 7 },
  { header: 'วันที่', width: 12 },
  { header: 'เลขที่เอกสาร', width: 38 },
  { header: 'ชื่อผู้ซื้อ', width: 34 },
  { header: 'เลขประจำตัวผู้เสียภาษี', width: 18 },
  { header: 'สาขา', width: 14 },
  { header: 'มูลค่าสินค้า/บริการ', width: 16 },
  { header: 'ภาษีมูลค่าเพิ่ม', width: 14 },
  { header: 'มูลค่ายกเว้นภาษี', width: 15 },
  { header: 'รวม', width: 15 },
  { header: 'หมายเหตุ', width: 50 },
];

/** Empty cells between the left and right halves of a heading row (right half from column G). */
const gap = [null, null, null, null, null];

/** "ตุลาคม 2569" for '2026-10'. */
const taxMonthText = (month: string): string =>
  new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(
    fromIsoDate(`${month}-01`),
  );

/**
 * Excel file of the monthly sales tax report: the report heading (month, seller, tax ID, business
 * place, branch) above the table; reference lines in grey, not in the totals.
 */
export async function salesTaxReportXlsx(
  report: SalesTaxReport,
  store: StoreInfo | null,
): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(`ภาษีขาย ${report.month}`);
  sheet.columns = COLUMNS.map((c) => ({ width: c.width }));

  const name = store?.name ?? '';
  const heading = [
    ['รายงานภาษีขาย'],
    [`เดือนภาษี ${taxMonthText(report.month)}`],
    [`ชื่อผู้ประกอบการ ${name}`, ...gap, `เลขประจำตัวผู้เสียภาษีอากร ${store?.taxId ?? ''}`],
    [`ชื่อสถานประกอบการ ${store ? placeName(store) : ''}`, ...gap, store ? branchLabel(store) : ''],
  ];
  for (const values of heading) sheet.addRow(values);
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.addRow([]);

  const headerRow = sheet.addRow(COLUMNS.map((c) => c.header));
  styleHeaderRow(sheet, new Set(), headerRow.number);

  report.rows.forEach((r, i) => {
    const row = sheet.addRow([
      i + 1,
      r.date,
      r.docNo,
      r.buyerName,
      r.buyerTaxId,
      r.buyerBranch,
      r.counted ? r.net : null,
      r.counted ? r.vat : null,
      r.counted ? r.exempt : null,
      r.counted ? r.total : null,
      r.note,
    ]);
    row.getCell(5).numFmt = '@';
    if (!r.counted) row.font = { color: { argb: 'FF757575' }, italic: true };
  });
  const totals = sheet.addRow([
    null,
    null,
    null,
    'รวม',
    null,
    null,
    report.totals.net,
    report.totals.vat,
    report.totals.exempt,
    report.totals.total,
  ]);
  totals.font = { bold: true };
  for (const col of [7, 8, 9, 10]) {
    sheet.getColumn(col).eachCell((cell, rowNumber) => {
      if (rowNumber > headerRow.number) cell.numFmt = '#,##0.00';
    });
  }
  // Print: landscape A4, the heading rows and column headings repeated on every page.
  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `1:${headerRow.number}`,
  };
  return xlsxBlob(await book.xlsx.writeBuffer());
}
