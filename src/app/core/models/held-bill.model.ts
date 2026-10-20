import type { CartItem, FreeSerial, ManualDiscount } from './sale.model';
import type { TaxInvoiceBuyer } from './tax-invoice.model';

/**
 * A bill the POS parked (พักบิล) to serve someone else first — kept by the server per branch +
 * terminal (`/pos/held-bills`, E48; it may hold the buyer's tax ID / address, so never in
 * localStorage). The id is issued by the server.
 */
export interface HeldBill {
  id: string;
  /** ISO timestamp */
  heldAt: string;
  customer: string;
  items: CartItem[];
  freeSerials: FreeSerial[];
  /** Full tax invoice requested for the bill (missing in bills parked before it existed) */
  buyer?: TaxInvoiceBuyer | null;
  /** Manual discount on the whole bill + its reason (missing in bills parked before it existed) */
  billManual?: ManualDiscount | null;
  manualReason?: string;
  /** Total when parked (display only; re-priced on resume) */
  total: number;
}
