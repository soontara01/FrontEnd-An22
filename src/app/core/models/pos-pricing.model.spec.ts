import { Category } from './category.model';
import { PricingContext, cartError, priceCart } from './pos-pricing.model';
import { PRODUCT_DEFAULTS, Product } from './product.model';
import { PROMOTION_DEFAULTS, Promotion } from './promotion.model';
import { CartItem } from './sale.model';

const TODAY = '2026-10-04';

const product = (id: number, over: Partial<Product> = {}): Product => ({
  ...PRODUCT_DEFAULTS,
  id,
  sku: `SKU-${id}`,
  name: `สินค้า ${id}`,
  categoryId: 3,
  currentPrice: 107,
  stock: 100,
  ...over,
});

const promo = (id: number, over: Partial<Promotion> = {}): Promotion => ({
  ...PROMOTION_DEFAULTS,
  id,
  code: `P${id}`,
  name: `โปร ${id}`,
  startDate: '2026-10-01',
  scope: { all: true, productIds: [], categoryIds: [] },
  ...over,
});

const freePromo = (id: number, over: Partial<Promotion> = {}): Promotion =>
  promo(id, {
    type: 'free_goods',
    discount: null,
    minQty: 2,
    freeGoods: { items: [{ productId: 9, qty: 1 }], repeat: true, maxSets: null },
    ...over,
  });

const billPromo = (id: number, over: Partial<Promotion> = {}): Promotion =>
  promo(id, {
    type: 'bill_discount',
    minQty: 0,
    minAmount: 1000,
    discount: { kind: 'amount', value: 100, maxDiscount: null },
    ...over,
  });

const categories: Category[] = [
  { id: 1, code: 'IT', name: 'ไอที', parentId: null, level: 1, active: true, productCount: 0 },
  { id: 2, code: 'IT-A', name: 'อุปกรณ์', parentId: 1, level: 2, active: true, productCount: 0 },
  { id: 3, code: 'IT-A-M', name: 'เมาส์', parentId: 2, level: 3, active: true, productCount: 0 },
];

const item = (productId: number, qty = 1, over: Partial<CartItem> = {}): CartItem => ({
  productId,
  factor: 1,
  qty,
  serial: null,
  ...over,
});

const ctx = (products: Product[], promotions: Promotion[] = []): PricingContext => ({
  products,
  promotions,
  categories,
  date: TODAY,
});

describe('priceCart', () => {
  it('prices at list price × factor with VAT per line', () => {
    const p = product(1, {
      currentPrice: 10.7,
      packUnits: [{ unit: 'กล่อง', factor: 10, barcode: 'B10' }],
    });
    const cart = priceCart([item(1, 2), item(1, 1, { factor: 10 })], ctx([p]));
    expect(cart.lines.map((l) => [l.unit, l.unitPrice, l.amount])).toEqual([
      ['ชิ้น', 10.7, 21.4],
      ['กล่อง', 107, 107],
    ]);
    expect(cart.subtotal).toBe(128.4);
    expect(cart.total).toBe(128.4);
    expect(cart.vat).toBe(1.4 + 7);
    expect(cart.itemCount).toBe(12);
    expect(cart.issues).toEqual([]);
    expect(cartError(cart)).toBeNull();
  });

  it('applies item discounts per base unit once the line reaches minQty', () => {
    const p = product(1, { currentPrice: 1000 });
    const discount = promo(1, {
      minQty: 2,
      discount: { kind: 'percent', value: 10, maxDiscount: 50 },
    });
    expect(priceCart([item(1, 1)], ctx([p], [discount])).itemDiscount).toBe(0);
    const cart = priceCart([item(1, 3)], ctx([p], [discount]));
    // 10% of 1000 = 100, capped at 50 per unit
    expect(cart.lines[0].itemDiscount).toBe(150);
    expect(cart.lines[0].promotionIds).toEqual([1]);
    expect(cart.total).toBe(2850);
  });

  it('walks promotions by priority: non-stackable stops, stackable ones compound', () => {
    const p = product(1, { currentPrice: 1000 });
    const pct = (value: number) => ({ kind: 'percent' as const, value, maxDiscount: null });
    const high = promo(1, { priority: 9, stackable: true, discount: pct(10) });
    const nonStack = promo(2, { priority: 5, discount: pct(50) });
    const low = promo(3, { priority: 1, stackable: true, discount: pct(10) });

    // stackable 10% then (non-stackable skipped) stackable 10% → 1000 → 900 → 810
    let cart = priceCart([item(1)], ctx([p], [low, nonStack, high]));
    expect(cart.lines[0].promotionIds).toEqual([1, 3]);
    expect(cart.lines[0].itemDiscount).toBe(190);

    // a non-stackable top promotion stops the rest
    cart = priceCart([item(1)], ctx([p], [{ ...nonStack, priority: 10 }, high, low]));
    expect(cart.lines[0].promotionIds).toEqual([2]);
    expect(cart.lines[0].itemDiscount).toBe(500);
  });

  it('ignores disabled, expired and out-of-scope promotions', () => {
    const p = product(1, { currentPrice: 1000 });
    const promos = [
      promo(1, { enabled: false }),
      promo(2, { endDate: '2026-10-03' }),
      promo(3, { startDate: '2026-10-05' }),
      promo(4, { scope: { all: false, productIds: [2], categoryIds: [] } }),
    ];
    expect(priceCart([item(1)], ctx([p], promos)).itemDiscount).toBe(0);
    const byCategory = promo(5, { scope: { all: false, productIds: [], categoryIds: [1] } });
    expect(priceCart([item(1)], ctx([p], [byCategory])).itemDiscount).toBe(100);
  });

  it('adds free lines per set of qualifying pieces (repeat, maxSets)', () => {
    const products = [product(1), product(9, { stock: 50 })];
    let cart = priceCart([item(1, 5)], ctx(products, [freePromo(1)]));
    const free = cart.lines.filter((l) => l.freeOfPromotionId === 1);
    expect(free).toHaveLength(1);
    expect(free[0]).toMatchObject({ productId: 9, qty: 2, unitPrice: 0, amount: 0, vat: 0 });
    expect(cart.total).toBe(535);
    expect(cart.itemCount).toBe(7);

    cart = priceCart(
      [item(1, 5)],
      ctx(products, [
        freePromo(1, {
          freeGoods: { items: [{ productId: 9, qty: 1 }], repeat: false, maxSets: null },
        }),
      ]),
    );
    expect(cart.lines[1].qty).toBe(1);

    cart = priceCart(
      [item(1, 9)],
      ctx(products, [
        freePromo(1, {
          freeGoods: { items: [{ productId: 9, qty: 1 }], repeat: true, maxSets: 3 },
        }),
      ]),
    );
    expect(cart.lines[1].qty).toBe(3);
  });

  it('counts free-goods amount after item discounts', () => {
    const products = [product(1, { currentPrice: 1000 }), product(9)];
    const byAmount = freePromo(1, { minQty: 0, minAmount: 2000, stackable: true });
    const discount = promo(2, { stackable: true, priority: 5 });
    // 2 × 1000 = 2000 at list price, but 1800 after 10% → no free item
    const cart = priceCart([item(1, 2)], ctx(products, [byAmount, discount]));
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].promotionIds).toEqual([2, 1]);
    expect(priceCart([item(1, 3)], ctx(products, [byAmount, discount])).lines).toHaveLength(2);
  });

  it('caps free items at the stock left after paid lines (warning only)', () => {
    const products = [product(1), product(9, { stock: 3 })];
    const cart = priceCart(
      [item(1, 6), item(9, 2)],
      ctx(products, [freePromo(1, { scope: { all: false, productIds: [1], categoryIds: [] } })]),
    );
    const free = cart.lines.find((l) => l.freeOfPromotionId === 1);
    expect(free?.qty).toBe(1);
    expect(cart.issues).toEqual([expect.objectContaining({ productId: 9, blocking: false })]);
    expect(cartError(cart)).toBeNull();
  });

  it('needs a scanned serial for each free serial item', () => {
    const products = [product(1), product(9, { serialControl: true, stock: 5 })];
    const promos = [freePromo(1)];
    let cart = priceCart([item(1, 4)], ctx(products, promos));
    expect(cart.lines.filter((l) => l.freeOfPromotionId)).toHaveLength(2);
    expect(cartError(cart)).toBe('ต้องสแกนซีเรียลของแถม SKU-9');

    cart = priceCart([item(1, 4)], ctx(products, promos), [
      { promotionId: 1, productId: 9, serial: 'SN1' },
      { promotionId: 1, productId: 9, serial: 'SN2' },
    ]);
    expect(cart.lines.filter((l) => l.freeOfPromotionId).map((l) => l.serial)).toEqual([
      'SN1',
      'SN2',
    ]);
    expect(cartError(cart)).toBeNull();
  });

  it('applies bill discounts on the total after item discounts', () => {
    const p = product(1, { currentPrice: 600 });
    const itemPromo = promo(1, { discount: { kind: 'amount', value: 100, maxDiscount: null } });
    // 2 × 600 − 200 = 1000 → reaches minAmount 1000
    let cart = priceCart([item(1, 2)], ctx([p], [itemPromo, billPromo(2)]));
    expect(cart.billDiscount).toBe(100);
    expect(cart.billPromotionIds).toEqual([2]);
    expect(cart.total).toBe(900);

    // 1100 → not reached once the item discount is taken
    cart = priceCart(
      [item(1, 2)],
      ctx(
        [p],
        [promo(1, { discount: { kind: 'amount', value: 150, maxDiscount: null } }), billPromo(2)],
      ),
    );
    expect(cart.billDiscount).toBe(0);
    expect(cart.billPromotionIds).toEqual([]);
  });

  it('compounds stackable bill discounts and stops at a non-stackable one', () => {
    const p = product(1, { currentPrice: 2000 });
    const pct = { kind: 'percent' as const, value: 10, maxDiscount: null };
    const a = billPromo(1, { priority: 5, stackable: true, discount: pct });
    const b = billPromo(2, { priority: 3, stackable: true });
    const c = billPromo(3, { priority: 1 });
    // 2000 → −10% = 1800 → −100 = 1700; c is non-stackable so it is skipped
    const cart = priceCart([item(1)], ctx([p], [c, b, a]));
    expect(cart.billPromotionIds).toEqual([1, 2]);
    expect(cart.billDiscount).toBe(300);
  });

  it('allocates the bill discount pro rata with the remainder on the largest line', () => {
    const vat = product(1, { currentPrice: 700 });
    const exempt = product(2, { currentPrice: 300, vatType: 'exempt' });
    const third = product(3, { currentPrice: 300 });
    const cart = priceCart(
      [item(1), item(2), item(3)],
      ctx(
        [vat, exempt, third],
        [billPromo(9, { discount: { kind: 'amount', value: 100, maxDiscount: null } })],
      ),
    );
    // 100 × 700/1300 = 53.85, 100 × 300/1300 = 23.08 (×2) → 100.01 → −0.01 on the largest
    expect(cart.lines.map((l) => l.billDiscount)).toEqual([53.84, 23.08, 23.08]);
    expect(cart.total).toBe(1200);
    expect(cart.lines[1].vat).toBe(0);
    expect(cart.vat).toBe(cart.lines[0].vat + cart.lines[2].vat);
  });

  it('reports items that cannot be sold', () => {
    const products = [
      product(1, { currentPrice: null }),
      product(2, { saleStatus: 'no_sale' }),
      product(3, { stock: 1 }),
      product(4, { serialControl: true, stock: 2 }),
      product(5, { itemType: 'service', stock: 0 }),
    ];
    const cart = priceCart(
      [
        item(1),
        item(2),
        item(3, 2),
        item(4, 1, { serial: 'A' }),
        item(4, 1, { serial: 'A' }),
        item(4),
        item(5, 3),
        item(99),
        item(3, 1, { factor: 6 }),
      ],
      ctx(products),
    );
    expect(cart.issues.map((i) => i.message)).toEqual([
      'SKU-1 ยังไม่กำหนดราคาขาย',
      'SKU-2 ห้ามขาย',
      'ซีเรียล A ซ้ำในบิล',
      'SKU-4 ต้องระบุซีเรียล',
      'ไม่พบสินค้า #99',
      'SKU-3 ไม่มีหน่วยขายนี้',
      'SKU-3 สต็อกไม่พอ (คงเหลือ 1 ชิ้น)',
      'SKU-4 สต็อกไม่พอ (คงเหลือ 2 ชิ้น)',
    ]);
    expect(cart.issues.every((i) => i.blocking)).toBe(true);
    // the service line is priced without any stock check
    expect(cart.lines.some((l) => l.productId === 5 && l.qty === 3)).toBe(true);
  });

  it('rejects an empty cart', () => {
    expect(cartError(priceCart([], ctx([])))).toBe('ยังไม่มีสินค้าในบิล');
  });
});
