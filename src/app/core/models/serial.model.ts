import type { StockMovement } from './costing.model';
import { Product } from './product.model';

/** `in_stock` = in the warehouse; the others are "removed" states kept as history. */
export type SerialStatus = 'in_stock' | 'sold' | 'damaged' | 'other';
export type SerialRemoveStatus = Exclude<SerialStatus, 'in_stock'>;

/** One physical unit of a serial-controlled SKU. Never deleted; removal changes `status`. */
export interface SerialNumber {
  id: number;
  productId: number;
  serial: string;
  status: SerialStatus;
  receivedAt: string;
  removedAt: string | null;
  note: string;
  /** Purchase cost of this unit, excl. VAT (specific identification) */
  cost: number;
}

export interface SerialReceiveResult {
  product: Product;
  received: SerialNumber[];
}

export const SERIAL_STATUS_LABEL: Record<SerialStatus, string> = {
  in_stock: 'คงคลัง',
  sold: 'ขายแล้ว',
  damaged: 'ชำรุด/เสียหาย',
  other: 'อื่นๆ',
};

const SERIAL_CHARS = /^[A-Z0-9-]+$/;

/**
 * Validates a serial against the SKU's format (shared by the UI and the mock backend).
 * Returns a Thai error message, or null when valid.
 */
export function serialFormatError(
  serial: string,
  format: Pick<Product, 'serialPrefix' | 'serialLength'>,
): string | null {
  if (!SERIAL_CHARS.test(serial)) return 'ใช้ได้เฉพาะ A-Z, 0-9 และ -';
  if (format.serialPrefix && !serial.startsWith(format.serialPrefix)) {
    return `ต้องขึ้นต้นด้วย ${format.serialPrefix}`;
  }
  if (format.serialLength && serial.length !== format.serialLength) {
    return `ต้องยาว ${format.serialLength} ตัว (ตอนนี้ ${serial.length})`;
  }
  return null;
}

/**
 * Everything that happened to one serial, oldest first, from the SKU's stock movements (B18): a
 * unit removed and later received again keeps one `SerialNumber` record whose status / note are
 * overwritten, so its history is read from the stock card instead (no history field to keep in sync).
 */
export const serialMovements = (
  serial: string,
  movements: readonly StockMovement[],
): StockMovement[] =>
  movements
    .filter((m) => m.serials.includes(serial))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
