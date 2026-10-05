import { STORE_INFO_DEFAULTS, StoreInfo } from './store-info.model';
import { BranchType, branchLabel, isValidThaiTaxId } from './supplier.model';
import { round2 } from './costing.model';
import type { Sale } from './sale.model';

/**
 * Full tax invoice (ใบกำกับภาษีเต็มรูป, decided 2026-10-04) of a POS bill of a VAT-registered
 * store: issued together with the sale when the buyer's details are entered at the POS (no
 * abbreviated invoice involved), or later on request in place of the abbreviated one. Either
 * way it is dated (and numbered) on the day of sale; `issuedAt` keeps when it was really issued
 * (accountant's decision 2026-10-04; no time limit for later requests). The buyer's details are typed
 * on the invoice (no customer master yet); amounts always come from the bill. One per bill;
 * voiding the bill cancels it.
 */
/**
 * Buyer's head office / branch — required on the invoice only for VAT-registered buyers;
 * 'none' = not a VAT registrant (e.g. an ordinary individual), nothing is printed.
 */
export type BuyerBranchType = BranchType | 'none';

/**
 * 'passport' = foreign buyer without a Thai tax ID: only name + address are required by law, the
 * passport number is kept for traceability. Missing (older data) = 'tax_id'.
 */
export type BuyerIdType = 'tax_id' | 'passport';

export interface TaxInvoiceBuyer {
  name: string;
  idType?: BuyerIdType;
  /** 13-digit tax ID (companies) or national ID (individuals); the passport number when idType = 'passport' */
  taxId: string;
  branchType: BuyerBranchType;
  /** 5 digits when branchType = 'branch' */
  branchNo: string;
  address: string;
}

export interface TaxInvoice {
  id: number;
  /** 'INV-YYYYMMDD-NNNN', issued by the server */
  invoiceNo: string;
  saleId: number;
  /** Abbreviated receipt it replaces */
  orderNo: string;
  saleDate: string;
  /** Document date = the sale's timestamp (tax point), also for invoices issued later */
  date: string;
  /** When it was actually issued (audit) */
  issuedAt: string;
  buyer: TaxInvoiceBuyer;
  issuedBy: string;
  /** Set when the bill is voided or the invoice is replaced */
  cancelledAt: string | null;
  /** Why it was cancelled ('' while valid) */
  cancelReason: string;
  /** The cancelled invoice this one replaces (wrong buyer details), null = original */
  replacesInvoiceNo: string | null;
  /** The invoice that replaced this cancelled one */
  replacedByNo: string | null;
  /** Issued together with the sale (true) or later in place of the abbreviated invoice (false) */
  atSale: boolean;
}

export interface InvoiceTotals {
  /** VAT-able goods before VAT */
  net: number;
  vat: number;
  /** VAT-exempt goods */
  exempt: number;
  total: number;
}

/** VAT split printed on a full tax invoice (A4 and 80 mm alike). */
export function invoiceTotals(sale: Pick<Sale, 'lines' | 'total' | 'vat'>): InvoiceTotals {
  const vatable = round2(
    sale.lines.filter((l) => l.vatType === 'vat7').reduce((n, l) => n + l.amount, 0),
  );
  return {
    net: round2(vatable - sale.vat),
    vat: sale.vat,
    exempt: round2(sale.total - vatable),
    total: sale.total,
  };
}

export const EMPTY_BUYER: TaxInvoiceBuyer = {
  name: '',
  idType: 'tax_id',
  taxId: '',
  branchType: 'none',
  branchNo: '',
  address: '',
};

/** Suggested branch for a typed tax ID: juristic person (starts with 0) → head office, else none. */
export function defaultBuyerBranch(taxId: string): BuyerBranchType {
  return /^0\d{12}$/.test(taxId.replace(/[\s-]/g, '')) ? 'head' : 'none';
}

/** 'สำนักงานใหญ่' / 'สาขา 00001', or '' when the buyer is not a VAT registrant. */
export function buyerBranchLabel(b: Pick<TaxInvoiceBuyer, 'branchType' | 'branchNo'>): string {
  return b.branchType === 'none'
    ? ''
    : branchLabel({ branchType: b.branchType, branchNo: b.branchNo });
}

export const isPassportBuyer = (b: Pick<TaxInvoiceBuyer, 'idType'>): boolean =>
  b.idType === 'passport';

/** Label printed before the buyer's ID number. */
export function buyerIdLabel(b: Pick<TaxInvoiceBuyer, 'idType'>): string {
  return isPassportBuyer(b) ? 'เลขที่หนังสือเดินทาง' : 'เลขประจำตัวผู้เสียภาษี';
}

/** Short ID for on-screen summaries: the tax ID, or 'Passport AB1234567'. */
export function buyerIdShort(b: Pick<TaxInvoiceBuyer, 'idType' | 'taxId'>): string {
  return isPassportBuyer(b) ? `Passport ${b.taxId}` : b.taxId;
}

/** ID number as typed, cleaned for its type (tax ID: digits; passport: upper-case letters/digits). */
export function normalizeBuyerId(idType: BuyerIdType | undefined, id: string): string {
  const clean = (id ?? '').replace(/[\s-]/g, '');
  return idType === 'passport' ? clean.toUpperCase() : clean;
}

/** Error of the ID number alone (also gates the previous-buyer lookup). */
export function buyerIdError(idType: BuyerIdType | undefined, id: string): string | null {
  if (idType === 'passport') {
    return /^[A-Z0-9]{6,20}$/.test(id)
      ? null
      : 'เลขที่หนังสือเดินทางต้องเป็นตัวอักษรอังกฤษ/ตัวเลข 6–20 ตัว';
  }
  return isValidThaiTaxId(id) ? null : 'เลขประจำตัวผู้เสียภาษีผู้ซื้อต้องเป็น 13 หลักที่ถูกต้อง';
}

export function normalizeBuyer(b: TaxInvoiceBuyer): TaxInvoiceBuyer {
  const idType: BuyerIdType = b.idType === 'passport' ? 'passport' : 'tax_id';
  const branchType: BuyerBranchType =
    idType === 'passport'
      ? 'none'
      : b.branchType === 'branch' || b.branchType === 'none'
        ? b.branchType
        : 'head';
  return {
    name: (b.name ?? '').trim(),
    idType,
    taxId: normalizeBuyerId(idType, b.taxId),
    branchType,
    branchNo: branchType === 'branch' ? (b.branchNo ?? '').trim() : '',
    address: (b.address ?? '').trim(),
  };
}

export function buyerError(b: TaxInvoiceBuyer): string | null {
  if (!b.name) return 'กรุณากรอกชื่อผู้ซื้อ';
  const idProblem = buyerIdError(b.idType, b.taxId);
  if (idProblem) return idProblem;
  if (b.branchType === 'branch' && !/^\d{5}$/.test(b.branchNo)) {
    return 'เลขที่สาขาผู้ซื้อต้องเป็นตัวเลข 5 หลัก';
  }
  if (!b.address) return 'กรุณากรอกที่อยู่ผู้ซื้อ';
  return null;
}

/** Defaults for fields missing from invoices stored before cancel-and-reissue existed. */
export const TAX_INVOICE_DEFAULTS = {
  cancelReason: '',
  replacesInvoiceNo: null,
  replacedByNo: null,
} satisfies Partial<TaxInvoice>;

/** The bill's valid invoice (not cancelled), else the latest one, else null. */
export function currentInvoice<T extends TaxInvoice>(invoices: readonly T[]): T | null {
  return invoices.find((i) => !i.cancelledAt) ?? invoices.at(-1) ?? null;
}

/**
 * State of an invoice number quoted by an earlier document (e.g. a credit note, which keeps the
 * number valid when it was issued and is never changed): null = still valid or unknown; otherwise
 * it was cancelled and `replacedBy` is the valid invoice at the end of the reissue chain (null =
 * cancelled without a valid replacement).
 */
export function invoiceRefState(
  invoiceNo: string,
  invoices: readonly Pick<TaxInvoice, 'invoiceNo' | 'cancelledAt' | 'replacedByNo'>[],
): { replacedBy: string | null } | null {
  const byNo = new Map(invoices.map((i) => [i.invoiceNo, i]));
  let inv = byNo.get(invoiceNo);
  if (!inv?.cancelledAt) return null;
  const seen = new Set<string>();
  while (inv?.cancelledAt && inv.replacedByNo && !seen.has(inv.invoiceNo)) {
    seen.add(inv.invoiceNo);
    inv = byNo.get(inv.replacedByNo);
  }
  return { replacedBy: inv && !inv.cancelledAt ? inv.invoiceNo : null };
}

/**
 * Cancel-and-reissue rule (decided 2026-10-04; form + server): wrong buyer details are never edited
 * in place — the valid invoice is cancelled with a reason and a new one (new number, same sale day,
 * same amounts) refers to it. Admins only. `buyer` must be normalized.
 */
export function reissueError(
  sale: Pick<Sale, 'status'>,
  current: Pick<TaxInvoice, 'cancelledAt'> | null,
  buyer: TaxInvoiceBuyer,
  reason: string,
): string | null {
  if (sale.status !== 'paid') return 'ออกใบใหม่ได้เฉพาะบิลที่ชำระแล้ว';
  if (!current || current.cancelledAt) return 'บิลนี้ไม่มีใบกำกับภาษีเต็มรูปที่ใช้งานอยู่';
  if (!reason.trim()) return 'กรุณาระบุเหตุผลที่ยกเลิกใบเดิม';
  return buyerError(buyer);
}

/** Buyer entered at the POS for a full tax invoice issued with the sale (POS + server). */
export function checkoutBuyerError(
  buyer: TaxInvoiceBuyer,
  store: Pick<StoreInfo, 'vatRegistered'>,
): string | null {
  if (!store.vatRegistered) return 'ร้านไม่ได้จดทะเบียน VAT ออกใบกำกับภาษีไม่ได้';
  return buyerError(buyer);
}

/** The single rule for issuing later from the bill (form + server). `buyer` must be normalized. */
export function taxInvoiceError(
  sale: Pick<Sale, 'status' | 'lines' | 'taxInvoiceNo'>,
  buyer: TaxInvoiceBuyer,
  store: Pick<StoreInfo, 'vatRegistered'> = STORE_INFO_DEFAULTS,
): string | null {
  if (!store.vatRegistered) return 'ร้านไม่ได้จดทะเบียน VAT ออกใบกำกับภาษีไม่ได้';
  if (sale.status !== 'paid' || !sale.lines.length) {
    return 'ออกใบกำกับภาษีได้เฉพาะบิลขายหน้าร้านที่ชำระแล้ว';
  }
  if (sale.taxInvoiceNo) return `บิลนี้ออกใบกำกับภาษีเต็มรูปแล้ว (${sale.taxInvoiceNo})`;
  return buyerError(buyer);
}
