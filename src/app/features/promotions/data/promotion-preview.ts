import {
  Category,
  Product,
  PromotionPayload,
  discountAmount,
  discountedPrice,
  effectiveCost,
  inScope,
  isDiscontinued,
  marginPercent,
  vatBreakdown,
} from '@core/models';

/**
 * Read-only "what will this promotion do" figures for the form and detail pages.
 * Uses today's sale prices and the margin rules of the SKU master (net of VAT vs cost).
 */

/** Qualifying SKUs (not discontinued), by SKU code. Empty for bill discounts. */
export function scopeProducts(
  promo: Pick<PromotionPayload, 'type' | 'scope'>,
  products: readonly Product[],
  categories: readonly Category[],
): Product[] {
  if (promo.type === 'bill_discount') return [];
  return products
    .filter((p) => !isDiscontinued(p) && inScope(promo, p, categories))
    .sort((a, b) => a.sku.localeCompare(b.sku));
}

export interface DiscountPreviewRow {
  product: Product;
  /** Today's price (null = no price yet) */
  price: number | null;
  discounted: number | null;
  discount: number;
  margin: number | null;
  belowCost: boolean;
}

/** item_discount: price → discounted price → margin per qualifying SKU. */
export function discountPreview(
  promo: PromotionPayload,
  products: readonly Product[],
  categories: readonly Category[],
): DiscountPreviewRow[] {
  const discount = promo.discount;
  if (promo.type !== 'item_discount' || !discount) return [];
  return scopeProducts(promo, products, categories).map((product) => {
    const price = product.currentPrice;
    if (price === null) {
      return { product, price, discounted: null, discount: 0, margin: null, belowCost: false };
    }
    const discounted = discountedPrice(price, discount);
    const cost = effectiveCost(product);
    return {
      product,
      price,
      discounted,
      discount: discountAmount(price, discount),
      margin: marginPercent(discounted, cost, product.vatType),
      belowCost: vatBreakdown(discounted, product.vatType).net < cost,
    };
  });
}

export interface FreeItemCost {
  productId: number;
  product?: Product;
  qty: number;
  /** qty × cost per unit (excl. VAT) */
  cost: number;
}

export interface FreeGoodsPreviewRow {
  product: Product;
  price: number | null;
  /** Units to buy for one set */
  buyQty: number;
  /** Margin % of one set: net revenue vs bought + free items' cost */
  margin: number | null;
}

export interface FreeGoodsPreview {
  items: FreeItemCost[];
  /** Cost of the free items of one set */
  setCost: number;
  rows: FreeGoodsPreviewRow[];
}

/** free_goods: cost of one free set and the margin of a minimum purchase per qualifying SKU. */
export function freeGoodsPreview(
  promo: PromotionPayload,
  products: readonly Product[],
  categories: readonly Category[],
): FreeGoodsPreview | null {
  if (promo.type !== 'free_goods' || !promo.freeGoods) return null;
  const items = promo.freeGoods.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    return { ...item, product, cost: product ? effectiveCost(product) * item.qty : 0 };
  });
  const setCost = items.reduce((sum, i) => sum + i.cost, 0);
  const rows = scopeProducts(promo, products, categories).map((product) => {
    const price = product.currentPrice;
    const buyQty =
      promo.minQty > 0 ? promo.minQty : price ? Math.ceil(promo.minAmount / price) || 1 : 1;
    if (!price) return { product, price, buyQty, margin: null };
    const net = vatBreakdown(price * buyQty, product.vatType).net;
    const cost = effectiveCost(product) * buyQty + setCost;
    return { product, price, buyQty, margin: net > 0 ? ((net - cost) / net) * 100 : null };
  });
  return { items, setCost, rows };
}

/** bill_discount: the discount at the minimum bill and its share of that bill. */
export function billDiscountPreview(
  promo: PromotionPayload,
): { minAmount: number; discount: number; percent: number } | null {
  if (promo.type !== 'bill_discount' || !promo.discount || promo.minAmount <= 0) return null;
  const discount = discountAmount(promo.minAmount, promo.discount);
  return { minAmount: promo.minAmount, discount, percent: (discount / promo.minAmount) * 100 };
}
