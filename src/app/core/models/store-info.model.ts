import { BranchType, isValidThaiTaxId } from './supplier.model';

/**
 * The store's own details printed on receipts (decided 2026-10-04, edited in the Settings menu).
 * A VAT-registered store prints "ใบกำกับภาษีอย่างย่อ/ใบเสร็จรับเงิน" with its tax ID, branch and
 * POS registration number (Revenue Department requirements); otherwise a plain receipt.
 */
export interface StoreInfo {
  /** Registered business name */
  name: string;
  vatRegistered: boolean;
  /** 13-digit Thai tax ID (required when VAT-registered) */
  taxId: string;
  branchType: BranchType;
  /** 5 digits when branchType = 'branch' */
  branchNo: string;
  address: string;
  phone: string;
  /** POS machine registration number from the Revenue Department ('' = not shown) */
  posId: string;
  /** Printed at the bottom of every receipt, e.g. return policy */
  receiptFooter: string;
}

export const STORE_INFO_DEFAULTS: StoreInfo = {
  name: '',
  vatRegistered: true,
  taxId: '',
  branchType: 'head',
  branchNo: '',
  address: '',
  phone: '',
  posId: '',
  receiptFooter: 'ขอบคุณที่ใช้บริการ',
};

/** Receipt title by VAT registration. */
export const receiptTitle = (s: Pick<StoreInfo, 'vatRegistered'>): string =>
  s.vatRegistered ? 'ใบกำกับภาษีอย่างย่อ/ใบเสร็จรับเงิน' : 'ใบเสร็จรับเงิน';

/** The single rule for the settings form and the server. Thai message or null. */
export function storeInfoError(s: StoreInfo): string | null {
  if (!s.name.trim()) return 'กรุณากรอกชื่อร้าน';
  if (s.vatRegistered && !isValidThaiTaxId(s.taxId)) {
    return 'เลขประจำตัวผู้เสียภาษีต้องเป็น 13 หลักที่ถูกต้อง';
  }
  if (s.taxId && !isValidThaiTaxId(s.taxId)) return 'เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง';
  if (s.branchType === 'branch' && !/^\d{5}$/.test(s.branchNo)) {
    return 'เลขที่สาขาต้องเป็นตัวเลข 5 หลัก';
  }
  if (!s.address.trim()) return 'กรุณากรอกที่อยู่';
  if (s.posId.length > 30) return 'หมายเลขเครื่อง POS ต้องไม่เกิน 30 ตัวอักษร';
  if (s.receiptFooter.length > 200) return 'ข้อความท้ายใบเสร็จต้องไม่เกิน 200 ตัวอักษร';
  return null;
}

/** Trims text fields and clears the branch number of a head office. */
export function normalizeStoreInfo(s: StoreInfo): StoreInfo {
  return {
    ...STORE_INFO_DEFAULTS,
    ...s,
    name: s.name.trim(),
    taxId: s.taxId.replace(/[\s-]/g, ''),
    branchNo: s.branchType === 'branch' ? s.branchNo.trim() : '',
    address: s.address.trim(),
    phone: s.phone.trim(),
    posId: s.posId.trim(),
    receiptFooter: s.receiptFooter.trim(),
  };
}
