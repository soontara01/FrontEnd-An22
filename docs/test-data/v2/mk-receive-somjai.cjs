// สร้าง docs/test-data/v2/receive-somjai.xlsx (U8.3) — หัวคอลัมน์ตาม receive-excel.ts
const ExcelJS = require(process.cwd() + '/node_modules/exceljs');
const headers = ['รหัส SKU*', 'จำนวน', 'หน่วย', 'Serial', 'ต้นทุนต่อหน่วย (ไม่รวม VAT)', 'อ้างอิง / หมายเหตุ'];
const rows = [
  ['CBL-USBC', 4, 'แพ็ค', '', 300, 'INV-ACC-001'],
  ['SIM-AIS', 50, '', '', 45, 'INV-ACC-001'],
  ...[1, 2, 3, 4, 5].map((n) => ['PHN-A55', '', '', `R5C0000000${n}`, 11000, 'INV-SS-001']),
  ['OLD-CASE', 5, '', '', 20, 'แถวผิด: เลิกจำหน่าย'],
  ['SV-FILM', 1, '', '', 30, 'แถวผิด: บริการ'],
  ['PHN-A55', '', '', 'R5C00000001', 11000, 'แถวผิด: serial ซ้ำ'],
];
(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('รับเข้า');
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  ws.getColumn(1).numFmt = '@';
  ws.getColumn(4).numFmt = '@';
  await wb.xlsx.writeFile('docs/test-data/v2/receive-somjai.xlsx');
  console.log('ok');
})();
