import { round2 } from './costing.model';
import { PaymentMethod, allowsChange, opensDrawer, roundCash } from './payment-method.model';
import type { PaymentInput, SalePayment } from './sale.model';

/**
 * POS payment rule (decided 2026-10-04), shared by the payment dialog and the server:
 * - a bill may be split over several active methods; at most one cash line
 * - non-cash lines settle exactly their amount and together may not exceed the total
 * - cash settles what is left, rounded by its `cashRounding` (the difference is `rounding`);
 *   the money handed over may exceed it — the excess is change
 * - each line must be within the method's min/max (cash: the rounded share, not the tendered)
 * - a bill total of 0 needs no payment
 */
export interface PaymentSummary {
  /** Resolved payment lines (method snapshot, settled amount, tendered) */
  payments: SalePayment[];
  /** Sum of non-cash lines */
  nonCash: number;
  /** Left for cash after the non-cash lines (before rounding, ≥ 0) */
  remaining: number;
  /** What cash must cover: `remaining` rounded by the cash method (0 without a cash line) */
  cashDue: number;
  /** cashDue − remaining when a cash line settles the bill, else 0 */
  rounding: number;
  /** Cash handed over */
  tendered: number;
  change: number;
  /** Still to pay (0 when settled) */
  balance: number;
  complete: boolean;
  /** Whether the cash drawer opens (a cash line is present) */
  opensDrawer: boolean;
}

/** Amount due in cash for `remaining` baht with a given cash method (rounded). */
export const cashDueFor = (remaining: number, cash: Pick<PaymentMethod, 'cashRounding'>): number =>
  roundCash(Math.max(remaining, 0), cash.cashRounding);

export function paymentSummary(
  total: number,
  inputs: readonly PaymentInput[],
  methods: readonly PaymentMethod[],
): PaymentSummary {
  const byId = new Map(methods.map((m) => [m.id, m]));
  const resolved = inputs
    .map((input) => ({ input, method: byId.get(input.methodId) }))
    .filter((x): x is { input: PaymentInput; method: PaymentMethod } => !!x.method);
  const nonCashLines = resolved.filter((x) => !allowsChange(x.method));
  const cashLine = resolved.find((x) => allowsChange(x.method));
  const nonCash = round2(nonCashLines.reduce((n, x) => n + x.input.amount, 0));
  const remaining = round2(Math.max(total - nonCash, 0));
  const cashDue = cashLine ? cashDueFor(remaining, cashLine.method) : 0;
  const tendered = cashLine ? round2(cashLine.input.amount) : 0;
  const settled = cashLine ? tendered >= cashDue : remaining === 0;
  const balance = settled ? 0 : round2(cashLine ? cashDue - tendered : remaining);

  const payments: SalePayment[] = resolved.map(({ input, method }) => {
    const cash = allowsChange(method);
    const amount = cash ? Math.min(cashDue, tendered) : round2(input.amount);
    return {
      methodId: method.id,
      name: method.name,
      type: method.type,
      amount,
      tendered: cash ? tendered : amount,
      reference: input.reference.trim(),
      installmentMonths: method.type === 'installment' ? input.installmentMonths : null,
    };
  });
  return {
    payments,
    nonCash,
    remaining,
    cashDue,
    rounding: cashLine && settled ? round2(cashDue - remaining) : 0,
    tendered,
    change: settled && cashLine ? round2(tendered - cashDue) : 0,
    balance,
    complete: settled,
    opensDrawer: resolved.some((x) => opensDrawer(x.method)),
  };
}

const isMoney = (n: number) => Number.isFinite(n) && n >= 0 && round2(n) === n;
const baht = (n: number) => `฿${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** The single payment rule (POS + server). Returns a Thai message, or null when the bill is paid. */
export function paymentError(
  total: number,
  inputs: readonly PaymentInput[],
  methods: readonly PaymentMethod[],
): string | null {
  if (total === 0) return inputs.length ? 'บิลยอด 0 บาทไม่ต้องรับชำระ' : null;
  if (!inputs.length) return 'กรุณาเลือกช่องทางชำระเงิน';
  const byId = new Map(methods.map((m) => [m.id, m]));
  let cashLines = 0;
  for (const input of inputs) {
    const method = byId.get(input.methodId);
    if (!method) return `ไม่พบช่องทางชำระเงิน #${input.methodId}`;
    if (!method.active) return `${method.name} ปิดใช้งาน`;
    if (!isMoney(input.amount)) return `${method.name}: จำนวนเงินไม่ถูกต้อง`;
    if (allowsChange(method)) {
      cashLines++;
      continue;
    }
    if (input.amount <= 0) return `${method.name}: จำนวนเงินต้องมากกว่า 0`;
    if (method.requireReference && !input.reference.trim()) {
      return `${method.name}: กรุณากรอก${method.referenceLabel || 'เลขอ้างอิง'}`;
    }
    if (
      method.type === 'installment' &&
      !method.installmentMonths.includes(input.installmentMonths ?? -1)
    ) {
      return `${method.name}: กรุณาเลือกจำนวนเดือนผ่อน`;
    }
  }
  if (cashLines > 1) return 'รับเงินสดได้บรรทัดเดียว';

  const summary = paymentSummary(total, inputs, methods);
  if (summary.nonCash > total) return 'ยอดชำระที่ไม่ใช่เงินสดเกินยอดบิล (ทอนได้เฉพาะเงินสด)';
  if (!summary.complete) return `ยอดชำระยังไม่ครบ (ขาด ${baht(summary.balance)})`;
  for (const p of summary.payments) {
    const method = byId.get(p.methodId)!;
    if (allowsChange(method) && summary.remaining === 0) return 'ไม่มียอดที่ต้องรับเป็นเงินสด';
    if (p.amount < method.minAmount) {
      return `${method.name}: ขั้นต่ำ ${baht(method.minAmount)} ต่อรายการ`;
    }
    if (method.maxAmount !== null && p.amount > method.maxAmount) {
      return `${method.name}: สูงสุด ${baht(method.maxAmount)} ต่อรายการ`;
    }
  }
  return null;
}
