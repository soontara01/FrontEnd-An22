import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PRODUCT_DEFAULTS, Product, SkuPrice, SkuPricePayload, addDaysIso } from '@core/models';
import { PricingApi } from './pricing-api.service';
import { PricingStore } from './pricing.store';

describe('PricingStore', () => {
  let store: PricingStore;
  let today: string;

  const product = (id: number, extra: Partial<Product> = {}): Product => ({
    ...PRODUCT_DEFAULTS,
    id,
    sku: `SKU-${id}`,
    name: `P${id}`,
    cost: 80,
    ...extra,
  });

  const api = {
    products: vi.fn(),
    prices: vi.fn(),
    create: vi.fn((p: SkuPricePayload) => of({ ...p, id: 99 })),
    update: vi.fn((id: number, p: SkuPricePayload) => of({ ...p, id })),
    remove: vi.fn(() => of(undefined)),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [PricingStore, { provide: PricingApi, useValue: api }],
    });
    store = TestBed.inject(PricingStore);
    today = store.today;

    const prices: SkuPrice[] = [
      // SKU 1: current (ends in 10 days) + scheduled next
      {
        id: 1,
        productId: 1,
        price: 100,
        startDate: addDaysIso(today, -30),
        endDate: addDaysIso(today, 10),
        note: '',
      },
      { id: 2, productId: 1, price: 90, startDate: addDaysIso(today, 11), endDate: null, note: '' },
      // SKU 2: only expired → no price today
      {
        id: 3,
        productId: 2,
        price: 50,
        startDate: addDaysIso(today, -60),
        endDate: addDaysIso(today, -1),
        note: '',
      },
    ];
    api.products.mockReturnValue(
      of([product(1), product(2), product(3, { saleStatus: 'discontinued' })]),
    );
    api.prices.mockReturnValue(of(prices));
    store.load();
  });

  it('derives current / next price, margin and counts for active SKUs', () => {
    const [first, second] = store.rows();
    expect(store.rows()).toHaveLength(2); // discontinued SKU 3 excluded
    expect(first.current?.price).toBe(100);
    expect(first.next?.price).toBe(90);
    // VAT-inclusive 100 → net 93.46; margin on net vs cost 80
    expect(first.margin).toBeCloseTo(14.4, 1);
    expect(first.expiringSoon).toBe(true);
    expect(second.current).toBeUndefined();

    expect(store.withPriceCount()).toBe(1);
    expect(store.noPriceCount()).toBe(1);
    expect(store.scheduledCount()).toBe(1);
    expect(store.expiringCount()).toBe(1);
  });

  it('create / update / remove keep periods and derived rows in sync', () => {
    const payload: SkuPricePayload = {
      productId: 2,
      price: 60,
      startDate: today,
      endDate: null,
      note: '',
    };
    store.create(payload).subscribe();
    expect(store.rows()[1].current?.price).toBe(60);
    expect(store.noPriceCount()).toBe(0);

    store.update(99, { ...payload, price: 65 }).subscribe();
    expect(store.rows()[1].current?.price).toBe(65);

    store.remove(99).subscribe();
    expect(store.rows()[1].current).toBeUndefined();
    expect(store.pricesFor(1).map((p) => p.id)).toEqual([2, 1]); // newest start first
  });
});
