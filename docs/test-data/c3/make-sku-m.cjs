const ExcelJS = require('/home/noom/vscode/FrontEnd-An22/node_modules/exceljs');
const wb = new ExcelJS.Workbook();
const s = wb.addWorksheet('SKU');
s.addRow(['รหัส SKU*','ชื่อสินค้า*','ชื่อย่อใบเสร็จ','รหัสหมวดหมู่*','ยี่ห้อ','รุ่น','ประเภท','หน่วยฐาน*','บาร์โค้ด','หน่วยแพ็ค','VAT','ต้นทุนมาตรฐาน','จุดสั่งซื้อ','สต็อกสูงสุด','รับประกัน (เดือน)','คุม Serial','Prefix Serial','ความยาว Serial','สถานะ']);
[
 ['NB-ASUS14','ASUS Vivobook 14 i5/16GB/512GB','Vivobook 14 i5','IT-NB','ASUS','X1404VA','STOCK','เครื่อง','8850002000018','','VAT7',18000,2,6,24,'Y','NA',8,'ACTIVE'],
 ['MS-LOGI','เมาส์ไร้สาย Logitech M190','Logi M190','IT-ACC','Logitech','M190','STOCK','ชิ้น','8850002000025','','VAT7',250,10,40,12,'N','','','ACTIVE'],
 ['KB-LOGI','คีย์บอร์ด Logitech K120','Logi K120','IT-ACC','Logitech','K120','STOCK','ชิ้น','8850002000032','','VAT7',300,5,20,12,'N','','','ACTIVE'],
].forEach(r=>{const row=s.addRow(r); row.getCell(1).numFmt='@'; row.getCell(9).numFmt='@';});
wb.xlsx.writeFile(process.argv[2]).then(()=>console.log('ok'));
