import { Category } from './category.model';
import { PRODUCT_DEFAULTS, Product } from './product.model';
import {
  PROMOTION_DEFAULTS,
  Promotion,
  PromotionContext,
  discountAmount,
  discountLabel,
  discountedPrice,
  inScope,
  promotionError,
  promotionStatus,
  promotionsForProduct,
} from './promotion.model';

describe('promotion model', () => {
  const categories: Category[] = [
    { id: 1, code: 'IT', name: 'ไอที', parentId: null, level: 1, active: true, productCount: 0 },
    {
      id: 2,
      code: 'IT-ACC',
      name: 'อุปกรณ์',
      parentId: 1,
      level: 2,
      active: true,
      productCount: 0,
    },
    {
      id: 3,
      code: 'IT-ACC-MS',
      name: 'เมาส์',
      parentId: 2,
      level: 3,
      active: true,
      productCount: 1,
    },
    { id: 4, code: 'OLD', name: 'เก่า', parentId: null, level: 1, active: false, productCount: 0 },
  ];
  const product = (id: number, extra: Partial<Product> = {}): Product => ({
    ...PRODUCT_DEFAULTS,
    id,
    sku: `SKU-${id}`,
    name: `P${id}`,
    ...extra,
  });
  const products = [
    product(1, { categoryId: 3 }),
    product(2, { saleStatus: 'discontinued' }),
    product(3, { saleStatus: 'no_sale' }),
  ];
  const promo = (extra: Partial<Promotion> = {}): Promotion => ({
    ...PROMOTION_DEFAULTS,
    id: 1,
    code: 'PRO-1',
    name: 'โปร',
    startDate: '2026-10-01',
    scope: { all: false, productIds: [1], categoryIds: [] },
    ...extra,
  });
  const ctx = (today = '2026-09-01', promotions: Promotion[] = []): PromotionContext => ({
    products,
    categories,
    promotions,
    today,
  });
  const payload = (p: Promotion) => {
    const copy: Partial<Promotion> = { ...p };
    delete copy.id;
    return copy as Omit<Promotion, 'id'>;
  };

  it('computes discounts (percent with cap, amount, never below 0)', () => {
    const pct = { kind: 'percent' as const, value: 15, maxDiscount: 300 };
    expect(discountAmount(1000, pct)).toBe(150);
    expect(discountAmount(5000, pct)).toBe(300);
    expect(discountedPrice(5000, pct)).toBe(4700);
    const amount = { kind: 'amount' as const, value: 500, maxDiscount: null };
    expect(discountedPrice(300, amount)).toBe(0);
    expect(discountLabel(pct)).toBe('ลด 15% (สูงสุด ฿300)');
    expect(discountLabel(amount)).toBe('ลด ฿500');
  });

  it('derives the status from dates and the enabled flag', () => {
    const p = promo({ startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(promotionStatus(p, '2026-09-30')).toBe('scheduled');
    expect(promotionStatus(p, '2026-10-31')).toBe('active');
    expect(promotionStatus(p, '2026-11-01')).toBe('expired');
    expect(promotionStatus({ ...p, enabled: false }, '2026-10-15')).toBe('disabled');
  });

  it('matches SKUs through the category tree and sorts by priority', () => {
    const byParent = promo({ scope: { all: false, productIds: [], categoryIds: [1] } });
    expect(inScope(byParent, products[0], categories)).toBe(true);
    expect(inScope(byParent, product(9, { categoryId: null }), categories)).toBe(false);
    const found = promotionsForProduct(
      products[0],
      [
        promo({ id: 1, priority: 1 }),
        promo({ id: 2, priority: 5, scope: { all: true, productIds: [], categoryIds: [] } }),
        promo({ id: 3, type: 'bill_discount' }),
        promo({ id: 4, enabled: false }),
      ],
      categories,
      '2026-10-10',
    );
    expect(found.map((p) => p.id)).toEqual([2, 1]);
  });

  it('validates new promotions', () => {
    const check = (p: Promotion, promotions: Promotion[] = []) =>
      promotionError(payload(p), ctx('2026-09-01', promotions));
    expect(check(promo())).toBeNull();
    expect(check(promo({ code: 'bad code' }))).toContain('A-Z');
    expect(check(promo(), [promo({ id: 9 })])).toContain('ซ้ำ');
    expect(check(promo({ endDate: '2026-09-30' }))).toContain('ไม่ก่อนวันที่เริ่ม');
    expect(check(promo({ scope: { all: false, productIds: [], categoryIds: [] } }))).toContain(
      'เลือกสินค้า',
    );
    expect(check(promo({ scope: { all: false, productIds: [2], categoryIds: [] } }))).toContain(
      'เลิกจำหน่าย',
    );
    expect(check(promo({ scope: { all: false, productIds: [], categoryIds: [4] } }))).toContain(
      'ปิดใช้งาน',
    );
    expect(
      check(promo({ discount: { kind: 'percent', value: 120, maxDiscount: null } })),
    ).toContain('ไม่เกิน 100');
    expect(check(promo({ discount: { kind: 'amount', value: 50, maxDiscount: 10 } }))).toContain(
      'เพดาน',
    );
  });

  it('validates free goods (sellable items, condition, no duplicates)', () => {
    const free = (items: { productId: number; qty: number }[], extra: Partial<Promotion> = {}) =>
      promotionError(
        payload(
          promo({
            type: 'free_goods',
            discount: null,
            freeGoods: { items, repeat: true, maxSets: null },
            ...extra,
          }),
        ),
        ctx(),
      );
    expect(free([{ productId: 1, qty: 1 }])).toBeNull();
    expect(free([])).toContain('อย่างน้อย 1');
    expect(free([{ productId: 3, qty: 1 }])).toContain('ขายไม่ได้');
    expect(free([{ productId: 1, qty: 0 }])).toContain('≥ 1');
    expect(
      free(
        [
          { productId: 1, qty: 1 },
          { productId: 1, qty: 2 },
        ],
        {},
      ),
    ).toContain('ซ้ำ');
    expect(free([{ productId: 1, qty: 1 }], { minQty: 0, minAmount: 0 })).toContain('ขั้นต่ำ');
  });

  it('locks a started promotion except enabled / shorter end date / note', () => {
    const stored = promo({ endDate: '2026-10-31' });
    const edit = (changes: Partial<Promotion>) =>
      promotionError(payload({ ...stored, ...changes }), ctx('2026-10-10', [stored]), stored);
    expect(edit({ enabled: false, note: 'หยุดชั่วคราว' })).toBeNull();
    expect(edit({ endDate: '2026-10-20' })).toBeNull();
    expect(edit({ endDate: '2026-11-30' })).toContain('ช้าลงไม่ได้');
    expect(edit({ endDate: null })).toContain('ไม่กำหนดวันสิ้นสุด');
    expect(edit({ endDate: '2026-10-05' })).toContain('ก่อนวันนี้');
    expect(edit({ name: 'ชื่อใหม่' })).toContain('เริ่มแล้ว');
    expect(edit({ discount: { kind: 'percent', value: 20, maxDiscount: null } })).toContain(
      'เริ่มแล้ว',
    );
    // Same content with nested keys in another order is not a change.
    expect(
      edit({
        discount: { maxDiscount: null, value: 10, kind: 'percent' } as Promotion['discount'],
      }),
    ).toBeNull();
    // Before the start everything is editable.
    expect(
      promotionError(payload({ ...stored, name: 'ใหม่' }), ctx('2026-09-01', [stored]), stored),
    ).toBeNull();
  });
});
