import { CreditNote, PaymentType, Sale, round2 } from '@core/models';

export interface MethodTotal {
  methodId: number;
  name: string;
  type: PaymentType;
  /** Money in minus refunds (cash: after rounding, without change) */
  amount: number;
  /** Payment lines taken */
  count: number;
  /** Refunded through this method by credit notes */
  refunded: number;
}

export interface SalesSummary {
  /** Paid bills */
  count: number;
  /** Σ total of paid bills (VAT-inclusive) */
  total: number;
  vat: number;
  average: number;
  cancelledCount: number;
  cancelledTotal: number;
  /** Credit notes issued in the period (returns of earlier bills) */
  creditCount: number;
  creditTotal: number;
  /** POS bills only (older orders have no lines / cost), net of credit notes */
  posNet: number;
  cogs: number;
  grossProfit: number;
  /** Gross margin % of POS net sales (null without POS sales) */
  margin: number | null;
  /** Money in per payment method (paid POS bills − refunds), in order of first use */
  byMethod: MethodTotal[];
}

/**
 * Totals for the sales list; voided bills count only as cancelled. Credit notes of the period
 * reduce net sales, profit (refund net of VAT − cost of goods taken back into stock; written-off
 * goods stay a cost) and the money per method.
 */
export function summarizeSales(
  sales: readonly Sale[],
  notes: readonly CreditNote[] = [],
): SalesSummary {
  const paid = sales.filter((s) => s.status === 'paid');
  const cancelled = sales.filter((s) => s.status === 'cancelled');
  const pos = paid.filter((s) => s.lines.length);
  const sum = (values: number[]) => round2(values.reduce((a, b) => a + b, 0));

  const total = sum(paid.map((s) => s.total));
  const creditNet = sum(notes.map((n) => n.total - n.vat));
  const restocked = sum(notes.flatMap((n) => n.lines.filter((l) => l.restock).map((l) => l.cogs)));
  const posNet = round2(sum(pos.map((s) => s.total - s.vat)) - creditNet);
  const cogs = round2(sum(pos.flatMap((s) => s.lines.map((l) => l.cogs))) - restocked);
  const grossProfit = round2(posNet - cogs);

  const methods = new Map<number, MethodTotal>();
  for (const p of pos.flatMap((s) => s.payments)) {
    const m = methods.get(p.methodId) ?? {
      methodId: p.methodId,
      name: p.name,
      type: p.type,
      amount: 0,
      count: 0,
      refunded: 0,
    };
    methods.set(p.methodId, { ...m, amount: round2(m.amount + p.amount), count: m.count + 1 });
  }
  for (const r of notes.flatMap((n) => n.refunds)) {
    const m = methods.get(r.methodId) ?? {
      methodId: r.methodId,
      name: r.name,
      type: r.type,
      amount: 0,
      count: 0,
      refunded: 0,
    };
    methods.set(r.methodId, {
      ...m,
      amount: round2(m.amount - r.amount),
      refunded: round2(m.refunded + r.amount),
    });
  }

  return {
    count: paid.length,
    total,
    vat: sum(paid.map((s) => s.vat)),
    average: paid.length ? round2(total / paid.length) : 0,
    cancelledCount: cancelled.length,
    cancelledTotal: sum(cancelled.map((s) => s.total)),
    creditCount: notes.length,
    creditTotal: sum(notes.map((n) => n.total)),
    posNet,
    cogs,
    grossProfit,
    margin: posNet > 0 ? round2((grossProfit / posNet) * 100) : null,
    byMethod: [...methods.values()],
  };
}
