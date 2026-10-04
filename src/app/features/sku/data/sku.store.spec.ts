import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  Category,
  PRODUCT_DEFAULTS,
  Product,
  ProductPayload,
  SUPPLIER_DEFAULTS,
} from '@core/models';
import { SkuApi } from './sku-api.service';
import { SkuStore } from './sku.store';

describe('SkuStore', () => {
  const sku = (id: number, code: string, extra: Partial<Product> = {}): Product => ({
    ...PRODUCT_DEFAULTS,
    id,
    sku: code,
    name: code,
    ...extra,
  });
  const cat = (
    id: number,
    name: string,
    parentId: number | null,
    level: 1 | 2 | 3,
    active = true,
  ): Category => ({
    id,
    code: `C${id}`,
    name,
    parentId,
    level,
    active,
    productCount: 0,
  });

  const categories = [
    cat(1, 'ไอที', null, 1),
    cat(2, 'คอมพิวเตอร์', 1, 2),
    cat(3, 'โน้ตบุ๊ก', 2, 3),
    cat(4, 'จอภาพ', 2, 3, false),
  ];

  const api = {
    list: vi.fn(() =>
      of([
        sku(1, 'NB-001', { serialControl: true, barcode: '111' }),
        sku(2, 'MS-010', {
          barcode: '222',
          packUnits: [{ unit: 'กล่อง', factor: 20, barcode: '333' }],
        }),
        sku(3, 'KB-020', { saleStatus: 'discontinued' }),
      ]),
    ),
    categories: vi.fn(() => of(categories)),
    suppliers: vi.fn(() =>
      of([{ ...SUPPLIER_DEFAULTS, id: 1, code: 'S1', name: 'ผู้จำหน่าย 1', productCount: 0 }]),
    ),
    create: vi.fn((p: ProductPayload) => of({ ...PRODUCT_DEFAULTS, ...p, id: 4, stock: 0 })),
    update: vi.fn((id: number, p: ProductPayload) =>
      of({ ...PRODUCT_DEFAULTS, ...p, id, stock: 5 }),
    ),
    remove: vi.fn(() => of(undefined)),
    get: vi.fn(),
  };

  let store: SkuStore;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [SkuStore, { provide: SkuApi, useValue: api }],
    });
    store = TestBed.inject(SkuStore);
    store.load();
  });

  it('loads SKUs + categories once and computes summary values', () => {
    store.load();
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.categories).toHaveBeenCalledTimes(1);
    expect(store.supplierName(1)).toBe('ผู้จำหน่าย 1');
    expect(store.count()).toBe(3);
    expect(store.serialCount()).toBe(1);
    expect(store.notSellableCount()).toBe(1);
  });

  it('groups leaf categories under their parent path; inactive leaves are not selectable', () => {
    expect(store.leafGroups()).toEqual([
      { label: 'ไอที > คอมพิวเตอร์', options: [categories[2], categories[3]] },
    ]);
    expect(store.isSelectableCategory(3)).toBe(true);
    expect(store.isSelectableCategory(4)).toBe(false); // inactive
    expect(store.isSelectableCategory(2)).toBe(false); // not a leaf
  });

  it('detects duplicate codes and barcodes (incl. pack barcodes), excluding the edited SKU', () => {
    expect(store.isDuplicateCode('nb-001')).toBe(true);
    expect(store.isDuplicateCode('NB-001', 1)).toBe(false);
    expect(store.barcodeOwner('333')).toBe('MS-010');
    expect(store.barcodeOwner('333', 2)).toBeUndefined();
    expect(store.barcodeOwner('')).toBeUndefined();
  });

  it('create / update / remove keep the list in sync', () => {
    const payload: ProductPayload = { ...PRODUCT_DEFAULTS, sku: 'NEW-1', name: 'ใหม่' };

    store.create(payload).subscribe();
    expect(store.skus().map((s) => s.sku)).toContain('NEW-1');

    store.update(2, { ...payload, sku: 'MS-011' }).subscribe();
    expect(store.skus().find((s) => s.id === 2)?.sku).toBe('MS-011');

    store.remove(3).subscribe();
    expect(store.skus().map((s) => s.id)).toEqual([1, 2, 4]);
  });
});
