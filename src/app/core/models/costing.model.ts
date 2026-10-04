import type { Product } from './product.model';
import { toIsoDate } from './price.model';

/**
 * Inventory costing (decided 2026-10-04):
 * - serial-controlled SKUs → specific identification (each SerialNumber carries its own cost)
 * - other SKUs → moving weighted average, recalculated on every receipt
 * `Product.cost` is only the standard/default cost (prefill when receiving, estimate when no stock).
 */
export type MovementType = 'opening' | 'receive' | 'issue';

export const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  opening: 'ยอดยกมา',
  receive: 'รับเข้า',
  issue: 'ตัดออก',
};

/** One line of the stock card (inventory ledger) of a SKU. Costs exclude VAT. */
export interface StockMovement {
  id: number;
  productId: number;
  /** ISO timestamp */
  date: string;
  type: MovementType;
  /** + in / − out, in base units */
  qty: number;
  /** Cost per base unit of this movement */
  unitCost: number;
  /** qty × unitCost (serial SKUs: sum of the serials' own costs) */
  totalCost: number;
  balanceQty: number;
  balanceAvgCost: number;
  balanceValue: number;
  /** Serial numbers moved (serial SKUs only) */
  serials: string[];
  /** Reason / reference, e.g. supplier invoice number */
  note: string;
}

const round4 = (n: number): number => Math.round(n * 10000) / 10000;
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** New moving-average cost after receiving `qtyIn` units at `unitCost`. */
export function movingAverage(stock: number, avg: number, qtyIn: number, unitCost: number): number {
  const qty = Math.max(stock, 0) + qtyIn;
  if (qty <= 0) return round4(avg);
  return round4((Math.max(stock, 0) * avg + qtyIn * unitCost) / qty);
}

/**
 * Cost to use for margins/estimates: real average while in stock, else the standard cost.
 * Service SKUs never have stock, so this is always their standard cost (= cost per sale).
 */
export const effectiveCost = (p: Pick<Product, 'stock' | 'avgCost' | 'cost'>): number =>
  p.stock > 0 && p.avgCost > 0 ? p.avgCost : p.cost;

/** Inventory value at cost. */
export const costValue = (p: Pick<Product, 'stock' | 'avgCost'>): number =>
  round2(p.stock * p.avgCost);

export interface StockBalance {
  qty: number;
  avgCost: number;
  value: number;
}

/** Stock card for a date range: brought-forward balance, movements in range, closing balance. */
export interface StockCardResult {
  /** Local dates 'YYYY-MM-DD' (inclusive); null = unbounded */
  from: string | null;
  to: string | null;
  opening: StockBalance;
  movements: StockMovement[];
  closing: StockBalance;
  totals: { inQty: number; inCost: number; outQty: number; outCost: number };
}

const ZERO_BALANCE: StockBalance = { qty: 0, avgCost: 0, value: 0 };

const balanceOf = (m: StockMovement): StockBalance => ({
  qty: m.balanceQty,
  avgCost: m.balanceAvgCost,
  value: m.balanceValue,
});

/**
 * Slices a SKU's movements (oldest first) to [from, to] by local calendar date and derives
 * the opening (last movement before `from`) and closing (last movement ≤ `to`) balances.
 */
export function buildStockCard(
  movements: readonly StockMovement[],
  from: string | null,
  to: string | null,
): StockCardResult {
  const day = (m: StockMovement) => toIsoDate(new Date(m.date));
  const before = from ? movements.filter((m) => day(m) < from) : [];
  const inRange = movements.filter((m) => (!from || day(m) >= from) && (!to || day(m) <= to));
  const opening = before.length ? balanceOf(before[before.length - 1]) : ZERO_BALANCE;
  const closing = inRange.length ? balanceOf(inRange[inRange.length - 1]) : opening;
  const totals = inRange.reduce(
    (t, m) =>
      m.qty > 0
        ? { ...t, inQty: t.inQty + m.qty, inCost: round2(t.inCost + m.totalCost) }
        : { ...t, outQty: t.outQty - m.qty, outCost: round2(t.outCost - m.totalCost) },
    { inQty: 0, inCost: 0, outQty: 0, outCost: 0 },
  );
  return { from, to, opening: { ...opening }, movements: inRange, closing: { ...closing }, totals };
}
