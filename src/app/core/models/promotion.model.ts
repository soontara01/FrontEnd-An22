import type { Category } from './category.model';
import { priceStatus } from './price.model';
import { Product, canSell, isDiscontinued } from './product.model';

/**
 * Promotion master (decided 2026-10-04), prepared for the future POS screen:
 * - item_discount: lower the price of qualifying items (per unit)
 * - bill_discount: discount on the whole bill once it reaches `minAmount`
 * - free_goods: buy qualifying items (≥ minQty pieces or ≥ minAmount baht) → get free items
 * Promotions may overlap; at the POS `priority` (higher first) + `stackable` decide which apply.
 * Dates are local 'YYYY-MM-DD', both ends inclusive (same helpers as sale prices).
 */
export type PromotionType = 'item_discount' | 'bill_discount' | 'free_goods';

export type DiscountKind = 'percent' | 'amount';

export interface PromotionDiscount {
  kind: DiscountKind;
  /** Percent (0–100] or baht (> 0); per unit for item_discount, per bill for bill_discount */
  value: number;
  /** Cap in baht for percent discounts (null = no cap; always null for amount) */
  maxDiscount: number | null;
}

export interface FreeItem {
  productId: number;
  qty: number;
}

export interface PromotionFreeGoods {
  /** Given per qualifying set */
  items: FreeItem[];
  /** true = every multiple of the condition earns another set (buy 4 get 2) */
  repeat: boolean;
  /** Max sets per bill (null = unlimited) */
  maxSets: number | null;
}

/** Qualifying items. A category matches every SKU below it. Ignored for bill_discount. */
export interface PromotionScope {
  all: boolean;
  productIds: number[];
  categoryIds: number[];
}

export interface Promotion {
  id: number;
  /** Unique, A-Z 0-9 - */
  code: string;
  name: string;
  note: string;
  type: PromotionType;
  startDate: string;
  /** null = open-ended */
  endDate: string | null;
  /** Switched off manually (stays off whatever the dates say) */
  enabled: boolean;
  /** Higher wins when promotions compete for the same item/bill */
  priority: number;
  /** May combine with other promotions on the same item/bill */
  stackable: boolean;
  scope: PromotionScope;
  /** item_discount: min qty per line · free_goods: pieces to buy per set (0 = use minAmount) */
  minQty: number;
  /** bill_discount: min bill total · free_goods: baht of qualifying items per set (0 = use minQty) */
  minAmount: number;
  /** item_discount / bill_discount only */
  discount: PromotionDiscount | null;
  /** free_goods only */
  freeGoods: PromotionFreeGoods | null;
}

export type PromotionPayload = Omit<Promotion, 'id'>;

export type PromotionStatus = 'active' | 'scheduled' | 'expired' | 'disabled';

export const PROMOTION_TYPE_LABEL: Record<PromotionType, string> = {
  item_discount: 'ลดราคาสินค้า',
  bill_discount: 'ลดท้ายบิล',
  free_goods: 'ของแถม',
};

export const PROMOTION_TYPE_ICON: Record<PromotionType, string> = {
  item_discount: 'percent',
  bill_discount: 'receipt_long',
  free_goods: 'redeem',
};

export const PROMOTION_STATUS_LABEL: Record<PromotionStatus, string> = {
  active: 'ใช้อยู่',
  scheduled: 'รอเริ่ม',
  expired: 'หมดอายุ',
  disabled: 'ปิดใช้งาน',
};

export const PROMOTION_STATUS_BADGE: Record<PromotionStatus, string> = {
  active: 'badge-success',
  scheduled: 'badge-warn',
  expired: '',
  disabled: 'badge-error',
};

/** Defaults for a new promotion and for fields missing from older stored data. */
export const PROMOTION_DEFAULTS: Omit<Promotion, 'id' | 'code' | 'name' | 'startDate'> = {
  note: '',
  type: 'item_discount',
  endDate: null,
  enabled: true,
  priority: 0,
  stackable: false,
  scope: { all: false, productIds: [], categoryIds: [] },
  minQty: 1,
  minAmount: 0,
  discount: { kind: 'percent', value: 10, maxDiscount: null },
  freeGoods: null,
};

type Period = Pick<Promotion, 'enabled' | 'startDate' | 'endDate'>;

export const promotionStatus = (p: Period, today: string): PromotionStatus =>
  p.enabled ? priceStatus(p, today) : 'disabled';

/** Started promotions are locked (sales may reference them): see `promotionError`. */
export const hasStarted = (p: Pick<Promotion, 'startDate'>, today: string): boolean =>
  p.startDate <= today;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Baht taken off `base` (a unit price for item discounts, the bill total for bill discounts). */
export function discountAmount(base: number, d: PromotionDiscount): number {
  if (base <= 0) return 0;
  const raw = d.kind === 'percent' ? (base * d.value) / 100 : d.value;
  const capped =
    d.kind === 'percent' && d.maxDiscount !== null ? Math.min(raw, d.maxDiscount) : raw;
  return round2(Math.min(capped, base));
}

/** Price after the discount, never below 0. */
export const discountedPrice = (base: number, d: PromotionDiscount): number =>
  round2(base - discountAmount(base, d));

/** e.g. 'ลด 10% (สูงสุด ฿300)' / 'ลด ฿500' */
export function discountLabel(d: PromotionDiscount): string {
  if (d.kind === 'amount') return `ลด ฿${d.value.toLocaleString('en-US')}`;
  const cap = d.maxDiscount !== null ? ` (สูงสุด ฿${d.maxDiscount.toLocaleString('en-US')})` : '';
  return `ลด ${d.value}%${cap}`;
}

/** The category and all its ancestors (a promotion on a parent covers its children). */
function categoryChain(categories: readonly Category[], id: number | null): number[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const chain: number[] = [];
  for (let c = id === null ? undefined : byId.get(id); c;) {
    chain.push(c.id);
    c = c.parentId === null ? undefined : byId.get(c.parentId);
  }
  return chain;
}

/** Whether a SKU counts as a qualifying item of the promotion. */
export function inScope(
  promo: Pick<Promotion, 'type' | 'scope'>,
  product: Pick<Product, 'id' | 'categoryId'>,
  categories: readonly Category[],
): boolean {
  if (promo.type === 'bill_discount' || promo.scope.all) return true;
  if (promo.scope.productIds.includes(product.id)) return true;
  return categoryChain(categories, product.categoryId).some((id) =>
    promo.scope.categoryIds.includes(id),
  );
}

/** Item-level promotions (discount / free goods) in effect for a SKU on `date`, priority first. */
export function promotionsForProduct<T extends Promotion>(
  product: Pick<Product, 'id' | 'categoryId'>,
  promotions: readonly T[],
  categories: readonly Category[],
  date: string,
): T[] {
  return promotions
    .filter((p) => p.type !== 'bill_discount' && promotionStatus(p, date) === 'active')
    .filter((p) => inScope(p, product, categories))
    .sort((a, b) => b.priority - a.priority);
}

/** Fields that may still change once a promotion has started. */
const EDITABLE_AFTER_START = ['id', 'enabled', 'endDate', 'note'] as const;

/** Stable JSON (sorted keys at every level) of the fields locked after the start. */
function lockedFields(p: PromotionPayload | Promotion): string {
  const copy: Record<string, unknown> = { ...p };
  for (const key of EDITABLE_AFTER_START) delete copy[key];
  return JSON.stringify(copy, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}

export interface PromotionContext {
  products: readonly Product[];
  categories: readonly Category[];
  /** Every stored promotion (for the unique code check) */
  promotions: readonly Promotion[];
  today: string;
}

const isDate = (d: string | null) => d === null || /^\d{4}-\d{2}-\d{2}$/.test(d);
const isCount = (n: number) => Number.isInteger(n) && n >= 0;

/**
 * The single validation rule for promotions (form + mock server). Returns a Thai message or null.
 * `existing` = the stored version when editing; once it has started only enabled / endDate
 * (shortened, not before today) / note may change.
 */
export function promotionError(
  p: PromotionPayload,
  ctx: PromotionContext,
  existing?: Promotion,
): string | null {
  if (!/^[A-Z0-9-]{1,30}$/.test(p.code ?? ''))
    return 'รหัสโปรใช้ได้เฉพาะ A-Z, 0-9 และ - (ไม่เกิน 30 ตัว)';
  if (ctx.promotions.some((x) => x.id !== existing?.id && x.code === p.code)) {
    return `รหัสโปร ${p.code} ซ้ำ`;
  }
  if (!p.name?.trim()) return 'กรุณากรอกชื่อโปรโมชั่น';
  if (!p.startDate || !isDate(p.startDate) || !isDate(p.endDate)) return 'รูปแบบวันที่ไม่ถูกต้อง';
  if (p.endDate && p.endDate < p.startDate) return 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม';
  if (!Number.isInteger(p.priority) || p.priority < 0 || p.priority > 999) {
    return 'ลำดับความสำคัญต้องเป็นจำนวนเต็ม 0 - 999';
  }

  if (existing && hasStarted(existing, ctx.today)) {
    if (lockedFields(existing) !== lockedFields(p)) {
      return 'โปรที่เริ่มแล้วแก้ได้เฉพาะวันสิ้นสุด (เลื่อนให้เร็วขึ้น) การเปิด/ปิดใช้งาน และหมายเหตุ';
    }
    if (p.endDate !== existing.endDate) {
      if (!p.endDate) return 'โปรที่เริ่มแล้วขยายเป็นไม่กำหนดวันสิ้นสุดไม่ได้';
      if (existing.endDate && p.endDate > existing.endDate) {
        return 'โปรที่เริ่มแล้วเลื่อนวันสิ้นสุดให้ช้าลงไม่ได้ (สร้างโปรใหม่แทน)';
      }
      if (p.endDate < ctx.today)
        return 'วันสิ้นสุดใหม่ต้องไม่ก่อนวันนี้ (ต้องการหยุดทันทีให้ปิดใช้งาน)';
    }
    return null;
  }

  if (p.type !== 'bill_discount') {
    const { all, productIds, categoryIds } = p.scope;
    if (!all && !productIds.length && !categoryIds.length) {
      return 'กรุณาเลือกสินค้าหรือหมวดหมู่ที่ร่วมรายการ';
    }
    for (const id of productIds) {
      const product = ctx.products.find((x) => x.id === id);
      if (!product) return `ไม่พบ SKU #${id}`;
      if (isDiscontinued(product)) return `${product.sku} เลิกจำหน่ายแล้ว`;
    }
    for (const id of categoryIds) {
      const category = ctx.categories.find((c) => c.id === id);
      if (!category) return `ไม่พบหมวดหมู่ #${id}`;
      if (!category.active) return `หมวดหมู่ ${category.name} ปิดใช้งาน`;
    }
  }
  if (!isCount(p.minQty) || !(p.minAmount >= 0)) {
    return 'เงื่อนไขขั้นต่ำต้องไม่ติดลบ (จำนวนเป็นจำนวนเต็ม)';
  }

  if (p.type === 'free_goods') {
    if (p.discount) return 'โปรของแถมต้องไม่มีส่วนลด';
    const free = p.freeGoods;
    if (!free?.items.length) return 'กรุณาเลือกสินค้าแถมอย่างน้อย 1 รายการ';
    if (p.minQty <= 0 && p.minAmount <= 0) return 'กรุณากำหนดจำนวนหรือยอดซื้อขั้นต่ำ';
    const ids = free.items.map((i) => i.productId);
    if (new Set(ids).size !== ids.length) return 'สินค้าแถมซ้ำกัน';
    for (const item of free.items) {
      const product = ctx.products.find((x) => x.id === item.productId);
      if (!product) return `ไม่พบสินค้าแถม #${item.productId}`;
      if (!canSell(product)) return `${product.sku} ขายไม่ได้ จึงเป็นของแถมไม่ได้`;
      if (!Number.isInteger(item.qty) || item.qty < 1) return 'จำนวนของแถมต้องเป็นจำนวนเต็ม ≥ 1';
    }
    if (free.maxSets !== null && (!Number.isInteger(free.maxSets) || free.maxSets < 1)) {
      return 'จำนวนชุดสูงสุดต่อบิลต้องเป็นจำนวนเต็ม ≥ 1';
    }
    return null;
  }

  if (p.freeGoods) return 'โปรส่วนลดต้องไม่มีของแถม';
  const d = p.discount;
  if (!d) return 'กรุณากำหนดส่วนลด';
  if (d.kind === 'percent' && !(d.value > 0 && d.value <= 100))
    return 'ส่วนลด % ต้องมากกว่า 0 และไม่เกิน 100';
  if (d.kind === 'amount' && !(d.value > 0)) return 'ส่วนลดต้องมากกว่า 0 บาท';
  if (d.maxDiscount !== null && (d.kind !== 'percent' || !(d.maxDiscount > 0))) {
    return 'เพดานส่วนลดใช้กับส่วนลด % และต้องมากกว่า 0';
  }
  if (p.type === 'item_discount' && p.minQty < 1) return 'จำนวนขั้นต่ำต้องอย่างน้อย 1';
  return null;
}
