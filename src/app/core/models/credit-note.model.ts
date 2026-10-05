import { round2 } from './costing.model';
import { PaymentMethod, allowsChange } from './payment-method.model';
import { freeSets } from './pos-pricing.model';
import { VatType, vatBreakdown } from './product.model';
import type { Promotion } from './promotion.model';
import type { TaxInvoiceBuyer } from './tax-invoice.model';
import { PaymentInput, Sale, SaleLine, SalePayment, saleDay } from './sale.model';

/**
 * Credit notes (ใบลดหนี้, decided 2026-10-04): goods returned from a paid bill from the day
 * after the sale on (the same day the bill is voided instead). The bill itself never changes.
 * - refund per line = its share of what the customer paid (item + bill discounts already in it;
 *   the bill discount is not re-checked)
 * - a free-goods promotion is re-checked on what the customer keeps: free units kept beyond what
 *   the remaining items still earn are deducted at their sale-time price (or returned too)
 * - money goes back in cash or through a method the bill was paid with, up to what that method
 *   took minus earlier refunds
 * - returned goods go back into stock at their sale cost, or are written off (serial → damaged)
 * `draftCreditNote()` / `creditNoteError()` are the single rule for the form and the server.
 */
export interface CreditNoteLine {
  /** Index of the line in `sale.lines` */
  saleLineIndex: number;
  productId: number;
  sku: string;
  name: string;
  shortName: string;
  unit: string;
  factor: number;
  /** In sold units */
  qty: number;
  /** Refund for these units, VAT-inclusive */
  amount: number;
  vatType: VatType;
  vat: number;
  /** Cost of the returned units (sale-time COGS share) */
  cogs: number;
  serial: string | null;
  free: boolean;
  /** Back into stock (false = written off as damaged; always false for services) */
  restock: boolean;
}

/** Free units the customer keeps although the remaining items no longer earn them. */
export interface CreditNoteDeduction {
  promotionId: number;
  productId: number;
  sku: string;
  name: string;
  /** Base units */
  qty: number;
  unitPrice: number;
  amount: number;
  vatType: VatType;
}

export interface CreditNote {
  id: number;
  /** 'CN-YYYYMMDD-NNNN', issued by the server */
  cnNo: string;
  saleId: number;
  orderNo: string;
  /** Full tax invoice of the bill, if one was issued (printed as the reference) */
  taxInvoiceNo: string | null;
  /** Buyer of that invoice when the note was issued (server-set; null = abbreviated invoice only) */
  buyer: TaxInvoiceBuyer | null;
  saleDate: string;
  /** ISO timestamp */
  date: string;
  cashier: string;
  reason: string;
  lines: CreditNoteLine[];
  deductions: CreditNoteDeduction[];
  /** Σ line amounts */
  subtotal: number;
  /** Σ deductions */
  deduction: number;
  /** Refunded: subtotal − deduction */
  total: number;
  /** VAT reversed */
  vat: number;
  refunds: SalePayment[];
}

export interface CreditNoteLineInput {
  saleLineIndex: number;
  qty: number;
  restock: boolean;
}

/** POST /sales/:id/credit-notes body. */
export interface CreditNotePayload {
  lines: CreditNoteLineInput[];
  refunds: PaymentInput[];
  reason: string;
  /** Total shown on screen; the server recomputes and rejects a difference */
  expectedTotal: number;
}

export interface CreditNoteDraft {
  lines: CreditNoteLine[];
  deductions: CreditNoteDeduction[];
  subtotal: number;
  deduction: number;
  total: number;
  vat: number;
  /** Thai message, or null when the draft is valid */
  error: string | null;
}

export interface RefundOption {
  method: PaymentMethod;
  /** Most that may go back through it (null = no cap besides the total, i.e. cash) */
  max: number | null;
}

const sum = (values: number[]): number => round2(values.reduce((a, b) => a + b, 0));

const creditedLines = (notes: readonly CreditNote[], index: number): CreditNoteLine[] =>
  notes.flatMap((n) => n.lines.filter((l) => l.saleLineIndex === index));

/** Units of a sale line already returned by earlier credit notes. */
export const creditedQty = (notes: readonly CreditNote[], index: number): number =>
  creditedLines(notes, index).reduce((n, l) => n + l.qty, 0);

/** Units of a sale line that can still be returned. */
export const remainingQty = (sale: Sale, notes: readonly CreditNote[], index: number): number =>
  (sale.lines[index]?.qty ?? 0) - creditedQty(notes, index);

/** Refund / VAT / cost of returning `qty` units; the last units take the exact remainder. */
function lineShare(line: SaleLine, notes: readonly CreditNote[], index: number, qty: number) {
  const before = creditedLines(notes, index);
  if (creditedQty(notes, index) + qty === line.qty) {
    return {
      amount: round2(line.amount - sum(before.map((l) => l.amount))),
      vat: round2(line.vat - sum(before.map((l) => l.vat))),
      cogs: round2(line.cogs - sum(before.map((l) => l.cogs))),
    };
  }
  const amount = round2((line.amount * qty) / line.qty);
  return {
    amount,
    vat: vatBreakdown(amount, line.vatType).vat,
    cogs: round2((line.cogs * qty) / line.qty),
  };
}

/** Prices a return of the given lines (no refund / reason checks). */
export function draftCreditNote(
  sale: Sale,
  notes: readonly CreditNote[],
  inputs: readonly CreditNoteLineInput[],
  promotions: readonly Promotion[],
): CreditNoteDraft {
  const empty = { lines: [], deductions: [], subtotal: 0, deduction: 0, total: 0, vat: 0 };
  const fail = (error: string): CreditNoteDraft => ({ ...empty, error });
  const chosen = inputs.filter((i) => i.qty > 0);
  if (!chosen.length) return fail('กรุณาเลือกสินค้าที่รับคืน');
  if (new Set(chosen.map((i) => i.saleLineIndex)).size !== chosen.length) {
    return fail('เลือกรายการซ้ำ');
  }

  const lines: CreditNoteLine[] = [];
  for (const input of chosen) {
    const line = sale.lines[input.saleLineIndex];
    if (!line) return fail(`ไม่พบรายการที่ ${input.saleLineIndex + 1} ในบิล`);
    const left = remainingQty(sale, notes, input.saleLineIndex);
    if (!Number.isInteger(input.qty) || input.qty > left) {
      return fail(`${line.sku} คืนได้ไม่เกิน ${left} ${line.unit}`);
    }
    lines.push({
      saleLineIndex: input.saleLineIndex,
      productId: line.productId,
      sku: line.sku,
      name: line.name,
      shortName: line.shortName,
      unit: line.unit,
      factor: line.factor,
      qty: input.qty,
      ...lineShare(line, notes, input.saleLineIndex, input.qty),
      vatType: line.vatType,
      serial: line.serial,
      free: line.freeOfPromotionId !== null,
      restock: line.itemType === 'service' ? false : input.restock,
    });
  }

  // Free goods kept beyond what the remaining items still earn.
  const returnedNow = (index: number) => lines.find((l) => l.saleLineIndex === index)?.qty ?? 0;
  const keptQty = (index: number) =>
    sale.lines[index].qty - creditedQty(notes, index) - returnedNow(index);
  const deductions: CreditNoteDeduction[] = [];
  const promoIds = new Set(sale.lines.flatMap((l) => l.freeOfPromotionId ?? []));
  for (const promotionId of promoIds) {
    const promo = promotions.find((p) => p.id === promotionId);
    if (!promo?.freeGoods) continue;
    let qty = 0;
    let amount = 0;
    sale.lines.forEach((l, i) => {
      if (l.freeOfPromotionId !== null || !l.promotionIds.includes(promotionId)) return;
      const kept = keptQty(i);
      qty += kept * l.factor;
      amount += ((l.unitPrice * l.qty - l.itemDiscount) * kept) / l.qty;
    });
    const sets = freeSets(promo, qty, round2(amount));
    const freeIndexes = sale.lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.freeOfPromotionId === promotionId);
    for (const productId of new Set(freeIndexes.map(({ l }) => l.productId))) {
      const own = freeIndexes.filter(({ l }) => l.productId === productId);
      const given = own.reduce((n, { l }) => n + l.qty * l.factor, 0);
      const kept = own.reduce((n, { l, i }) => n + keptQty(i) * l.factor, 0);
      const perSet = promo.freeGoods.items.find((x) => x.productId === productId)?.qty ?? 0;
      const allowed = Math.min(given, sets * perSet);
      const charged = notes
        .flatMap((n) => n.deductions)
        .filter((d) => d.promotionId === promotionId && d.productId === productId)
        .reduce((n, d) => n + d.qty, 0);
      const excess = Math.max(0, kept - allowed - charged);
      if (!excess) continue;
      const sample = own[0].l;
      const unitPrice = round2(sample.listPrice / sample.factor);
      deductions.push({
        promotionId,
        productId,
        sku: sample.sku,
        name: sample.name,
        qty: excess,
        unitPrice,
        amount: round2(excess * unitPrice),
        vatType: sample.vatType,
      });
    }
  }

  const subtotal = sum(lines.map((l) => l.amount));
  const deduction = sum(deductions.map((d) => d.amount));
  const total = round2(subtotal - deduction);
  const vat = round2(
    sum(lines.map((l) => l.vat)) -
      sum(deductions.map((d) => vatBreakdown(d.amount, d.vatType).vat)),
  );
  const error = total < 0 ? 'มูลค่าของแถมที่ต้องหักเกินยอดคืน กรุณารับของแถมคืนด้วย' : null;
  return { lines, deductions, subtotal, deduction, total, vat, error };
}

/**
 * Methods money may go back through: every active cash method (no cap) and the active non-cash
 * methods the bill was paid with, up to what they took minus earlier refunds.
 */
export function refundOptions(
  sale: Sale,
  notes: readonly CreditNote[],
  methods: readonly PaymentMethod[],
): RefundOption[] {
  return methods
    .filter((m) => m.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((method): RefundOption[] => {
      if (allowsChange(method)) return [{ method, max: null }];
      const paid = sum(sale.payments.filter((p) => p.methodId === method.id).map((p) => p.amount));
      if (!paid) return [];
      const refunded = sum(
        notes
          .flatMap((n) => n.refunds)
          .filter((r) => r.methodId === method.id)
          .map((r) => r.amount),
      );
      return [{ method, max: round2(paid - refunded) }];
    })
    .filter((o) => o.max === null || o.max > 0);
}

const isMoney = (n: number) => Number.isFinite(n) && n > 0 && round2(n) === n;

/** Full rule (form + server): bill state, lines, deductions, refunds, reason, total. */
export function creditNoteError(
  sale: Sale,
  notes: readonly CreditNote[],
  payload: CreditNotePayload,
  ctx: { promotions: readonly Promotion[]; methods: readonly PaymentMethod[]; today: string },
): string | null {
  if (sale.status !== 'paid' || !sale.lines.length) {
    return 'ออกใบลดหนี้ได้เฉพาะบิลขายหน้าร้านที่ชำระแล้ว';
  }
  if (saleDay(sale) === ctx.today) return 'บิลของวันนี้ให้ยกเลิกบิลแทนการออกใบลดหนี้';
  const draft = draftCreditNote(sale, notes, payload.lines, ctx.promotions);
  if (draft.error) return draft.error;
  if (!payload.reason.trim()) return 'กรุณาระบุเหตุผลการลดหนี้';
  if (round2(payload.expectedTotal) !== draft.total) {
    return 'ยอดลดหนี้เปลี่ยน กรุณาตรวจสอบอีกครั้ง';
  }

  const options = refundOptions(sale, notes, ctx.methods);
  const seen = new Set<number>();
  for (const refund of payload.refunds) {
    const option = options.find((o) => o.method.id === refund.methodId);
    if (!option) return 'คืนเงินได้เฉพาะเงินสดหรือช่องทางที่ลูกค้าชำระบิลนี้';
    const { method } = option;
    if (seen.has(method.id)) return `${method.name} ซ้ำ`;
    seen.add(method.id);
    if (!isMoney(refund.amount)) return `${method.name}: จำนวนเงินไม่ถูกต้อง`;
    if (option.max !== null && refund.amount > option.max) {
      return `${method.name}: คืนได้ไม่เกิน ${option.max.toLocaleString('en-US')} บาท`;
    }
    if (!allowsChange(method) && method.requireReference && !refund.reference.trim()) {
      return `${method.name}: กรุณากรอก${method.referenceLabel || 'เลขอ้างอิง'}`;
    }
  }
  const refunded = sum(payload.refunds.map((r) => r.amount));
  if (refunded !== draft.total) {
    return `ยอดคืนเงิน ${refunded.toLocaleString('en-US')} ไม่เท่ายอดลดหนี้ ${draft.total.toLocaleString('en-US')}`;
  }
  return null;
}

/** Refund lines as stored on the credit note (method snapshot). */
export function toRefunds(
  inputs: readonly PaymentInput[],
  methods: readonly PaymentMethod[],
): SalePayment[] {
  return inputs.flatMap((input) => {
    const m = methods.find((x) => x.id === input.methodId);
    return m
      ? [
          {
            methodId: m.id,
            name: m.name,
            type: m.type,
            amount: input.amount,
            tendered: input.amount,
            reference: input.reference.trim(),
            installmentMonths: null,
          },
        ]
      : [];
  });
}
