import type { PaymentType } from './payment-method.model';
import type { VatType } from './product.model';

export type SaleStatus = 'pending' | 'paid' | 'cancelled';

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
  /** Item promotions over the whole line */
  itemDiscount: number;
  /** Share of the bill discount allocated to this line */
  billDiscount: number;
  /** unitPrice × qty − itemDiscount − billDiscount */
  amount: number;
  vatType: VatType;
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
  /** Receipt number issued by the server, e.g. 'POS-20261004-0001' */
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
};

/** One cart line as entered by the cashier (prices and promotions are derived). */
export interface CartItem {
  productId: number;
  /** 1 = base unit, else the factor of one of the SKU's pack units */
  factor: number;
  qty: number;
  /** Required for serial SKUs (then qty = 1) */
  serial: string | null;
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
}
