import {
  CreditNote,
  Sale,
  TaxInvoice,
  branchLabel,
  invoiceTotals,
  round2,
  saleDay,
  toIsoDate,
} from '@core/models';

/**
 * Monthly sales tax report (รายงานภาษีขาย, decided 2026-10-04). Every sale's output VAT is
 * counted exactly once:
 * - abbreviated invoices (POS bills) are summarised per day as one line with their number range;
 *   bills whose full tax invoice was issued *with the sale* are left out of that range — the full
 *   invoice is their only tax document and is listed on its own line
 * - a full invoice issued *later* is dated on the sale day (accountant's decision) and replaces an
 *   abbreviated one already counted that day, so it is listed for reference only (not in the totals)
 * - voided bills count 0 (their numbers stay in the day's range; a voided full invoice is listed
 *   as cancelled); credit notes reduce the month they are issued in, with the buyer of the full
 *   invoice they quote (retail when the bill only had an abbreviated one)
 */
export type TaxReportRowKind = 'abbreviated' | 'full' | 'replacement' | 'credit';

export interface TaxReportRow {
  kind: TaxReportRowKind;
  /** Local 'YYYY-MM-DD' */
  date: string;
  /** Document number, or 'first – last' for a day of abbreviated invoices */
  docNo: string;
  buyerName: string;
  buyerTaxId: string;
  buyerBranch: string;
  /** VAT-able goods before VAT */
  net: number;
  vat: number;
  exempt: number;
  total: number;
  /** false = reference line, not in the totals */
  counted: boolean;
  note: string;
}

export interface TaxReportTotals {
  net: number;
  vat: number;
  exempt: number;
  total: number;
}

export interface SalesTaxReport {
  /** 'YYYY-MM' */
  month: string;
  rows: TaxReportRow[];
  totals: TaxReportTotals;
}

const KIND_ORDER: Record<TaxReportRowKind, number> = {
  abbreviated: 0,
  full: 1,
  replacement: 2,
  credit: 3,
};

const sum = (values: number[]): number => round2(values.reduce((a, b) => a + b, 0));
const inMonth = (day: string, month: string) => day.startsWith(`${month}-`);
const blank = { buyerName: '', buyerTaxId: '', buyerBranch: '' };
const RETAIL = 'ขายปลีก (ใบกำกับภาษีอย่างย่อ)';

/** Builds the report of `month` ('YYYY-MM') from that month's bills, invoices and credit notes. */
export function buildSalesTaxReport(
  month: string,
  sales: readonly Sale[],
  invoices: readonly TaxInvoice[],
  notes: readonly CreditNote[],
): SalesTaxReport {
  const rows: TaxReportRow[] = [];
  const atSaleInvoice = new Map(
    invoices.filter((i) => i.atSale).map((i) => [i.saleId, i] as const),
  );
  const posBills = sales.filter((s) => s.lines.length && inMonth(saleDay(s), month));

  // Abbreviated invoices, one line per day.
  const byDay = new Map<string, Sale[]>();
  for (const s of posBills) {
    if (atSaleInvoice.has(s.id)) continue;
    byDay.set(saleDay(s), [...(byDay.get(saleDay(s)) ?? []), s]);
  }
  for (const [day, bills] of byDay) {
    const numbers = bills.map((b) => b.orderNo).sort();
    const paid = bills.filter((b) => b.status === 'paid');
    const voided = bills.length - paid.length;
    const t = paid.map(invoiceTotals);
    const skipped = posBills.filter((s) => saleDay(s) === day && atSaleInvoice.has(s.id)).length;
    rows.push({
      kind: 'abbreviated',
      date: day,
      docNo: numbers.length > 1 ? `${numbers[0]} – ${numbers.at(-1)}` : numbers[0],
      ...blank,
      buyerName: RETAIL,
      net: sum(t.map((x) => x.net)),
      vat: sum(t.map((x) => x.vat)),
      exempt: sum(t.map((x) => x.exempt)),
      total: sum(t.map((x) => x.total)),
      counted: true,
      note: [
        `${paid.length} ใบ`,
        voided ? `ยกเลิก ${voided} ใบ` : '',
        skipped ? `ไม่รวมบิลที่ออกใบกำกับเต็มรูป ${skipped} ใบ` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  // Full tax invoices issued in the month.
  const salesById = new Map(sales.map((s) => [s.id, s]));
  for (const inv of invoices) {
    const day = toIsoDate(new Date(inv.date));
    if (!inMonth(day, month)) continue;
    const sale = salesById.get(inv.saleId);
    const t = sale ? invoiceTotals(sale) : { net: 0, vat: 0, exempt: 0, total: 0 };
    const cancelled = !!inv.cancelledAt;
    const counted = inv.atSale;
    const zero = cancelled || !counted;
    rows.push({
      kind: inv.atSale ? 'full' : 'replacement',
      date: day,
      docNo: inv.invoiceNo,
      buyerName: inv.buyer.name,
      buyerTaxId: inv.buyer.taxId,
      buyerBranch: branchLabel(inv.buyer),
      net: zero ? 0 : t.net,
      vat: zero ? 0 : t.vat,
      exempt: zero ? 0 : t.exempt,
      total: zero ? 0 : t.total,
      counted,
      note: [
        cancelled ? `ยกเลิก${inv.cancelReason ? ` (${inv.cancelReason})` : ''}` : '',
        inv.replacedByNo ? `แทนด้วย ${inv.replacedByNo}` : '',
        inv.replacesInvoiceNo ? `ออกแทนใบกำกับภาษี ${inv.replacesInvoiceNo} ที่ยกเลิก` : '',
        inv.atSale
          ? ''
          : `ออกแทนใบกำกับภาษีอย่างย่อ ${inv.orderNo} (ภาษีนับในใบอย่างย่อแล้ว · ออกใบเมื่อ ${toIsoDate(new Date(inv.issuedAt))})`,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  // Credit notes issued in the month (negative).
  for (const n of notes) {
    const day = toIsoDate(new Date(n.date));
    if (!inMonth(day, month)) continue;
    const exempt = round2(
      sum(n.lines.filter((l) => l.vatType === 'exempt').map((l) => l.amount)) -
        sum(n.deductions.filter((d) => d.vatType === 'exempt').map((d) => d.amount)),
    );
    rows.push({
      kind: 'credit',
      date: day,
      docNo: n.cnNo,
      ...(n.buyer
        ? {
            buyerName: n.buyer.name,
            buyerTaxId: n.buyer.taxId,
            buyerBranch: branchLabel(n.buyer),
          }
        : { ...blank, buyerName: RETAIL }),
      net: -round2(n.total - n.vat - exempt),
      vat: -n.vat,
      exempt: -exempt,
      total: -n.total,
      counted: true,
      note: `ใบลดหนี้ อ้างอิง ${n.taxInvoiceNo ?? n.orderNo}`,
    });
  }

  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.docNo.localeCompare(b.docNo),
  );
  const counted = rows.filter((r) => r.counted);
  return {
    month,
    rows,
    totals: {
      net: sum(counted.map((r) => r.net)),
      vat: sum(counted.map((r) => r.vat)),
      exempt: sum(counted.map((r) => r.exempt)),
      total: sum(counted.map((r) => r.total)),
    },
  };
}
