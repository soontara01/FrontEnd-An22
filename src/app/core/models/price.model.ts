/**
 * Sale price of one SKU for a date range. Periods of the same SKU never overlap,
 * so on any day a SKU has at most one price.
 * Dates are local calendar dates 'YYYY-MM-DD'; both ends inclusive.
 */
export interface SkuPrice {
  id: number;
  productId: number;
  price: number;
  startDate: string;
  /** null = open-ended (no end date) */
  endDate: string | null;
  note: string;
}

export type SkuPricePayload = Omit<SkuPrice, 'id'>;

export type PriceStatus = 'active' | 'scheduled' | 'expired';

export const PRICE_STATUS_LABEL: Record<PriceStatus, string> = {
  active: 'ใช้อยู่',
  scheduled: 'รอเริ่ม',
  expired: 'หมดอายุ',
};

type DateRange = Pick<SkuPrice, 'startDate' | 'endDate'>;

/** Far-future stand-in for an open end date (ISO strings compare lexicographically). */
const OPEN_END = '9999-12-31';

/** Local calendar date as 'YYYY-MM-DD' (not UTC, so it never shifts a day). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses 'YYYY-MM-DD' as a local date (new Date('YYYY-MM-DD') would be UTC midnight). */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayIso = (): string => toIsoDate(new Date());

/** Adds days to an ISO date, e.g. ('2026-12-31', 1) → '2027-01-01'. */
export function addDaysIso(iso: string, days: number): string {
  const date = fromIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function priceStatus(p: DateRange, today = todayIso()): PriceStatus {
  if (p.startDate > today) return 'scheduled';
  if (p.endDate && p.endDate < today) return 'expired';
  return 'active';
}

/** Inclusive overlap test; a null end date extends forever. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.startDate <= (b.endDate ?? OPEN_END) && b.startDate <= (a.endDate ?? OPEN_END);
}

/** The period in effect on `today`, if any. */
export function effectivePrice<T extends SkuPrice>(
  prices: readonly T[],
  today = todayIso(),
): T | undefined {
  return prices.find((p) => priceStatus(p, today) === 'active');
}

/** First period of the same SKU that overlaps `candidate` (ignoring `exceptId`, the one being edited). */
export function findOverlap(
  prices: readonly SkuPrice[],
  candidate: Pick<SkuPrice, 'productId' | 'startDate' | 'endDate'>,
  exceptId?: number,
): SkuPrice | undefined {
  return prices.find(
    (p) => p.productId === candidate.productId && p.id !== exceptId && rangesOverlap(p, candidate),
  );
}

/** e.g. '1 ก.ค. 2569 – ไม่กำหนด' */
export function formatDateRange(p: DateRange): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(
      fromIsoDate(iso),
    );
  return `${fmt(p.startDate)} – ${p.endDate ? fmt(p.endDate) : 'ไม่กำหนด'}`;
}
