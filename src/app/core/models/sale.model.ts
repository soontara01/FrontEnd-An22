import type { Exchange } from './exchange.model';
import type { PaymentType } from './payment-method.model';
import { toIsoDate } from './price.model';
import type { ItemType, VatType } from './product.model';
import type { ApprovalCredentials } from './shift.model';
import type { TaxInvoiceBuyer } from './tax-invoice.model';

export type SaleStatus = 'pending' | 'paid' | 'cancelled';

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  pending: 'รอชำระ',
  paid: 'ชำระแล้ว',
  cancelled: 'ยกเลิก',
};

/** Badge class per status (global `.badge-*` classes). */
export const SALE_STATUS_BADGE: Record<SaleStatus, string> = {
  pending: 'badge-warn',
  paid: 'badge-success',
  cancelled: 'badge-error',
};

/** Goods returned through credit notes (server-derived, see `returnSummary()`). */
export type ReturnStatus = 'none' | 'partial' | 'full';

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  none: '',
  partial: 'คืนบางส่วน',
  full: 'คืนทั้งบิล',
};

/** Badge class per return status (global `.badge-*` classes). */
export const RETURN_STATUS_BADGE: Record<ReturnStatus, string> = {
  none: '',
  partial: 'badge-warn',
  full: 'badge-error',
};

/**
 * One line of a sale receipt (POS, decided 2026-10-04). Product fields are a snapshot taken at
 * sale time. Amounts are VAT-inclusive baht; `cogs` excludes VAT.
 */
export interface SaleLine {
  productId: number;
  sku: string;
  name: string;
  /** Receipt name (falls back to `name` when the SKU has no short name) */
  shortName: string;
  /** Unit sold (base unit or a pack unit) */
  unit: string;
  /** Base units per sold unit (1 = base unit); stock moves by qty × factor */
  factor: number;
  /** In sold units; always 1 for serial SKUs (one line per serial) */
  qty: number;
  /** Price per sold unit before discounts (0 for free items) */
  unitPrice: number;
  /** Sale price per sold unit at sale time, also for free items (credit-note deductions) */
  listPrice: number;
  /** Item promotions over the whole line */
  itemDiscount: number;
  /** Share of the bill discount allocated to this line */
  billDiscount: number;
  /** Manual discount (ส่วนลดพิเศษ) after promotions: the line's own + its share of the bill's */
  manualDiscount: number;
  /** unitPrice × qty − itemDiscount − billDiscount − manualDiscount */
  amount: number;
  vatType: VatType;
  itemType: ItemType;
  /** VAT contained in `amount` */
  vat: number;
  /** Item promotions applied to this line (the free-goods promotion for a free line) */
  promotionIds: number[];
  /** Set on free-item lines (price 0, still issues stock and takes COGS) */
  freeOfPromotionId: number | null;
  /** Serial SKUs only */
  serial: string | null;
  warrantyMonths: number;
  /** Cost of goods sold for the whole line, set by the server at sale time */
  cogs: number;
}

/** One tender line of a sale. */
export interface SalePayment {
  methodId: number;
  /** Snapshot of the method's name / type */
  name: string;
  type: PaymentType;
  /** Part of the bill settled by this line (cash: after rounding, excluding change) */
  amount: number;
  /** Money handed over (cash: ≥ amount, the excess is change; others: = amount) */
  tendered: number;
  reference: string;
  installmentMonths: number | null;
}

export interface Sale {
  id: number;
  /** Receipt number issued by the server: 'POS<terminal>-YYYYMMDD-NNNN' (older bills 'POS-YYYYMMDD-NNNN') */
  orderNo: string;
  /** ISO timestamp */
  date: string;
  cashier: string;
  /** '' = walk-in customer */
  customer: string;
  lines: SaleLine[];
  payments: SalePayment[];
  /** Σ unitPrice × qty */
  subtotal: number;
  itemDiscount: number;
  billDiscount: number;
  /** Amount due, VAT-inclusive (= Σ line amounts) */
  total: number;
  vat: number;
  /** Cash rounding (+ customer paid more / − less than `total`) */
  rounding: number;
  change: number;
  billPromotionIds: number[];
  /** Pieces in base units, free items included */
  itemCount: number;
  status: SaleStatus;
  voidedAt: string | null;
  voidReason: string;
  /** Full tax invoice issued for this bill (server-set), null = none */
  taxInvoiceNo: string | null;
  /** Read-only, server-derived from the bill's credit notes (any date): the bill itself never changes */
  returnStatus: ReturnStatus;
  /** Σ refunded by credit notes */
  creditedTotal: number;
  /** Credit note numbers, oldest first */
  creditNoteNos: string[];
  /** Read-only, server-derived: exchange numbers (same-SKU swaps), oldest first */
  exchangeNos: string[];
  /** Σ manual discounts (lines + bill) given at the POS */
  manualDiscount: number;
  /** Why the manual discount was given ('' = none) */
  manualDiscountReason: string;
  /** Who gave it (server-set from the logged-in user) */
  manualDiscountBy: string;
  /** Shift the sale was made in (server-set; missing / null = no shift: before shifts or `requireShift` off) */
  shiftId?: number | null;
  /** Shift the void was made in — its money goes out of that drawer (server-set) */
  voidShiftId?: number | null;
  /** Who voided the bill (server-set; missing = before this was recorded) */
  voidedBy?: string | null;
  /** Admin who approved a non-admin's void at the terminal (server-set; null = voided by an admin) */
  voidApprovedBy?: string | null;
  /** Terminal (POS device) the bill was made at (server-set snapshot; missing = before the registry) */
  terminalId?: number | null;
  /** That terminal's Revenue Dept POS ID when the bill was made — printed on its receipts */
  posId?: string;
  /**
   * Whether the store was VAT-registered when the bill was made (server-set snapshot, B20). false →
   * every `vat` is 0, it is not a tax invoice and is left out of the sales tax report. Missing =
   * registered (older data) — read it via `soldWithVat()`.
   */
  vatRegistered?: boolean;
}

/** Defaults for fields missing from older stored sales (before the POS existed). */
export const SALE_DEFAULTS: Omit<
  Sale,
  'id' | 'orderNo' | 'date' | 'customer' | 'total' | 'subtotal' | 'itemCount' | 'status'
> = {
  cashier: '',
  lines: [],
  payments: [],
  itemDiscount: 0,
  billDiscount: 0,
  vat: 0,
  rounding: 0,
  change: 0,
  billPromotionIds: [],
  voidedAt: null,
  voidReason: '',
  taxInvoiceNo: null,
  returnStatus: 'none',
  creditedTotal: 0,
  creditNoteNos: [],
  exchangeNos: [],
  manualDiscount: 0,
  manualDiscountReason: '',
  manualDiscountBy: '',
};

/**
 * Defaults for line fields added after the first POS release, or a `null` an API might leave out
 * of its JSON (B24). `listPrice` falls back to `unitPrice` and `shortName` to `name` instead.
 */
export const SALE_LINE_DEFAULTS: Omit<
  SaleLine,
  'productId' | 'sku' | 'name' | 'shortName' | 'unit' | 'qty' | 'unitPrice' | 'listPrice' | 'amount'
> = {
  factor: 1,
  itemDiscount: 0,
  billDiscount: 0,
  manualDiscount: 0,
  vatType: 'vat7',
  itemType: 'stock',
  vat: 0,
  promotionIds: [],
  freeOfPromotionId: null,
  serial: null,
  warrantyMonths: 0,
  cogs: 0,
};

type StoredSaleLine = Pick<SaleLine, 'name' | 'unitPrice'> & Partial<SaleLine>;

/**
 * A sale as read from the server or the mock db with every field that may be missing filled in
 * (older data, or an API that drops `null` fields). Call it wherever a `Sale` comes in.
 */
export function normalizeSale(s: Pick<Sale, 'total'> & Partial<Sale>): Sale {
  const lines = (s.lines ?? []).map((l: StoredSaleLine) => ({
    ...withDefaults(SALE_LINE_DEFAULTS, l),
    shortName: l.shortName ?? l.name,
    listPrice: l.listPrice ?? l.unitPrice,
  }));
  return { ...withDefaults({ ...SALE_DEFAULTS, subtotal: s.total }, s), lines } as Sale;
}

/** `o` over `defaults`, where a missing or `null` value takes the default; other nulls stay. */
function withDefaults<D extends object, T extends object>(defaults: D, o: T): D & T {
  const merged = { ...defaults, ...o } as Record<string, unknown>;
  for (const [key, value] of Object.entries(defaults)) merged[key] ??= value;
  return merged as D & T;
}

/** A free-goods line (price 0); `!= null` so a missing field never makes every line free (B24). */
export const isFreeLine = (line: Pick<SaleLine, 'freeOfPromotionId'>): boolean =>
  line.freeOfPromotionId != null;

/** Local calendar day ('YYYY-MM-DD') a sale was made. */
export const saleDay = (sale: Pick<Sale, 'date'>): string => toIsoDate(new Date(sale.date));

/**
 * Serial the customer holds now for a sale line: the latest exchange's new serial, else the one
 * sold. Credit notes and void return this one.
 */
export function currentSerial(
  sale: Pick<Sale, 'lines'>,
  index: number,
  exchanges: readonly Pick<Exchange, 'date' | 'lines'>[],
): string | null {
  const swaps = [...exchanges]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((x) => x.lines.filter((l) => l.saleLineIndex === index && l.newSerial));
  return swaps.at(-1)?.newSerial ?? sale.lines[index]?.serial ?? null;
}

/**
 * Void rule (decided 2026-10-04), shared by the sales menu and the server: a paid bill can be
 * voided only on the day of sale and with a reason. From the next day on the sale stays as it is
 * and goods/money go back through a credit note (ใบลดหนี้) instead.
 */
export function voidError(
  sale: Pick<Sale, 'date' | 'status'>,
  reason: string,
  today: string,
): string | null {
  if (sale.status !== 'paid') return 'ยกเลิกได้เฉพาะบิลที่ชำระแล้ว';
  if (saleDay(sale) !== today) return 'ยกเลิกได้เฉพาะบิลของวันนี้ บิลข้ามวันต้องออกใบลดหนี้';
  if (!reason.trim()) return 'กรุณาระบุเหตุผลการยกเลิก';
  return null;
}

/** `POST /sales/:id/void`: a non-admin needs an admin's login typed at the terminal (else 403). */
export interface VoidPayload {
  reason: string;
  approval?: ApprovalCredentials | null;
}

/** One cart line as entered by the cashier (prices and promotions are derived). */
export interface CartItem {
  productId: number;
  /** 1 = base unit, else the factor of one of the SKU's pack units */
  factor: number;
  qty: number;
  /** Required for serial SKUs (then qty = 1) */
  serial: string | null;
  /** Manual discount on the whole line, after promotions (null / missing = none) */
  manualDiscount?: ManualDiscount | null;
}

/** A discount typed by the cashier (ส่วนลดพิเศษ): percent of the price after promotions, or baht. */
export interface ManualDiscount {
  kind: 'percent' | 'amount';
  value: number;
}

/** Serial scanned for a free item of a serial-controlled SKU. */
export interface FreeSerial {
  promotionId: number;
  productId: number;
  serial: string;
}

/** A payment as entered at the POS. For cash, `amount` is the money handed over. */
export interface PaymentInput {
  methodId: number;
  amount: number;
  reference: string;
  installmentMonths: number | null;
}

/** POST /sales body: the server re-prices the cart and rejects it when the total differs. */
export interface SalePayload {
  items: CartItem[];
  freeSerials: FreeSerial[];
  payments: PaymentInput[];
  customer: string;
  expectedTotal: number;
  /** Buyer for a full tax invoice issued together with the sale (null = abbreviated only) */
  buyer: TaxInvoiceBuyer | null;
  /** Manual discount on the whole bill, after promotions and line manual discounts */
  billManualDiscount?: ManualDiscount | null;
  /** Required whenever any manual discount is given */
  manualDiscountReason?: string;
}

/** Sold while the store was VAT-registered (snapshot on the bill / its credit notes; missing = yes). */
export const soldWithVat = (doc: { vatRegistered?: boolean }): boolean =>
  doc.vatRegistered !== false;
