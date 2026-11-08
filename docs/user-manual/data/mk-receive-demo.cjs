// สร้าง docs/user-manual/data/receive-demo.xlsx — ไฟล์รับสินค้าเข้าจาก Excel ตัวอย่างของคู่มือ (หัวคอลัมน์ตาม receive-excel.ts)
// รันจาก root ของ repo: node docs/user-manual/data/mk-receive-demo.cjs
const ExcelJS = require(process.cwd() + '/node_modules/exceljs');
const headers = ['รหัส SKU*', 'จำนวน', 'หน่วย', 'Serial', 'ต้นทุนต่อหน่วย (ไม่รวม VAT)', 'อ้างอิง / หมายเหตุ'];
const rows = [
  ['CB-HDMI', 2, 'แพ็ค', '', 290, 'INV-ACC-0460'],
  ['KB-001', 10, '', '', 175, 'INV-ACC-0460'],
  ['TV-055', '', '', 'TV-0000003', 13400, 'INV-SYN-6911-003'],
  ['TV-055', '', '', 'TV-0000004', 13400, 'INV-SYN-6911-003'],
  ['OLD-MS', 5, '', '', 80, 'แถวผิด: เลิกจำหน่าย'],
];
(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('รับเข้า');
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  ws.getColumn(1).numFmt = '@';
  ws.getColumn(4).numFmt = '@';
  await wb.xlsx.writeFile('docs/user-manual/data/receive-demo.xlsx');
  console.log('ok');
})();
