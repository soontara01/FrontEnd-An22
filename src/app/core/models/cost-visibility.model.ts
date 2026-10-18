import type { CompanyInfo } from './company.model';
import type { User } from './user.model';

/**
 * Who sees cost / profit (P5, E43): the owner and admins always; staff (`user`) only when the
 * company turns `CompanyInfo.staffSeeCost` on (off by default). The server answers everyone else
 * with every `COST_FIELDS` value `null` (`hideCost()`), and screens hide them with
 * `AuthService.canSeeCost` — the same rule, sent in the session.
 */
export function canSeeCost(
  user: Pick<User, 'role'> | null | undefined,
  company: Pick<CompanyInfo, 'staffSeeCost'>,
): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'owner' || company.staffSeeCost;
}

/**
 * Response keys that carry a cost (excl. VAT) or a value at cost: `Product.cost` / `avgCost` /
 * `suppliers[].cost`, `SerialNumber.cost`, `StockMovement` costs and balances, `SaleLine.cogs`,
 * `CreditNoteLine.cogs`, `TransferLine.unitCost`, exchange `costIn` / `costOut`,
 * `BranchStockRow.avgCost`, stock card `totals.inCost` / `outCost`. No other response uses these
 * names (`cost-visibility.model.spec.ts`). A stock balance `{ qty, avgCost, value }` also loses
 * `value` (that name alone is not a cost: promotions, manual discounts and shift counts use it).
 */
export const COST_FIELDS: ReadonlySet<string> = new Set([
  'cost',
  'avgCost',
  'cogs',
  'unitCost',
  'totalCost',
  'balanceAvgCost',
  'balanceValue',
  'costIn',
  'costOut',
  'inCost',
  'outCost',
]);

/** A copy of a response body with every `COST_FIELDS` value set to `null` (kept, never dropped — B24). */
export function hideCost<T>(body: T): T {
  return strip(body) as T;
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  // Only plain JSON objects (a Blob / Date answer passes as it is).
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return value;
  const balance = 'avgCost' in value && 'value' in value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [
      key,
      COST_FIELDS.has(key) || (balance && key === 'value') ? null : strip(v),
    ]),
  );
}
