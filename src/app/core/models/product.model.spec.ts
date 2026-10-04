import {
  PRODUCT_DEFAULTS,
  allBarcodes,
  canPurchase,
  canSell,
  marginPercent,
  stockInPacks,
  suggestReorderQty,
  vatBreakdown,
} from './product.model';
import { branchLabel, creditLabel, isValidThaiTaxId } from './supplier.model';
import { buildTree, categoryPath, isLeaf } from './category.model';

describe('product model helpers', () => {
  it('splits a VAT-inclusive price into net + VAT (rounded to satang)', () => {
    expect(vatBreakdown(24900, 'vat7')).toEqual({ net: 23271.03, vat: 1628.97 });
    expect(vatBreakdown(107, 'vat7')).toEqual({ net: 100, vat: 7 });
    expect(vatBreakdown(500, 'exempt')).toEqual({ net: 500, vat: 0 });
  });

  it('computes margin on the net price', () => {
    expect(marginPercent(107, 80, 'vat7')).toBeCloseTo(20);
    expect(marginPercent(100, 80, 'exempt')).toBeCloseTo(20);
    expect(marginPercent(null, 80, 'vat7')).toBeNull();
  });

  it('maps sale status to sell / purchase permissions', () => {
    expect([canSell, canPurchase].map((f) => f({ saleStatus: 'active' }))).toEqual([true, true]);
    expect([canSell, canPurchase].map((f) => f({ saleStatus: 'no_sale' }))).toEqual([false, true]);
    expect([canSell, canPurchase].map((f) => f({ saleStatus: 'no_purchase' }))).toEqual([
      true,
      false,
    ]);
    expect([canSell, canPurchase].map((f) => f({ saleStatus: 'discontinued' }))).toEqual([
      false,
      false,
    ]);
  });

  it('lists all barcodes and expresses stock in packs', () => {
    const p = {
      ...PRODUCT_DEFAULTS,
      unit: 'ชิ้น',
      barcode: '1',
      packUnits: [
        { unit: 'แพ็ค', factor: 6, barcode: '' },
        { unit: 'ลัง', factor: 24, barcode: '2' },
      ],
    };
    expect(allBarcodes(p)).toEqual(['1', '2']);
    expect(stockInPacks({ ...p, stock: 59 })).toBe('2 ลัง 1 แพ็ค 5 ชิ้น');
    expect(stockInPacks({ ...p, stock: 48 })).toBe('2 ลัง');
    expect(stockInPacks({ ...p, stock: 3 })).toBe('3 ชิ้น');
    expect(stockInPacks({ ...p, packUnits: [], stock: 7 })).toBe('7 ชิ้น');
  });
});

describe('category model helpers', () => {
  const list = [
    {
      id: 1,
      code: 'IT',
      name: 'ไอที',
      parentId: null,
      level: 1 as const,
      active: true,
      productCount: 0,
    },
    {
      id: 3,
      code: 'IT-COM-NB',
      name: 'โน้ตบุ๊ก',
      parentId: 2,
      level: 3 as const,
      active: true,
      productCount: 1,
    },
    {
      id: 2,
      code: 'IT-COM',
      name: 'คอมพิวเตอร์',
      parentId: 1,
      level: 2 as const,
      active: true,
      productCount: 0,
    },
  ];

  it('builds the path and detects leaves', () => {
    expect(categoryPath(list, 3)).toBe('ไอที > คอมพิวเตอร์ > โน้ตบุ๊ก');
    expect(categoryPath(list, null)).toBe('');
    expect(isLeaf(list, 3)).toBe(true);
    expect(isLeaf(list, 2)).toBe(false);
  });

  it('builds a nested tree', () => {
    const [root] = buildTree(list);
    expect(root.code).toBe('IT');
    expect(root.children[0].children[0].code).toBe('IT-COM-NB');
  });
});

describe('reorder + supplier helpers', () => {
  const link = (moq: number) => ({
    supplierId: 1,
    supplierSku: '',
    cost: 0,
    leadTimeDays: 0,
    moq,
    isMain: true,
  });

  it('suggests quantity only at/below the reorder point for purchasable SKUs', () => {
    const base = { ...PRODUCT_DEFAULTS, minStock: 5, maxStock: 20 };
    expect(suggestReorderQty({ ...base, stock: 6 })).toBe(0);
    expect(suggestReorderQty({ ...base, stock: 5 })).toBe(15);
    expect(suggestReorderQty({ ...base, stock: 0, saleStatus: 'no_purchase' })).toBe(0);
    expect(suggestReorderQty({ ...base, minStock: 0, stock: 0 })).toBe(0);
  });

  it('defaults max to 2 × reorder point, respects MOQ and rounds up to whole packs', () => {
    const base = { ...PRODUCT_DEFAULTS, minStock: 5, stock: 2 };
    expect(suggestReorderQty(base)).toBe(8); // 10 - 2
    expect(suggestReorderQty({ ...base, suppliers: [link(20)] })).toBe(20);
    expect(
      suggestReorderQty({ ...base, packUnits: [{ unit: 'กล่อง', factor: 6, barcode: '' }] }),
    ).toBe(12);
  });

  it('validates Thai tax IDs and formats branch / credit labels', () => {
    expect(isValidThaiTaxId('0105550123451')).toBe(true);
    expect(isValidThaiTaxId('0105550123452')).toBe(false);
    expect(isValidThaiTaxId('12345')).toBe(false);
    expect(branchLabel({ branchType: 'head', branchNo: '' })).toBe('สำนักงานใหญ่');
    expect(branchLabel({ branchType: 'branch', branchNo: '00001' })).toBe('สาขา 00001');
    expect(creditLabel(0)).toBe('เงินสด');
    expect(creditLabel(30)).toBe('เครดิต 30 วัน');
  });
});
