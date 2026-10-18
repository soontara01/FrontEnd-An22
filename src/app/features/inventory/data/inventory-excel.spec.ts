import { PRODUCT_DEFAULTS, Product, SerialNumber } from '@core/models';
import { loadExcel } from '@shared/utils/excel';
import { inventoryXlsx } from './inventory-excel';

describe('inventory Excel', () => {
  const products: Product[] = [
    {
      ...PRODUCT_DEFAULTS,
      id: 1,
      sku: '0001',
      name: 'Notebook',
      barcode: '8850000000011',
      serialControl: true,
      stock: 2,
      minStock: 1,
      avgCost: 15000,
      currentPrice: 19900,
    },
    {
      ...PRODUCT_DEFAULTS,
      id: 2,
      sku: 'CBL-01',
      name: 'สาย LAN',
      unit: 'เส้น',
      packUnits: [{ unit: 'กล่อง', factor: 10, barcode: '' }],
      stock: 25,
      minStock: 30,
      avgCost: 40,
      currentPrice: null,
    },
  ];

  it('writes one row per SKU with values and totals', async () => {
    const blob = await inventoryXlsx(products);
    const ExcelJS = await loadExcel();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await blob.arrayBuffer());
    const sheet = book.worksheets[0];
    const value = (cell: string) => sheet.getCell(cell).value;

    expect(String(value('A1'))).toContain('สต็อกคงเหลือ ณ');
    expect(value('A3')).toBe('SKU');
    expect(value('A4')).toBe('0001');
    expect(sheet.getCell('A4').numFmt).toBe('@');
    expect(value('F4')).toBe('ใช่');
    expect(value('K4')).toBe('ปกติ');
    expect(value('M4')).toBe(30000);
    expect(value('O4')).toBe(39800);
    expect(value('I5')).toBe('2 กล่อง 5 เส้น');
    expect(value('K5')).toBe('ใกล้หมด');
    expect(value('N5')).toBeNull();
    expect(value('O5')).toBe(0);
    expect(value('C6')).toBe('รวม 2 รายการ');
    expect(value('M6')).toBe(31000);
    expect(value('O6')).toBe(39800);
    expect(sheet.pageSetup.printTitlesRow).toBe('1:3');
    expect(book.getWorksheet('Serial')).toBeUndefined();
  });

  it('names the branch the stock belongs to (D1)', async () => {
    const blob = await inventoryXlsx(products, [], new Date(), 'สาขา BN');
    const ExcelJS = await loadExcel();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await blob.arrayBuffer());
    expect(String(book.worksheets[0].getCell('A1').value)).toMatch(/^สต็อกคงเหลือ สาขา BN ณ /);
  });

  it('lists in-stock serials on a second sheet', async () => {
    const serial = (id: number, sn: string, status: SerialNumber['status'], cost: number) => ({
      id,
      productId: 1,
      branchId: 1,
      serial: sn,
      status,
      receivedAt: '2026-10-01T03:00:00.000Z',
      removedAt: null,
      note: '',
      cost,
    });
    const blob = await inventoryXlsx(products, [
      serial(1, 'SN-0002', 'in_stock', 15500),
      serial(2, 'SN-0001', 'in_stock', 14500),
      serial(3, 'SN-0003', 'sold', 15000),
    ]);
    const ExcelJS = await loadExcel();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await blob.arrayBuffer());
    const sheet = book.getWorksheet('Serial')!;
    const value = (cell: string) => sheet.getCell(cell).value;

    expect(value('D3')).toBe('Serial');
    expect(value('B4')).toBe('0001');
    expect(value('D4')).toBe('SN-0001');
    expect(sheet.getCell('D4').numFmt).toBe('@');
    expect(value('D5')).toBe('SN-0002');
    expect(value('C6')).toBe('รวม 2 เครื่อง');
    expect(value('E6')).toBe(30000);
  });

  it('leaves the cost columns out for who cannot see cost (E46)', async () => {
    const unit: SerialNumber = {
      id: 1,
      productId: 1,
      branchId: 1,
      serial: 'SN-0001',
      status: 'in_stock',
      receivedAt: '2026-10-01T03:00:00.000Z',
      removedAt: null,
      note: 'INV-1',
      cost: 15000,
    };
    const blob = await inventoryXlsx(products, [unit], new Date(), '', false);
    const ExcelJS = await loadExcel();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await blob.arrayBuffer());
    const stock = book.getWorksheet('คลังสินค้า')!;
    const serials = book.getWorksheet('Serial')!;
    const headers = (sheet: typeof stock) =>
      (sheet.getRow(3).values as unknown[]).filter((v) => v != null);

    expect(headers(stock)).not.toContain('ต้นทุนเฉลี่ย');
    expect(headers(stock)).not.toContain('มูลค่าทุน');
    expect(headers(stock).at(-1)).toBe('มูลค่าตามราคาขาย');
    expect(stock.getCell('M4').value).toBe(39800); // two columns to the left
    expect(stock.getCell('M6').value).toBe(39800);
    expect(headers(serials)).toEqual([
      'ลำดับ',
      'SKU',
      'ชื่อสินค้า',
      'Serial',
      'วันที่รับเข้า',
      'หมายเหตุ',
    ]);
    expect(serials.getCell('F4').value).toBe('INV-1');
    expect(serials.getCell('E5').value).toBeNull(); // no total at cost
  });
});
