import { Category, PRODUCT_DEFAULTS, Product } from '@core/models';
import { barcodeFormat } from '@shared/components/barcode/barcode';
import {
  RawRow,
  exportSkusToExcel,
  formatPacks,
  readSkuRows,
  validateImportRows,
} from './sku-excel';

describe('SKU Excel import/export', () => {
  const categories: Category[] = [
    { id: 1, code: 'IT', name: 'ไอที', parentId: null, level: 1, active: true, productCount: 0 },
    {
      id: 2,
      code: 'IT-NB',
      name: 'โน้ตบุ๊ก',
      parentId: 1,
      level: 2,
      active: true,
      productCount: 1,
    },
    { id: 3, code: 'IT-OLD', name: 'เก่า', parentId: 1, level: 2, active: false, productCount: 0 },
  ];
  const existing: Product = {
    ...PRODUCT_DEFAULTS,
    id: 7,
    sku: 'NB-001',
    name: 'โน้ตบุ๊ก',
    shortName: 'NB',
    categoryId: 2,
    categoryPath: 'ไอที > โน้ตบุ๊ก',
    barcode: '8850000000010',
    cost: 100,
    stock: 3,
    serialControl: true,
  };
  const ctx = { skus: [existing], categories };
  const row = (rowNo: number, values: Partial<RawRow>): RawRow => ({ rowNo, ...values });

  it('creates new SKUs with defaults and updates existing ones keeping blank cells', () => {
    const [created, updated] = validateImportRows(
      [
        row(2, {
          sku: 'ms-1',
          name: 'เมาส์',
          categoryCode: 'IT-NB',
          unit: 'ชิ้น',
          packs: 'กล่อง:20:123',
        }),
        row(3, { sku: 'NB-001', cost: '120' }),
      ],
      ctx,
    );
    expect(created).toMatchObject({ action: 'create', sku: 'MS-1', errors: [] });
    expect(created.payload).toMatchObject({
      shortName: 'เมาส์',
      vatType: 'vat7',
      saleStatus: 'active',
      packUnits: [{ unit: 'กล่อง', factor: 20, barcode: '123' }],
    });
    expect(updated).toMatchObject({ action: 'update', existingId: 7 });
    expect(updated.payload).toMatchObject({
      name: 'โน้ตบุ๊ก',
      cost: 120,
      barcode: '8850000000010',
    });
  });

  it('reports row errors (category, enums, packs, duplicates, serial rules)', () => {
    const results = validateImportRows(
      [
        row(2, { sku: 'A-1', name: 'a', categoryCode: 'IT', unit: 'ชิ้น' }), // non-leaf
        row(3, { sku: 'A-2', name: 'b', categoryCode: 'IT-OLD', unit: 'ชิ้น', vatType: 'X' }),
        row(4, { sku: 'A-3', name: 'c', categoryCode: 'IT-NB', unit: 'ชิ้น', packs: 'กล่อง:1:' }),
        row(5, {
          sku: 'A-4',
          name: 'd',
          categoryCode: 'IT-NB',
          unit: 'ชิ้น',
          barcode: '8850000000010',
        }),
        row(6, { sku: 'A-5', name: 'e', categoryCode: 'IT-NB', unit: 'ชิ้น' }),
        row(7, { sku: 'A-5', name: 'e', categoryCode: 'IT-NB', unit: 'ชิ้น' }),
        row(8, { sku: 'NB-001', serialControl: 'N' }), // stock > 0
      ],
      ctx,
    );
    expect(results.every((r) => r.action === 'error' && !r.payload)).toBe(true);
    expect(results[0].errors.join()).toContain('หมวดย่อยสุด');
    expect(results[1].errors.join()).toContain('VAT');
    expect(results[2].errors.join()).toContain('หน่วยแพ็ค');
    expect(results[3].errors.join()).toContain('NB-001');
    expect(results[4].errors.join()).toContain('ซ้ำกันในไฟล์');
    expect(results[6].errors.join()).toContain('Serial');
  });

  it('round-trips an export through readSkuRows', async () => {
    const blob = await exportSkusToExcel(
      [
        {
          ...existing,
          serialControl: false,
          packUnits: [{ unit: 'ลัง', factor: 10, barcode: '0123' }],
        },
      ],
      categories,
      [],
    );
    const file = new File([blob], 'sku.xlsx');
    const [raw] = await readSkuRows(file);
    expect(raw).toMatchObject({
      sku: 'NB-001',
      categoryCode: 'IT-NB',
      barcode: '8850000000010',
      packs: formatPacks([{ unit: 'ลัง', factor: 10, barcode: '0123' }]),
      serialControl: 'N',
    });
    expect(raw).not.toHaveProperty('stock'); // reference columns are not imported
  });

  it('picks EAN-13 only for valid EAN-13 values', () => {
    expect(barcodeFormat('8850000000010')).toBe('EAN13');
    expect(barcodeFormat('8850000000011')).toBe('CODE128'); // wrong check digit
    expect(barcodeFormat('NB-100000001')).toBe('CODE128');
  });
});
