import { branchDetailsError, companyInfoError, companyInfoOf } from './company.model';
import { BranchType } from './supplier.model';

/**
 * The store's own details printed on receipts (decided 2026-10-04, edited in the Settings menu).
 * A VAT-registered store prints "ใบกำกับภาษีอย่างย่อ/ใบเสร็จรับเงิน" with its tax ID, branch and
 * POS registration number (Revenue Department requirements); otherwise a plain receipt.
 */
/** Paper of the full tax invoice: A4 sheet or the 80 mm receipt printer. */
export type InvoicePaper = 'A4' | '80mm';

export interface StoreInfo {
  /** Registered business name (ชื่อผู้ประกอบการ) */
  name: string;
  /** Name of the business place (ชื่อสถานประกอบการ, e.g. shop / branch name); '' = same as `name` */
  placeName: string;
  vatRegistered: boolean;
  /** 13-digit Thai tax ID (required when VAT-registered) */
  taxId: string;
  branchType: BranchType;
  /** 5 digits when branchType = 'branch' */
  branchNo: string;
  address: string;
  phone: string;
  /** Printed at the bottom of every receipt, e.g. return policy */
  receiptFooter: string;
  /** Default paper for full tax invoices (the POS prints on it; the bill page can switch) */
  taxInvoicePaper: InvoicePaper;
  /** Days after the sale day staff may exchange goods for the same SKU (0 = no limit; admins any time) */
  exchangeDays: number;
  /** Highest manual discount (% of a line after promotions) staff may give; 0 = none, admins any */
  manualDiscountMaxPercent: number;
  /** Use POS shifts: every sale / void / refund / cash movement needs an open shift (shift-plan S6) */
  requireShift: boolean;
  /** Variance per payment method (baht) above which closing a shift needs admin approval (S3) */
  shiftVarianceLimit: number;
  /** A shift open longer than this (hours) is flagged as left open (S5; warning only) */
  shiftMaxHours: number;
  /** Staff (`user`) see cost / profit too (P5, E43); admins always do */
  staffSeeCost: boolean;
}

export const STORE_INFO_DEFAULTS: StoreInfo = {
  name: '',
  placeName: '',
  vatRegistered: true,
  taxId: '',
  branchType: 'head',
  branchNo: '',
  address: '',
  phone: '',
  receiptFooter: 'ขอบคุณที่ใช้บริการ',
  taxInvoicePaper: 'A4',
  exchangeDays: 7,
  manualDiscountMaxPercent: 5,
  requireShift: true,
  shiftVarianceLimit: 100,
  shiftMaxHours: 12,
  staffSeeCost: false,
};

/** Receipt title by VAT registration. */
export const receiptTitle = (s: Pick<StoreInfo, 'vatRegistered'>): string =>
  s.vatRegistered ? 'ใบกำกับภาษีอย่างย่อ/ใบเสร็จรับเงิน' : 'ใบเสร็จรับเงิน';

/** Name of the business place for tax reports (falls back to the business name). */
export const placeName = (s: Pick<StoreInfo, 'name' | 'placeName'>): string =>
  s.placeName || s.name;

/**
 * A whole `StoreInfo` (transition `PUT /settings/store`): the company rule, then the branch details
 * — same messages as the two settings forms (E11).
 */
export function storeInfoError(s: StoreInfo): string | null {
  if (s.placeName.length > 100) return 'ชื่อสถานประกอบการต้องไม่เกิน 100 ตัวอักษร';
  if (s.branchType === 'branch' && !/^\d{5}$/.test(s.branchNo)) {
    return 'เลขที่สาขาต้องเป็นตัวเลข 5 หลัก';
  }
  return (
    companyInfoError(companyInfoOf(s)) ?? branchDetailsError({ ...s, name: s.placeName || s.name })
  );
}

/** Trims text fields and clears the branch number of a head office. */
export function normalizeStoreInfo(s: StoreInfo): StoreInfo {
  return {
    ...STORE_INFO_DEFAULTS,
    ...s,
    name: s.name.trim(),
    placeName: (s.placeName ?? '').trim(),
    taxId: s.taxId.replace(/[\s-]/g, ''),
    branchNo: s.branchType === 'branch' ? s.branchNo.trim() : '',
    address: s.address.trim(),
    phone: s.phone.trim(),
    receiptFooter: s.receiptFooter.trim(),
    exchangeDays: Number(s.exchangeDays ?? STORE_INFO_DEFAULTS.exchangeDays),
    manualDiscountMaxPercent: Number(
      s.manualDiscountMaxPercent ?? STORE_INFO_DEFAULTS.manualDiscountMaxPercent,
    ),
    requireShift: s.requireShift ?? STORE_INFO_DEFAULTS.requireShift,
    shiftVarianceLimit: Number(s.shiftVarianceLimit ?? STORE_INFO_DEFAULTS.shiftVarianceLimit),
    shiftMaxHours: Number(s.shiftMaxHours ?? STORE_INFO_DEFAULTS.shiftMaxHours),
  };
}
