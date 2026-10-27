const ExcelJS = require('/home/noom/vscode/FrontEnd-An22/node_modules/exceljs');
const wb = new ExcelJS.Workbook();
const s = wb.addWorksheet('SKU');
const H = ['รหัส SKU*','ชื่อสินค้า*','ชื่อย่อใบเสร็จ','รหัสหมวดหมู่*','ยี่ห้อ','รุ่น','ประเภท','หน่วยฐาน*','บาร์โค้ด','หน่วยแพ็ค','VAT','ต้นทุนมาตรฐาน','จุดสั่งซื้อ','สต็อกสูงสุด','รับประกัน (เดือน)','คุม Serial','Prefix Serial','ความยาว Serial','สถานะ'];
s.addRow(H);
const rows = [
 ['SIM-AIS','ซิมเติมเงิน AIS','ซิม AIS','MOB-ACC','AIS','','STOCK','ชิ้น','8850001000040','','EXEMPT',40,20,100,0,'N','','','ACTIVE'],
 ['CASE-IP12','เคส iPhone 12 (รุ่นเก่า)','เคส IP12','MOB-ACC','Ugreen','','STOCK','ชิ้น','8850001000057','','VAT7',30,0,0,0,'N','','','DISCONTINUED'],
 ['CBL-USBC','สายชาร์จ USB-C 1 เมตร','สาย USB-C 1m','MOB-ACC','Anker','A8023','STOCK','เส้น','8850001000071','แพ็ค:5:8850001000064','VAT7',60,5,30,6,'N','','','ACTIVE'],
 ['CBL-DUP','สายบาร์โค้ดซ้ำ','สายซ้ำ','MOB-ACC','','','STOCK','เส้น','8850001000019','','VAT7',10,0,0,0,'N','','','ACTIVE'],
 ['XX-BADCAT','หมวดไม่ใช่ใบ','หมวดผิด','MOB','','','STOCK','ชิ้น','','','VAT7',10,0,0,0,'N','','','ACTIVE'],
];
rows.forEach(r => { const row = s.addRow(r); row.getCell(1).numFmt='@'; row.getCell(9).numFmt='@'; });
wb.xlsx.writeFile(process.argv[2]).then(()=>console.log('ok'));
