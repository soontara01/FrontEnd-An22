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

/** Excel file of the monthly sales tax report (reference lines in grey, not in the totals). */
export async function salesTaxReportXlsx(report: SalesTaxReport, storeName: string): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(`ภาษีขาย ${report.month}`);
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  styleHeaderRow(sheet);

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
    storeName,
  ]);
  totals.font = { bold: true };
  for (const col of [7, 8, 9, 10]) sheet.getColumn(col).numFmt = '#,##0.00';
  return xlsxBlob(await book.xlsx.writeBuffer());
}
