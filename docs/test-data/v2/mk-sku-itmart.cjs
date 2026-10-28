// สร้าง docs/test-data/v2/sku-itmart.xlsx (U5.9) — หัวคอลัมน์ตาม SKU_COLUMNS ของ sku-excel.ts
const ExcelJS = require(process.cwd() + '/node_modules/exceljs');
const headers = ['รหัส SKU*','ชื่อสินค้า*','ชื่อย่อใบเสร็จ','รหัสหมวดหมู่*','หมวดหมู่ (อ้างอิง)','ยี่ห้อ','รุ่น','ประเภท','หน่วยฐาน*','บาร์โค้ด','หน่วยแพ็ค','VAT','ต้นทุนมาตรฐาน','จุดสั่งซื้อ','สต็อกสูงสุด','รับประกัน (เดือน)','คุม Serial','Prefix Serial','ความยาว Serial','สถานะ'];
const rows = [
  ['NB-001','โน้ตบุ๊ก Acer Aspire 5','NB Acer Aspire 5','IT-NB','','Acer','Aspire 5','STOCK','เครื่อง','','','VAT7',18000,0,0,24,'Y','NB',8,'ACTIVE'],
  ['MS-010','เมาส์ไร้สาย','เมาส์ไร้สาย','IT-ACC','','','','STOCK','ชิ้น','','กล่อง:4:','VAT7',300,0,0,0,'N','','','ACTIVE'],
  ['KB-020','คีย์บอร์ด','คีย์บอร์ด','IT-ACC','','','','STOCK','ชิ้น','','','VAT7',450,0,0,0,'N','','','NO_PURCHASE'],
  ['SV-SETUP','ติดตั้งโปรแกรม','ติดตั้งโปรแกรม','SV-INS','','','','SERVICE','ครั้ง','','','VAT7',200,0,0,0,'N','','','ACTIVE'],
];
(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('SKU');
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  ws.getColumn(1).numFmt = '@';
  await wb.xlsx.writeFile('docs/test-data/v2/sku-itmart.xlsx');
  console.log('ok');
})();
