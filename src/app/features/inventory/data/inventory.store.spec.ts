import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PRODUCT_DEFAULTS, Product, SUPPLIER_DEFAULTS, Supplier, stockLevel } from '@core/models';
import { InventoryApi } from './inventory-api.service';
import { InventoryStore } from './inventory.store';

describe('InventoryStore', () => {
  const product = (id: number, stock: number, minStock = 5, price = 100): Product => ({
    ...PRODUCT_DEFAULTS,
    id,
    sku: `SKU-${id}`,
    name: `P${id}`,
    currentPrice: price,
    stock,
    minStock,
  });

  const supplier: Supplier = {
    ...SUPPLIER_DEFAULTS,
    id: 1,
    code: 'S1',
    name: 'S1',
    productCount: 1,
  };

  const api = {
    list: vi.fn(() => of([product(1, 10), product(2, 3), product(3, 0)])),
    suppliers: vi.fn(() => of([supplier])),
    adjustStock: vi.fn((id: number, delta: number) => of(product(id, 10 + delta))),
    receiveSerials: vi.fn((id: number, serials: string[]) =>
      of({ product: product(id, 10 + serials.length), received: [] }),
    ),
    removeSerials: vi.fn((id: number, ids: number[]) => of(product(id, 10 - ids.length))),
  };

  let store: InventoryStore;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [InventoryStore, { provide: InventoryApi, useValue: api }],
    });
    store = TestBed.inject(InventoryStore);
  });

  it('classifies stock levels', () => {
    expect(stockLevel(product(1, 10))).toBe('ok');
    expect(stockLevel(product(1, 5))).toBe('low');
    expect(stockLevel(product(1, 0))).toBe('out');
  });

  it('computes summary values', () => {
    store.load();
    expect(store.totalItems()).toBe(3);
    expect(store.lowStockCount()).toBe(1);
    expect(store.outOfStockCount()).toBe(1);
    expect(store.saleValue()).toBe(1300);
  });

  it('hides discontinued and service SKUs', () => {
    api.list.mockReturnValueOnce(
      of([
        product(1, 10),
        { ...product(2, 3), saleStatus: 'discontinued' },
        { ...product(3, 3), saleStatus: 'no_purchase' },
        { ...product(4, 0, 0), itemType: 'service' },
      ]),
    );
    store.load();
    expect(store.products().map((p) => p.id)).toEqual([1, 3]);
    expect(store.totalItems()).toBe(2);
    expect(store.outOfStockCount()).toBe(0);
    expect(store.allProducts().length).toBe(4);
  });

  it('adjustStock replaces the product in the list', () => {
    store.load();
    store.adjustStock(1, 5, 120, 'INV-1').subscribe();
    expect(api.adjustStock).toHaveBeenCalledWith(1, 5, 120, 'INV-1');
    expect(store.products()[0].stock).toBe(15);
  });

  it('receiveSerials / removeSerials replace the product with the server result', () => {
    store.load();
    store.receiveSerials(1, ['A-1', 'A-2'], 900).subscribe();
    expect(api.receiveSerials).toHaveBeenCalledWith(1, ['A-1', 'A-2'], 900, '');
    expect(store.products()[0].stock).toBe(12);

    store.removeSerials(1, [7, 8, 9], 'sold', '').subscribe();
    expect(api.removeSerials).toHaveBeenCalledWith(1, [7, 8, 9], 'sold', '');
    expect(store.products()[0].stock).toBe(7);
  });

  it('builds reorder lines grouped by main supplier (MOQ, packs, status)', () => {
    api.list.mockReturnValueOnce(
      of([
        // to max 20 → 17 needed → whole boxes of 6 → 18
        {
          ...product(1, 3, 5),
          maxStock: 20,
          cost: 40,
          packUnits: [{ unit: 'กล่อง', factor: 6, barcode: '' }],
          suppliers: [
            { supplierId: 1, supplierSku: 'X1', cost: 50, leadTimeDays: 3, moq: 0, isMain: true },
          ],
        },
        // no supplier, maxStock unset → 2 × reorder point
        { ...product(2, 0, 2), cost: 10 },
        // receiving blocked
        { ...product(3, 0, 5), saleStatus: 'no_purchase' },
        // above reorder point
        product(4, 10, 5),
      ]),
    );
    store.load();

    const [main, unlinked] = store.reorderGroups();
    expect(store.reorderCount()).toBe(2);
    expect(main.supplier?.id).toBe(1);
    expect(main.lines[0]).toMatchObject({
      qty: 18,
      packHint: '3 กล่อง',
      unitCost: 50,
      amount: 900,
    });
    expect(main.maxLeadTime).toBe(3);
    expect(unlinked.supplier).toBeUndefined();
    expect(unlinked.lines[0]).toMatchObject({ qty: 4, unitCost: 10, amount: 40 });
  });
});
