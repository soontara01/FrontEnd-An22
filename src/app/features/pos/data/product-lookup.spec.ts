import { PRODUCT_DEFAULTS, Product } from '@core/models';
import { findByCode, searchProducts } from './product-lookup';

describe('product lookup', () => {
  const product = (id: number, over: Partial<Product>): Product => ({
    ...PRODUCT_DEFAULTS,
    id,
    sku: `SKU-${id}`,
    name: `สินค้า ${id}`,
    ...over,
  });
  const products = [
    product(1, {
      sku: 'MS-010',
      name: 'เมาส์ไร้สาย',
      brand: 'Logitech',
      barcode: '885001',
      packUnits: [{ unit: 'กล่อง', factor: 20, barcode: '885020' }],
    }),
    product(2, { sku: 'KB-020', name: 'คีย์บอร์ด Logitech', barcode: '885002' }),
    product(3, { sku: 'OLD-1', name: 'เมาส์รุ่นเก่า', barcode: '885003', saleStatus: 'no_sale' }),
  ];

  it('finds a sellable unit by base / pack barcode or SKU code', () => {
    expect(findByCode('885001', products)).toMatchObject({ product: { id: 1 }, factor: 1 });
    expect(findByCode(' 885020 ', products)).toMatchObject({ product: { id: 1 }, factor: 20 });
    expect(findByCode('kb-020', products)).toMatchObject({ product: { id: 2 }, factor: 1 });
    expect(findByCode('885003', products)).toBeNull();
    expect(findByCode('', products)).toBeNull();
  });

  it('searches sellable SKUs by every word', () => {
    expect(searchProducts('logitech', products).map((p) => p.id)).toEqual([2, 1]);
    expect(searchProducts('เมาส์ logi', products).map((p) => p.id)).toEqual([1]);
    expect(searchProducts('เก่า', products)).toEqual([]);
    expect(searchProducts('  ', products)).toEqual([]);
  });
});
