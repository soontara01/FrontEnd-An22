import { PaymentType, Sale, round2 } from '@core/models';

export interface MethodTotal {
  methodId: number;
  name: string;
  type: PaymentType;
  /** Settled amount (cash: after rounding, without change) */
  amount: number;
  count: number;
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
  /** POS bills only (older orders have no lines / cost) */
  posNet: number;
  cogs: number;
  grossProfit: number;
  /** Gross margin % of POS net sales (null without POS sales) */
  margin: number | null;
  /** Money in per payment method (paid POS bills), in button order of first use */
  byMethod: MethodTotal[];
}

/** Totals for the sales list; voided bills count only as cancelled. */
export function summarizeSales(sales: readonly Sale[]): SalesSummary {
  const paid = sales.filter((s) => s.status === 'paid');
  const cancelled = sales.filter((s) => s.status === 'cancelled');
  const pos = paid.filter((s) => s.lines.length);
  const sum = (values: number[]) => round2(values.reduce((a, b) => a + b, 0));

  const total = sum(paid.map((s) => s.total));
  const posNet = sum(pos.map((s) => s.total - s.vat));
  const cogs = sum(pos.flatMap((s) => s.lines.map((l) => l.cogs)));
  const grossProfit = round2(posNet - cogs);

  const methods = new Map<number, MethodTotal>();
  for (const p of pos.flatMap((s) => s.payments)) {
    const m = methods.get(p.methodId) ?? {
      methodId: p.methodId,
      name: p.name,
      type: p.type,
      amount: 0,
      count: 0,
    };
    methods.set(p.methodId, { ...m, amount: round2(m.amount + p.amount), count: m.count + 1 });
  }

  return {
    count: paid.length,
    total,
    vat: sum(paid.map((s) => s.vat)),
    average: paid.length ? round2(total / paid.length) : 0,
    cancelledCount: cancelled.length,
    cancelledTotal: sum(cancelled.map((s) => s.total)),
    posNet,
    cogs,
    grossProfit,
    margin: posNet > 0 ? round2((grossProfit / posNet) * 100) : null,
    byMethod: [...methods.values()],
  };
}
