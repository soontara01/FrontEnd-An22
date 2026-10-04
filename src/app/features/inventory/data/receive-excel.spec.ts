import { PRODUCT_DEFAULTS, Product } from '@core/models';
import {
  RawReceiveRow,
  buildReceiveTemplate,
  groupReceiveLines,
  readReceiveRows,
  validateReceiveRows,
} from './receive-excel';

describe('Excel goods receipt', () => {
  const product = (id: number, sku: string, extra: Partial<Product> = {}): Product => ({
    ...PRODUCT_DEFAULTS,
    id,
    sku,
    name: sku,
    unit: 'ชิ้น',
    cost: 100,
    ...extra,
  });
  const products = [
    product(1, 'MS-1', {
      packUnits: [{ unit: 'กล่อง', factor: 20, barcode: '' }],
      suppliers: [
        { supplierId: 1, supplierSku: '', cost: 90, leadTimeDays: 1, moq: 0, isMain: true },
      ],
    }),
    product(2, 'NB-1', { serialControl: true, serialPrefix: 'NB' }),
    product(3, 'OLD-1', { saleStatus: 'discontinued' }),
    product(4, 'SV-1', { itemType: 'service', unit: 'ครั้ง' }),
  ];
  const ctx = { products, inStockSerials: new Map([[2, new Set(['NB-EXIST'])]]) };
  const row = (rowNo: number, values: Partial<RawReceiveRow>): RawReceiveRow => ({
    rowNo,
    ...values,
  });

  it('rejects service SKUs (no stock)', () => {
    const [line] = validateReceiveRows([row(2, { sku: 'SV-1', qty: '1' })], ctx);
    expect(line.errors).toEqual(['สินค้าบริการไม่มีสต็อก รับเข้าไม่ได้']);
  });

  it('converts pack quantities/costs to base units and defaults the cost', () => {
    const [box, pieces] = validateReceiveRows(
      [
        row(2, { sku: 'ms-1', qty: '2', unit: 'กล่อง', cost: '6000', note: 'INV-1' }),
        row(3, { sku: 'MS-1', qty: '5' }),
      ],
      ctx,
    );
    expect(box).toMatchObject({
      errors: [],
      kind: 'qty',
      baseQty: 40,
      unitCostBase: 300,
      value: 12000,
    });
    expect(pieces).toMatchObject({ errors: [], baseQty: 5, unitCostBase: 90 }); // main supplier cost
  });

  it('validates serial rows (format, duplicates in file, already in stock) and SKU status', () => {
    const lines = validateReceiveRows(
      [
        row(2, { sku: 'NB-1', serial: 'nb-001', cost: '19000' }),
        row(3, { sku: 'NB-1', serial: 'NB-001' }), // duplicate in file
        row(4, { sku: 'NB-1', serial: 'XX-1' }), // wrong prefix
        row(5, { sku: 'NB-1', serial: 'NB-EXIST' }), // already in stock
        row(6, { sku: 'NB-1' }), // no serial
        row(7, { sku: 'OLD-1', qty: '1' }), // discontinued
        row(8, { sku: 'NOPE', qty: '1' }), // unknown
        row(9, { sku: 'MS-1', qty: '0' }), // bad qty
        row(10, { sku: 'MS-1', qty: '1', unit: 'ลัง' }), // unknown unit
      ],
      ctx,
    );
    expect(lines[0]).toMatchObject({
      errors: [],
      kind: 'serial',
      serial: 'NB-001',
      unitCostBase: 19000,
    });
    expect(lines.slice(1).every((l) => l.errors.length > 0)).toBe(true);
    expect(lines[1].errors.join()).toContain('ซ้ำกับแถว 2');
    expect(lines[3].errors.join()).toContain('มีอยู่ในคลังแล้ว');
    expect(lines[6].errors.join()).toContain('ไม่พบ SKU');
  });

  it('groups serial rows per SKU/cost/note and keeps quantity rows separate', () => {
    const lines = validateReceiveRows(
      [
        row(2, { sku: 'NB-1', serial: 'NB-1', cost: '19000', note: 'A' }),
        row(3, { sku: 'NB-1', serial: 'NB-2', cost: '19000', note: 'A' }),
        row(4, { sku: 'NB-1', serial: 'NB-3', cost: '18000', note: 'A' }),
        row(5, { sku: 'MS-1', qty: '3' }),
        row(6, { sku: 'MS-1', qty: '0' }), // invalid → skipped
      ],
      ctx,
    );
    const groups = groupReceiveLines(lines);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ kind: 'serial', rowNos: [2, 3], serials: ['NB-1', 'NB-2'] });
    expect(groups[1]).toMatchObject({ kind: 'serial', rowNos: [4], unitCostBase: 18000 });
    expect(groups[2]).toMatchObject({ kind: 'qty', rowNos: [5], baseQty: 3 });
  });

  it('reads back its own template', async () => {
    const blob = await buildReceiveTemplate(products);
    const rows = await readReceiveRows(new File([blob], 'receive.xlsx'));
    expect(rows.map((r) => r.sku)).toEqual(['MS-1', 'NB-1']); // example rows
    expect(rows[0]).toMatchObject({ qty: '10', note: 'INV-0001' });
    expect(rows[1].serial).toContain('NB-');
  });
});
