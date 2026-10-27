// สร้าง docs/test-data/v2/sku-somjai.xlsx (U5.5) — หัวคอลัมน์ตาม SKU_COLUMNS ของ sku-excel.ts
const ExcelJS = require(process.cwd() + '/node_modules/exceljs');
const headers = ['รหัส SKU*','ชื่อสินค้า*','ชื่อย่อใบเสร็จ','รหัสหมวดหมู่*','หมวดหมู่ (อ้างอิง)','ยี่ห้อ','รุ่น','ประเภท','หน่วยฐาน*','บาร์โค้ด','หน่วยแพ็ค','VAT','ต้นทุนมาตรฐาน','จุดสั่งซื้อ','สต็อกสูงสุด','รับประกัน (เดือน)','คุม Serial','Prefix Serial','ความยาว Serial','สถานะ','ผู้จำหน่ายหลัก (อ้างอิง)','คงเหลือ (อ้างอิง)','ต้นทุนเฉลี่ย (อ้างอิง)','ราคาวันนี้ (อ้างอิง)'];
const rows = [
  ['CBL-USBC','สายชาร์จ USB-C 1 เมตร','สาย USB-C 1m','MOB-ACC-CBL','','','','STOCK','เส้น','8850000000041','แพ็ค:5:','VAT7',60,20,40,0,'N','','','ACTIVE'],
  ['SIM-AIS','ซิม AIS เติมเงิน','ซิม AIS','PRE-SIM','','','','STOCK','ชิ้น','8850000000058','','EXEMPT',45,0,0,0,'N','','','ACTIVE'],
  ['OLD-CASE','เคสรุ่นเก่า','เคสรุ่นเก่า','MOB-ACC-CASE','','','','STOCK','ชิ้น','','','VAT7',20,0,0,0,'N','','','DISCONTINUED'],
  ['ERR-BC','แถวผิด บาร์โค้ดซ้ำ','','MOB-ACC-CASE','','','','STOCK','ชิ้น','8850000000010','','VAT7',10,0,0,0,'N','','','ACTIVE'],
  ['ERR-CAT','แถวผิด หมวดไม่ใช่ใบสุด','','MOB-ACC','','','','STOCK','ชิ้น','','','VAT7',10,0,0,0,'N','','','ACTIVE'],
];
(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('SKU');
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  ws.getColumn(1).numFmt = '@'; ws.getColumn(10).numFmt = '@';
  await wb.xlsx.writeFile('docs/test-data/v2/sku-somjai.xlsx');
  console.log('ok');
})();
