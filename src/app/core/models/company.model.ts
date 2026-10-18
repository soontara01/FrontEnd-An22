import type { InvoicePaper, StoreInfo } from './store-info.model';
import { isValidThaiTaxId } from './supplier.model';

/**
 * SaaS tenant and its branches (docs/saas-plan.md sections 1–3, step 1 decided 2026-10-16).
 * The tenant comes only from the login token; the working branch is sent as `X-Branch-Id` and
 * checked by the server. Step 1 = one company with one branch.
 */
export interface Company {
  id: number;
  /** Typed at login (D4), unique on the platform, kept upper case, e.g. `DEMO` */
  code: string;
  name: string;
  /** 13-digit Thai tax ID ('' while not set) */
  taxId: string;
  /** false = suspended (unpaid etc.): nobody of the company can log in */
  active: boolean;
  /**
   * The owner asked for the company's data to be deleted (E39): first day it may be deleted. Only
   * the owner logs in meanwhile, limited to บัญชีบริษัท → ข้อมูลบริษัท. Missing / null = none.
   */
  deletionPurgeAfter?: string | null;
}

export interface Branch {
  id: number;
  /** Short code used in the system and document numbers, unique within the company, e.g. `BKK01` */
  code: string;
  name: string;
  /** Revenue Dept branch number, 5 digits; `00000` = head office */
  branchNo: string;
  /** Printed on receipts / tax invoices as the seller's business place (E11) */
  address: string;
  phone: string;
  /** Printed at the bottom of every receipt of this branch, e.g. return policy */
  receiptFooter: string;
  active: boolean;
}

export type BranchPayload = Omit<Branch, 'id'>;

/** Branch details the branch's own admin may edit (`PUT /settings/branch`); code / number / status via `/branches`. */
export type BranchDetails = Pick<Branch, 'name' | 'address' | 'phone' | 'receiptFooter'>;

export const BRANCH_DEFAULTS: Omit<Branch, 'id' | 'code' | 'name' | 'branchNo'> = {
  address: '',
  phone: '',
  receiptFooter: 'ขอบคุณที่ใช้บริการ',
  active: true,
};

/**
 * Company-level settings (E11, `GET/PUT /settings/company`): the seller on every document and the
 * rules every branch shares, incl. the shift settings (E7). Edited by a company admin only.
 */
export interface CompanyInfo {
  /** Registered business name (ชื่อผู้ประกอบการ) */
  name: string;
  /** 13-digit Thai tax ID (required when VAT-registered) */
  taxId: string;
  vatRegistered: boolean;
  /** Default paper for full tax invoices */
  taxInvoicePaper: InvoicePaper;
  /** Days after the sale day staff may exchange goods (0 = no limit; admins any time) */
  exchangeDays: number;
  /** Highest manual discount (% of a line after promotions) staff may give; 0 = none */
  manualDiscountMaxPercent: number;
  /** Every sale / void / refund / cash movement needs an open shift (shift-plan S6) */
  requireShift: boolean;
  /** Variance per payment method (baht) above which closing a shift needs approval (S3) */
  shiftVarianceLimit: number;
  /** A shift open longer than this (hours) is flagged as left open (S5) */
  shiftMaxHours: number;
  /** Staff (`user`) see cost / profit too (P5, E43 — `canSeeCost()`); off = only the owner / admins */
  staffSeeCost: boolean;
}

export const COMPANY_INFO_DEFAULTS: CompanyInfo = {
  name: '',
  taxId: '',
  vatRegistered: true,
  taxInvoicePaper: 'A4',
  exchangeDays: 7,
  manualDiscountMaxPercent: 5,
  requireShift: true,
  shiftVarianceLimit: 100,
  shiftMaxHours: 12,
  staffSeeCost: false,
};

export const HEAD_OFFICE_BRANCH_NO = '00000';

/** The form a company code is stored and compared in (trimmed, upper case). */
export const normalizeCompanyCode = (code: string): string => code.trim().toUpperCase();

export const isHeadOffice = (b: Pick<Branch, 'branchNo'>): boolean =>
  b.branchNo === HEAD_OFFICE_BRANCH_NO;

/**
 * The store details documents print, put together from the company and the branch the document
 * belongs to (E11) — receipts, tax invoices and reports keep reading one `StoreInfo`.
 */
export function storeInfoOf(
  company: CompanyInfo,
  branch: BranchDetails & Pick<Branch, 'branchNo'>,
): StoreInfo {
  const head = isHeadOffice(branch);
  return {
    ...company,
    placeName: branch.name,
    branchType: head ? 'head' : 'branch',
    branchNo: head ? '' : branch.branchNo,
    address: branch.address,
    phone: branch.phone,
    receiptFooter: branch.receiptFooter,
  };
}

/** The company part of a `StoreInfo` (`PUT /settings/store`, migrating older data). */
export function companyInfoOf(s: StoreInfo): CompanyInfo {
  return {
    name: s.name,
    taxId: s.taxId,
    vatRegistered: s.vatRegistered,
    taxInvoicePaper: s.taxInvoicePaper,
    exchangeDays: s.exchangeDays,
    manualDiscountMaxPercent: s.manualDiscountMaxPercent,
    requireShift: s.requireShift,
    shiftVarianceLimit: s.shiftVarianceLimit,
    shiftMaxHours: s.shiftMaxHours,
    staffSeeCost: s.staffSeeCost ?? false,
  };
}

/** Trims text fields and keeps numbers numeric (forms send strings). */
export function normalizeCompanyInfo(c: CompanyInfo): CompanyInfo {
  const n = (v: unknown, fallback: number) => (v === '' || v == null ? fallback : Number(v));
  return {
    ...COMPANY_INFO_DEFAULTS,
    ...c,
    name: (c.name ?? '').trim(),
    taxId: (c.taxId ?? '').replace(/[\s-]/g, ''),
    exchangeDays: n(c.exchangeDays, COMPANY_INFO_DEFAULTS.exchangeDays),
    manualDiscountMaxPercent: n(
      c.manualDiscountMaxPercent,
      COMPANY_INFO_DEFAULTS.manualDiscountMaxPercent,
    ),
    shiftVarianceLimit: n(c.shiftVarianceLimit, COMPANY_INFO_DEFAULTS.shiftVarianceLimit),
    shiftMaxHours: n(c.shiftMaxHours, COMPANY_INFO_DEFAULTS.shiftMaxHours),
    staffSeeCost: !!c.staffSeeCost,
  };
}

/** Trims a branch's text fields; code upper case. */
export function normalizeBranch<T extends Partial<BranchPayload>>(b: T): T {
  return {
    ...b,
    ...(b.code !== undefined && { code: b.code.trim().toUpperCase() }),
    ...(b.name !== undefined && { name: b.name.trim() }),
    ...(b.branchNo !== undefined && { branchNo: b.branchNo.trim() }),
    ...(b.address !== undefined && { address: b.address.trim() }),
    ...(b.phone !== undefined && { phone: b.phone.trim() }),
    ...(b.receiptFooter !== undefined && { receiptFooter: b.receiptFooter.trim() }),
  };
}

/** The single rule for company settings (settings form + server). Thai message or null. */
export function companyInfoError(c: CompanyInfo): string | null {
  if (!c.name.trim()) return 'กรุณากรอกชื่อร้าน';
  if (c.vatRegistered && !isValidThaiTaxId(c.taxId)) {
    return 'เลขประจำตัวผู้เสียภาษีต้องเป็น 13 หลักที่ถูกต้อง';
  }
  if (c.taxId && !isValidThaiTaxId(c.taxId)) return 'เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง';
  if (c.taxInvoicePaper !== 'A4' && c.taxInvoicePaper !== '80mm') {
    return 'ขนาดกระดาษใบกำกับภาษีไม่ถูกต้อง';
  }
  if (!Number.isInteger(c.exchangeDays) || c.exchangeDays < 0 || c.exchangeDays > 365) {
    return 'จำนวนวันเปลี่ยนสินค้าต้องเป็นจำนวนเต็ม 0–365';
  }
  const max = c.manualDiscountMaxPercent;
  if (!Number.isFinite(max) || max < 0 || max > 100) {
    return 'เพดานส่วนลดพิเศษต้องอยู่ระหว่าง 0–100%';
  }
  const limit = c.shiftVarianceLimit;
  if (!Number.isFinite(limit) || limit < 0 || limit > 100_000) {
    return 'เกณฑ์ส่วนต่างปิดกะต้องอยู่ระหว่าง 0–100,000 บาท';
  }
  if (!Number.isInteger(c.shiftMaxHours) || c.shiftMaxHours < 1 || c.shiftMaxHours > 48) {
    return 'ชั่วโมงเตือนกะเปิดค้างต้องเป็นจำนวนเต็ม 1–48';
  }
  return null;
}

/** Details printed for a branch: its business-place name, address, receipt footer. */
export function branchDetailsError(b: BranchDetails): string | null {
  if (!b.name.trim()) return 'กรุณากรอกชื่อสาขา';
  if (b.name.length > 100) return 'ชื่อสาขาต้องไม่เกิน 100 ตัวอักษร';
  if (!b.address.trim()) return 'กรุณากรอกที่อยู่';
  if (b.receiptFooter.length > 200) return 'ข้อความท้ายใบเสร็จต้องไม่เกิน 200 ตัวอักษร';
  return null;
}

/**
 * The single rule for a branch (branch tab + server): code A-Z / 0-9 2–10 characters and
 * `branchNo` 5 digits, both unique within the company; one active branch always stays; then the
 * printed details (`branchDetailsError()`).
 */
export function branchError(
  b: BranchPayload & { id?: number },
  branches: readonly Pick<Branch, 'id' | 'code' | 'branchNo' | 'active'>[],
): string | null {
  const others = branches.filter((x) => x.id !== b.id);
  const code = b.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(code)) return 'รหัสสาขาต้องเป็น A-Z หรือ 0-9 ยาว 2–10 ตัว';
  if (others.some((x) => x.code.toUpperCase() === code)) return 'รหัสสาขานี้มีอยู่แล้ว';
  if (!/^\d{5}$/.test(b.branchNo)) return 'เลขที่สาขาต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)';
  if (others.some((x) => x.branchNo === b.branchNo)) return 'เลขที่สาขานี้มีอยู่แล้ว';
  if (!b.active && !others.some((x) => x.active)) return 'ต้องมีสาขาที่ใช้งานอยู่อย่างน้อย 1 สาขา';
  return branchDetailsError(b);
}

/** Documents numbered per branch and day (E21); POS bills run per terminal (`terminalOrderPrefix()`). */
export type BranchDocKind = 'INV' | 'CN' | 'EX' | 'SH' | 'TR';

/**
 * Number prefix of a branch document, e.g. `CN-BN-20261018-` (E21). Older documents keep their
 * numbers without a branch (`CN-20261017-0001`).
 */
export const branchDocPrefix = (kind: BranchDocKind, branchCode: string, day: string): string =>
  `${kind}-${branchCode}-${day.replaceAll('-', '')}-`;
