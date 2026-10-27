import { Sale } from '@core/models';

/**
 * Bill list search: bill number, customer, cashier or a serial — the sold one or one handed out
 * later by an exchange (`exchangedSerials`, C3-9). `text` is matched case-insensitively.
 */
export function matchesSaleSearch(
  sale: Sale,
  text: string,
  exchangedSerials: readonly string[] = [],
): boolean {
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  return [
    sale.orderNo,
    sale.customer,
    sale.cashier,
    ...sale.lines.map((l) => l.serial ?? ''),
    ...exchangedSerials,
  ].some((v) => v.toLowerCase().includes(needle));
}
