import {
  Category,
  PRODUCT_DEFAULTS,
  PROMOTION_DEFAULTS,
  Product,
  PromotionPayload,
} from '@core/models';
import { billDiscountPreview, discountPreview, freeGoodsPreview } from './promotion-preview';

describe('promotion preview', () => {
  const categories: Category[] = [
    {
      id: 1,
      code: 'ACC',
      name: 'อุปกรณ์',
      parentId: null,
      level: 1,
      active: true,
      productCount: 2,
    },
  ];
  const product = (id: number, price: number | null, cost: number, extra: Partial<Product> = {}) =>
    ({
      ...PRODUCT_DEFAULTS,
      id,
      sku: `SKU-${id}`,
      name: `P${id}`,
      categoryId: 1,
      currentPrice: price,
      cost,
      ...extra,
    }) as Product;
  const products = [
    product(1, 107, 80), // net 100
    product(2, 107, 99),
    product(3, null, 50),
    product(4, 107, 10, { saleStatus: 'discontinued' }),
  ];
  const promo = (extra: Partial<PromotionPayload>): PromotionPayload => ({
    ...PROMOTION_DEFAULTS,
    code: 'P',
    name: 'P',
    startDate: '2026-10-01',
    scope: { all: false, productIds: [], categoryIds: [1] },
    ...extra,
  });

  it('shows discounted prices, margins and below-cost rows (discontinued excluded)', () => {
    const rows = discountPreview(
      promo({ discount: { kind: 'percent', value: 10, maxDiscount: null } }),
      products,
      categories,
    );
    expect(rows.map((r) => r.product.id)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({ discounted: 96.3, discount: 10.7, belowCost: false });
    expect(rows[0].margin).toBeCloseTo(11.1, 1);
    expect(rows[1].belowCost).toBe(true);
    expect(rows[2]).toMatchObject({ price: null, discounted: null });
  });

  it('costs one free set and the margin of the minimum purchase', () => {
    const preview = freeGoodsPreview(
      promo({
        type: 'free_goods',
        discount: null,
        minQty: 2,
        scope: { all: false, productIds: [1], categoryIds: [] },
        freeGoods: { items: [{ productId: 2, qty: 1 }], repeat: true, maxSets: null },
      }),
      products,
      categories,
    );
    expect(preview?.setCost).toBe(99);
    // revenue net 200, cost 2 × 80 + 99 = 259
    expect(preview?.rows[0].buyQty).toBe(2);
    expect(preview?.rows[0].margin).toBeCloseTo(-29.5, 1);
  });

  it('shows the bill discount at the minimum bill', () => {
    expect(
      billDiscountPreview(
        promo({
          type: 'bill_discount',
          minAmount: 5000,
          discount: { kind: 'amount', value: 300, maxDiscount: null },
        }),
      ),
    ).toEqual({ minAmount: 5000, discount: 300, percent: 6 });
  });
});
