import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PRODUCT_DEFAULTS, PROMOTION_DEFAULTS, Product, Promotion } from '@core/models';
import { PromotionsApi } from './promotions-api.service';
import { PromotionsStore } from './promotions.store';

describe('PromotionsStore', () => {
  const product = (id: number, sku: string): Product => ({
    ...PRODUCT_DEFAULTS,
    id,
    sku,
    name: sku,
  });
  const promo = (id: number, extra: Partial<Promotion>): Promotion => ({
    ...PROMOTION_DEFAULTS,
    id,
    code: `P-${id}`,
    name: `P${id}`,
    startDate: '2000-01-01',
    ...extra,
  });
  const promotions = [
    promo(1, {
      scope: { all: false, productIds: [1], categoryIds: [5] },
      minQty: 2,
      discount: { kind: 'percent', value: 10, maxDiscount: null },
    }),
    promo(2, {
      type: 'bill_discount',
      minAmount: 5000,
      discount: { kind: 'amount', value: 300, maxDiscount: null },
    }),
    promo(3, {
      type: 'free_goods',
      scope: { all: false, productIds: [1], categoryIds: [] },
      discount: null,
      freeGoods: { items: [{ productId: 2, qty: 1 }], repeat: true, maxSets: 5 },
    }),
    promo(4, { enabled: false }),
    promo(5, { startDate: '2999-01-01' }),
  ];
  const api = {
    list: vi.fn(() => of(promotions)),
    products: vi.fn(() => of([product(1, 'NB-1'), product(2, 'MS-1')])),
    categories: vi.fn(() =>
      of([
        {
          id: 5,
          code: 'ACC',
          name: 'อุปกรณ์',
          parentId: null,
          level: 1,
          active: true,
          productCount: 0,
        },
      ]),
    ),
  };

  let store: PromotionsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PromotionsStore, { provide: PromotionsApi, useValue: api }],
    });
    store = TestBed.inject(PromotionsStore);
    store.load();
  });

  it('counts promotions by status', () => {
    expect(store.countByStatus()).toEqual({ active: 3, scheduled: 1, expired: 0, disabled: 1 });
  });

  it('describes conditions and rewards in Thai', () => {
    const [item, bill, free] = store.rows();
    expect(item.condition).toBe('NB-1, หมวด อุปกรณ์ · ตั้งแต่ 2 ชิ้น');
    expect(item.reward).toBe('ลด 10% / ชิ้น');
    expect(bill.condition).toBe('ยอดบิลตั้งแต่ ฿5,000');
    expect(bill.reward).toBe('ลด ฿300');
    expect(free.condition).toBe('ซื้อ 1 ชิ้น จาก NB-1');
    expect(free.reward).toBe('แถม MS-1 ×1 (ทวีคูณ, สูงสุด 5 ชุด)');
  });
});
