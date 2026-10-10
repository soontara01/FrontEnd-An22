import type { Category } from './category.model';
import { effectiveCost, round2 } from './costing.model';
import { Product, canSell, isService, vatBreakdown } from './product.model';
import { Promotion, discountAmount, inScope, promotionStatus } from './promotion.model';
import type { CartItem, FreeSerial, ManualDiscount, SaleLine } from './sale.model';

/**
 * POS pricing engine (decided 2026-10-04): the single rule for cart totals, shared by the POS
 * screen and the server (mock), which re-prices every submitted cart.
 *
 * 1. list price per sold unit = currentPrice × factor
 * 2. item promotions per line, priority first: the first eligible one applies; later ones only
 *    while everything applied so far and the candidate are stackable (a non-stackable one stops
 *    the rest). item_discount is eligible when the line has ≥ minQty base units; free_goods
 *    when its in-scope lines (at list price) reach one set. Discounts compound per base unit.
 * 3. free goods per promotion over the lines that chose it: sets by pieces (minQty) or by the
 *    amount after item discounts (minAmount); `repeat` / `maxSets` limit them. Free lines are
 *    capped at the stock left (warning, not blocking).
 * 4. bill discounts (same priority/stackable walk) once the total after item discounts reaches
 *    minAmount, compounding on the discounted total.
 * 5. the bill discount is allocated to paid lines pro rata (remainder to the largest line), so
 *    VAT is right for bills mixing vat7 and exempt SKUs.
 * 6. manual discounts (ส่วนลดพิเศษ, % or baht) after every promotion: each line's own on its
 *    amount, then the bill's on what is left, allocated pro rata; `manualDiscountError()` holds
 *    the reason / staff-ceiling rule. Below cost after them is a warning only.
 */

export interface PricingContext {
  products: readonly Product[];
  promotions: readonly Promotion[];
  categories: readonly Category[];
  /** Sale date, local 'YYYY-MM-DD' */
  date: string;
}

export interface PricedLine extends Omit<SaleLine, 'cogs'> {
  /** Index of the cart item; null for free lines */
  cartIndex: number | null;
}

export interface CartIssue {
  cartIndex: number | null;
  productId: number;
  message: string;
  /** Blocking issues prevent checkout; the others are warnings */
  blocking: boolean;
}

export interface PricedCart {
  /** Paid lines in cart order, then free lines */
  lines: PricedLine[];
  subtotal: number;
  itemDiscount: number;
  billDiscount: number;
  /** Σ manual discounts (lines' own + the bill's) */
  manualDiscount: number;
  /** The bill-level manual discount in baht (already inside `manualDiscount`) */
  manualBillDiscount: number;
  total: number;
  vat: number;
  billPromotionIds: number[];
  itemCount: number;
  issues: CartIssue[];
}

/** Sum rounded to satang. */
const sum = (values: number[]): number => round2(values.reduce((a, b) => a + b, 0));

/** Deterministic order: priority (high first), then id. */
const byPriority = (a: Promotion, b: Promotion): number => b.priority - a.priority || a.id - b.id;

/** The priority/stackable walk shared by item and bill promotions. */
function selectPromotions(
  candidates: readonly Promotion[],
  eligible: (p: Promotion) => boolean,
): Promotion[] {
  const applied: Promotion[] = [];
  for (const p of candidates) {
    if (!eligible(p)) continue;
    if (!applied.length) {
      applied.push(p);
      if (!p.stackable) break;
    } else if (p.stackable) {
      applied.push(p);
    }
  }
  return applied;
}

/** Free sets earned by `qty` base units / `amount` baht of qualifying items. */
export function freeSets(
  p: Pick<Promotion, 'minQty' | 'minAmount' | 'freeGoods'>,
  qty: number,
  amount: number,
): number {
  const free = p.freeGoods;
  if (!free) return 0;
  let sets = p.minQty > 0 ? Math.floor(qty / p.minQty) : p.minAmount > 0 ? amount / p.minAmount : 0;
  sets = Math.floor(sets + 1e-9);
  if (!free.repeat) sets = Math.min(sets, 1);
  if (free.maxSets !== null) sets = Math.min(sets, free.maxSets);
  return Math.max(sets, 0);
}

/** Name / unit / VAT snapshot of a product for a sale line. */
function snapshot(product: Product, factor: number) {
  const pack = product.packUnits.find((u) => u.factor === factor);
  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    shortName: product.shortName || product.name,
    unit: pack?.unit ?? product.unit,
    factor,
    vatType: product.vatType,
    itemType: product.itemType,
    warrantyMonths: product.warrantyMonths,
  };
}

interface Working {
  index: number;
  item: CartItem;
  product: Product;
  baseQty: number;
  gross: number;
  promos: Promotion[];
  itemDiscount: number;
}

/** Prices a cart. Never throws: invalid items are left out and reported in `issues`. */
export function priceCart(
  items: readonly CartItem[],
  ctx: PricingContext,
  freeSerials: readonly FreeSerial[] = [],
  /** Manual discount on the whole bill (after promotions and line manual discounts) */
  billManual: ManualDiscount | null = null,
): PricedCart {
  const issues: CartIssue[] = [];
  const products = new Map(ctx.products.map((p) => [p.id, p]));
  const active = ctx.promotions
    .filter((p) => promotionStatus(p, ctx.date) === 'active')
    .sort(byPriority);
  const itemPromos = active.filter((p) => p.type !== 'bill_discount');
  const blocking = (index: number | null, productId: number, message: string): void => {
    issues.push({ cartIndex: index, productId, message, blocking: true });
  };

  // 1. Valid paid lines at list price.
  const lines: Working[] = [];
  const seenSerials = new Set<string>();
  items.forEach((item, index): void => {
    const product = products.get(item.productId);
    if (!product) return blocking(index, item.productId, `ไม่พบสินค้า #${item.productId}`);
    if (!canSell(product)) return blocking(index, product.id, `${product.sku} ห้ามขาย`);
    if (product.currentPrice === null) {
      return blocking(index, product.id, `${product.sku} ยังไม่กำหนดราคาขาย`);
    }
    if (item.factor !== 1 && !product.packUnits.some((u) => u.factor === item.factor)) {
      return blocking(index, product.id, `${product.sku} ไม่มีหน่วยขายนี้`);
    }
    if (!Number.isInteger(item.qty) || item.qty < 1) {
      return blocking(index, product.id, `${product.sku} จำนวนต้องเป็นจำนวนเต็ม ≥ 1`);
    }
    if (product.serialControl) {
      if (item.qty !== 1) return blocking(index, product.id, `${product.sku} ขายทีละ 1 ซีเรียล`);
      if (!item.serial) blocking(index, product.id, `${product.sku} ต้องระบุซีเรียล`);
      else if (seenSerials.has(item.serial)) {
        blocking(index, product.id, `ซีเรียล ${item.serial} ซ้ำในบิล`);
      } else seenSerials.add(item.serial);
    }
    lines.push({
      index,
      item,
      product,
      baseQty: item.qty * item.factor,
      gross: round2(product.currentPrice * item.factor * item.qty),
      promos: [],
      itemDiscount: 0,
    });
  });

  // 2. Item promotions per line.
  const inScopeLines = (p: Promotion) => lines.filter((l) => inScope(p, l.product, ctx.categories));
  const reachable = new Map(
    itemPromos
      .filter((p) => p.type === 'free_goods')
      .map((p) => {
        const scoped = inScopeLines(p);
        const qty = scoped.reduce((n, l) => n + l.baseQty, 0);
        const amount = sum(scoped.map((l) => l.gross));
        return [p.id, freeSets(p, qty, amount) > 0] as const;
      }),
  );
  for (const line of lines) {
    const candidates = itemPromos.filter((p) => inScope(p, line.product, ctx.categories));
    line.promos = selectPromotions(candidates, (p) =>
      p.type === 'item_discount' ? line.baseQty >= p.minQty : !!reachable.get(p.id),
    );
    let unitPrice = line.product.currentPrice ?? 0;
    for (const p of line.promos) {
      if (p.type === 'item_discount' && p.discount) {
        unitPrice = round2(unitPrice - discountAmount(unitPrice, p.discount));
      }
    }
    const perUnit = round2((line.product.currentPrice ?? 0) - unitPrice);
    line.itemDiscount = Math.min(round2(perUnit * line.baseQty), line.gross);
  }

  // Stock left per SKU after the paid lines (services are never limited).
  const stockLeft = new Map<number, number>();
  for (const line of lines) {
    if (isService(line.product)) continue;
    const left = (stockLeft.get(line.product.id) ?? line.product.stock) - line.baseQty;
    stockLeft.set(line.product.id, left);
  }
  for (const [productId, left] of stockLeft) {
    if (left < 0) {
      const product = products.get(productId)!;
      blocking(
        null,
        productId,
        `${product.sku} สต็อกไม่พอ (คงเหลือ ${product.stock} ${product.unit})`,
      );
    }
  }

  // 3. Free goods.
  const freeLines: PricedLine[] = [];
  const freeSerialsLeft = [...freeSerials];
  for (const p of itemPromos.filter((x) => x.type === 'free_goods')) {
    const chosen = lines.filter((l) => l.promos.includes(p));
    const qty = chosen.reduce((n, l) => n + l.baseQty, 0);
    const amount = sum(chosen.map((l) => l.gross - l.itemDiscount));
    const sets = freeSets(p, qty, amount);
    if (!sets) continue;
    for (const free of p.freeGoods?.items ?? []) {
      const product = products.get(free.productId);
      if (!product || !canSell(product)) continue;
      let freeQty = free.qty * sets;
      if (!isService(product)) {
        const left = Math.max(stockLeft.get(product.id) ?? product.stock, 0);
        if (left < freeQty) {
          issues.push({
            cartIndex: null,
            productId: product.id,
            message: `ของแถม ${product.sku} สต็อกไม่พอ แถมได้ ${left} จาก ${freeQty} ${product.unit}`,
            blocking: false,
          });
          freeQty = left;
        }
        stockLeft.set(product.id, left - freeQty);
      }
      if (!freeQty) continue;
      const base = {
        ...snapshot(product, 1),
        unitPrice: 0,
        listPrice: product.currentPrice ?? 0,
        itemDiscount: 0,
        billDiscount: 0,
        manualDiscount: 0,
      };
      const extra = { amount: 0, vat: 0, promotionIds: [p.id], freeOfPromotionId: p.id };
      if (!product.serialControl) {
        freeLines.push({ ...base, ...extra, qty: freeQty, serial: null, cartIndex: null });
        continue;
      }
      for (let n = 0; n < freeQty; n++) {
        const at = freeSerialsLeft.findIndex(
          (s) => s.promotionId === p.id && s.productId === product.id,
        );
        const serial = at < 0 ? null : freeSerialsLeft.splice(at, 1)[0].serial;
        if (!serial) {
          blocking(null, product.id, `ต้องสแกนซีเรียลของแถม ${product.sku}`);
        } else if (seenSerials.has(serial)) {
          blocking(null, product.id, `ซีเรียล ${serial} ซ้ำในบิล`);
        } else seenSerials.add(serial);
        freeLines.push({ ...base, ...extra, qty: 1, serial, cartIndex: null });
      }
    }
  }

  // 4. Bill discounts on the total after item discounts.
  const afterItems = sum(lines.map((l) => l.gross - l.itemDiscount));
  const billPromos = selectPromotions(
    active.filter((p) => p.type === 'bill_discount'),
    (p) => afterItems > 0 && afterItems >= p.minAmount,
  );
  let running = afterItems;
  for (const p of billPromos) {
    if (p.discount) running = round2(running - discountAmount(running, p.discount));
  }
  const billDiscount = round2(afterItems - running);

  // 5. Allocate the bill discount pro rata to paid lines.
  const shares = allocate(
    billDiscount,
    lines.map((l) => l.gross - l.itemDiscount),
  );
  const afterPromos = lines.map((l, i) => round2(l.gross - l.itemDiscount - shares[i]));

  // 6. Manual discounts (ส่วนลดพิเศษ) after every promotion: each line's own, then the bill's,
  //    allocated pro rata like the promotion bill discount. Promotions are never re-checked.
  const own = lines.map((l, i) =>
    manualAmount(l.item.manualDiscount, afterPromos[i], `${l.product.sku}`, (message) =>
      blocking(l.index, l.product.id, message),
    ),
  );
  const rest = afterPromos.map((a, i) => round2(a - own[i]));
  const manualBillDiscount = manualAmount(billManual, sum(rest), 'ส่วนลดท้ายบิล', (message) =>
    blocking(null, 0, message),
  );
  const manualShares = allocate(manualBillDiscount, rest);
  const manual = own.map((m, i) => round2(m + manualShares[i]));

  const paid: PricedLine[] = lines.map((l, i) => {
    const amount = round2(afterPromos[i] - manual[i]);
    if (manual[i] > 0 && !isService(l.product)) {
      const cost = round2(effectiveCost(l.product) * l.baseQty);
      if (vatBreakdown(amount, l.product.vatType).net < cost) {
        issues.push({
          cartIndex: l.index,
          productId: l.product.id,
          message: `${l.product.sku} ขายต่ำกว่าทุนหลังส่วนลดพิเศษ`,
          blocking: false,
        });
      }
    }
    return {
      ...snapshot(l.product, l.item.factor),
      qty: l.item.qty,
      unitPrice: round2((l.product.currentPrice ?? 0) * l.item.factor),
      listPrice: round2((l.product.currentPrice ?? 0) * l.item.factor),
      itemDiscount: l.itemDiscount,
      billDiscount: shares[i],
      manualDiscount: manual[i],
      amount,
      vat: vatBreakdown(amount, l.product.vatType).vat,
      promotionIds: l.promos.map((p) => p.id),
      freeOfPromotionId: null,
      serial: l.product.serialControl ? l.item.serial : null,
      cartIndex: l.index,
    };
  });
  const all = [...paid, ...freeLines];
  return {
    lines: all,
    subtotal: sum(lines.map((l) => l.gross)),
    itemDiscount: sum(lines.map((l) => l.itemDiscount)),
    billDiscount,
    manualDiscount: sum(manual),
    manualBillDiscount,
    total: sum(paid.map((l) => l.amount)),
    vat: sum(paid.map((l) => l.vat)),
    billPromotionIds: billDiscount > 0 ? billPromos.map((p) => p.id) : [],
    itemCount: all.reduce((n, l) => n + l.qty * l.factor, 0),
    issues,
  };
}

/** Splits `total` over `weights` pro rata (satang), the remainder going to the largest weight. */
function allocate(total: number, weights: readonly number[]): number[] {
  const whole = sum([...weights]);
  const shares = weights.map((w) => (whole > 0 ? round2((total * w) / whole) : 0));
  const remainder = round2(total - sum(shares));
  if (remainder !== 0 && weights.length) {
    const largest = weights.indexOf(Math.max(...weights));
    shares[largest] = round2(shares[largest] + remainder);
  }
  return shares;
}

/** Why a manual discount value is invalid (null = valid): percent 0 < v ≤ 100, baht > 0 in satang. */
export function manualDiscountValueError(discount: ManualDiscount): string | null {
  const { kind, value } = discount;
  if (kind === 'percent') {
    return value > 0 && value <= 100 ? null : 'ส่วนลดพิเศษต้องมากกว่า 0 และไม่เกิน 100%';
  }
  return value > 0 && round2(value) === value ? null : 'จำนวนเงินส่วนลดพิเศษไม่ถูกต้อง';
}

/** Baht of a valid manual discount on `base` (capped at it), as the pricing engine takes it. */
export function manualDiscountBaht(discount: ManualDiscount, base: number): number {
  const baht = discount.kind === 'percent' ? round2((base * discount.value) / 100) : discount.value;
  return Math.min(baht, base);
}

/** Baht of a manual discount on `base`; an invalid value is reported and gives 0. */
function manualAmount(
  discount: ManualDiscount | null | undefined,
  base: number,
  label: string,
  report: (message: string) => void,
): number {
  if (!discount) return 0;
  const problem = manualDiscountValueError(discount);
  if (problem) {
    report(`${label}: ${problem}`);
    return 0;
  }
  return manualDiscountBaht(discount, base);
}

/**
 * Manual-discount rule (decided 2026-10-10, POS + server): a reason is always required, and staff
 * may give at most `maxPercent` of each line's price after promotions (its own + its share of the
 * bill's); above that only admins.
 */
export function manualDiscountError(
  cart: Pick<PricedCart, 'lines' | 'manualDiscount'>,
  ctx: { reason: string; isAdmin: boolean; maxPercent: number },
): string | null {
  if (cart.manualDiscount <= 0) return null;
  if (!ctx.reason.trim()) return 'กรุณาระบุเหตุผลส่วนลดพิเศษ';
  if (ctx.isAdmin) return null;
  const over = cart.lines.find(
    (l) => l.manualDiscount > round2(((l.amount + l.manualDiscount) * ctx.maxPercent) / 100),
  );
  return over ? `ส่วนลดพิเศษ ${over.sku} เกิน ${ctx.maxPercent}% — ให้ผู้ดูแลระบบทำรายการ` : null;
}

/** First blocking issue (Thai message) or null — the checkout rule for the POS and the server. */
export const cartError = (cart: Pick<PricedCart, 'lines' | 'issues'>): string | null =>
  cart.issues.find((i) => i.blocking)?.message ??
  (cart.lines.length ? null : 'ยังไม่มีสินค้าในบิล');
