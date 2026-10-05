import { STORE_INFO_DEFAULTS } from '@core/models';
import { loadExcel } from '@shared/utils/excel';
import { salesTaxReportXlsx } from './sales-tax-excel';
import { SalesTaxReport } from './sales-tax-report';

describe('sales tax report Excel', () => {
  const report: SalesTaxReport = {
    month: '2026-10',
    rows: [
      {
        kind: 'full',
        date: '2026-10-04',
        docNo: 'INV-20261004-0001',
        buyerName: 'บริษัท ลูกค้า จำกัด',
        buyerTaxId: '0105550123451',
        buyerBranch: 'สำนักงานใหญ่',
        net: 1000,
        vat: 70,
        exempt: 0,
        total: 1070,
        counted: true,
        note: '',
      },
    ],
    totals: { net: 1000, vat: 70, exempt: 0, total: 1070 },
  };

  it('puts the report heading (month, seller, business place, branch) above the table', async () => {
    const blob = await salesTaxReportXlsx(report, {
      ...STORE_INFO_DEFAULTS,
      name: 'บริษัท ไอทีดี คอมพิวเตอร์ จำกัด',
      placeName: 'ร้านไอทีดี',
      taxId: '0105550123451',
      branchType: 'branch',
      branchNo: '00002',
    });
    const ExcelJS = await loadExcel();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await blob.arrayBuffer());
    const sheet = book.worksheets[0];
    const text = (cell: string) => String(sheet.getCell(cell).value ?? '');
    expect(text('A1')).toBe('รายงานภาษีขาย');
    expect(text('A2')).toBe('เดือนภาษี ตุลาคม 2569');
    expect(text('A3')).toBe('ชื่อผู้ประกอบการ บริษัท ไอทีดี คอมพิวเตอร์ จำกัด');
    expect(text('G3')).toBe('เลขประจำตัวผู้เสียภาษีอากร 0105550123451');
    expect(text('A4')).toBe('ชื่อสถานประกอบการ ร้านไอทีดี');
    expect(text('G4')).toBe('สาขา 00002');
    expect(text('A6')).toBe('ลำดับ');
    expect(text('C7')).toBe('INV-20261004-0001');
    expect(sheet.getCell('H8').value).toBe(70);
    expect(sheet.pageSetup.printTitlesRow).toBe('1:6');
  });
});
