// สร้าง docs/user-manual/data/sku-demo.xlsx — ไฟล์นำเข้า SKU ตัวอย่างของคู่มือ (หัวคอลัมน์ตาม SKU_COLUMNS ใน sku-excel.ts)
// รันจาก root ของ repo: node docs/user-manual/data/mk-sku-demo.cjs
const ExcelJS = require(process.cwd() + '/node_modules/exceljs');
const headers = ['รหัส SKU*','ชื่อสินค้า*','ชื่อย่อใบเสร็จ','รหัสหมวดหมู่*','หมวดหมู่ (อ้างอิง)','ยี่ห้อ','รุ่น','ประเภท','หน่วยฐาน*','บาร์โค้ด','หน่วยแพ็ค','VAT','ต้นทุนมาตรฐาน','จุดสั่งซื้อ','สต็อกสูงสุด','รับประกัน (เดือน)','คุม Serial','Prefix Serial','ความยาว Serial','สถานะ'];
const rows = [
  ['NB-001','โน้ตบุ๊ก Acer Aspire 5','NB Acer Aspire 5','IT-NB','','Acer','Aspire 5','STOCK','เครื่อง','','','VAT7',15000,0,0,24,'Y','NB',8,'ACTIVE'],
  ['NB-002','โน้ตบุ๊ก Lenovo IdeaPad Slim 3','NB Lenovo Slim 3','IT-NB','','Lenovo','IdeaPad Slim 3','STOCK','เครื่อง','','','VAT7',17500,0,0,24,'Y','LN',8,'ACTIVE'],
  ['TV-055','สมาร์ททีวี Samsung 55 นิ้ว','TV Samsung 55"','EL-TV','','Samsung','UA55','STOCK','เครื่อง','','','VAT7',13500,0,0,12,'Y','TV',10,'ACTIVE'],
  ['KB-001','คีย์บอร์ด USB','คีย์บอร์ด USB','IT-ACC-MS','','','','STOCK','ชิ้น','8850000000041','','VAT7',180,10,30,12,'N','','','ACTIVE'],
  ['CB-HDMI','สาย HDMI 2 เมตร','สาย HDMI 2 ม.','IT-ACC-CBL','','','','STOCK','เส้น','8850000000058','แพ็ค:5:','VAT7',60,20,60,0,'N','','','ACTIVE'],
  ['HUB-USB','ฮับ USB-C 4 พอร์ต','ฮับ USB-C 4 พอร์ต','IT-ACC-HUB','','','','STOCK','ชิ้น','','','VAT7',350,0,0,6,'N','','','NO_PURCHASE'],
  ['FAN-16','พัดลมตั้งพื้น 16 นิ้ว','พัดลม 16 นิ้ว','EL-FAN','','Hatari','HT-S16','STOCK','เครื่อง','8850000000065','','VAT7',650,5,15,12,'N','','','ACTIVE'],
  ['SV-INST','ค่าติดตั้งโปรแกรม','ติดตั้งโปรแกรม','SV-INS','','','','SERVICE','ครั้ง','','','VAT7',100,0,0,0,'N','','','ACTIVE'],
  ['OLD-MS','เมาส์มีสาย (รุ่นเก่า)','เมาส์มีสาย','IT-ACC-MS','','','','STOCK','ชิ้น','','','VAT7',80,0,0,0,'N','','','DISCONTINUED'],
];
(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('SKU');
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  for (const c of [1, 10]) ws.getColumn(c).numFmt = '@';
  await wb.xlsx.writeFile('docs/user-manual/data/sku-demo.xlsx');
  console.log('ok');
})();
