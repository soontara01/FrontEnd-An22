const ExcelJS = require('/home/noom/vscode/FrontEnd-An22/node_modules/exceljs');
const wb = new ExcelJS.Workbook();
const s = wb.addWorksheet('รับเข้า');
s.addRow(['รหัส SKU*','จำนวน','หน่วย','Serial','ต้นทุนต่อหน่วย (ไม่รวม VAT)','อ้างอิง / หมายเหตุ']);
[
 ['CBL-USBC',4,'แพ็ค','',275,'PO-0003'],
 ['SIM-AIS',50,'','',38,'PO-0003'],
 ['PHN-A55','','','R5C00000006',11400,'PO-0003'],
 ['PHN-A55','','','R5C00000007',11400,'PO-0003'],
 ['PHN-A55','','','R5C00000001',11400,'PO-0003'],
 ['CASE-IP12',10,'','',30,'PO-0003'],
 ['SV-FILM',1,'','',30,'PO-0003'],
].forEach(r=>{const row=s.addRow(r); row.getCell(1).numFmt='@'; row.getCell(4).numFmt='@';});
wb.xlsx.writeFile(process.argv[2]).then(()=>console.log('ok'));
