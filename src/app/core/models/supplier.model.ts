/** Head office or a numbered branch (Thai tax invoice requirement). */
export type BranchType = 'head' | 'branch';

/** Supplier / distributor (master data, shared with future purchasing). */
export interface Supplier {
  id: number;
  code: string;
  name: string;
  /** 13-digit Thai tax ID */
  taxId: string;
  branchType: BranchType;
  /** 5 digits, used when branchType = 'branch' (e.g. '00001') */
  branchNo: string;
  address: string;
  contactName: string;
  phone: string;
  email: string;
  /** Payment term in days (0 = cash) */
  creditDays: number;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  note: string;
  active: boolean;
  /** Read-only, server-derived: number of SKUs linked to this supplier */
  productCount: number;
}

export type SupplierPayload = Omit<Supplier, 'id' | 'productCount'>;

export const SUPPLIER_DEFAULTS: SupplierPayload = {
  code: '',
  name: '',
  taxId: '',
  branchType: 'head',
  branchNo: '',
  address: '',
  contactName: '',
  phone: '',
  email: '',
  creditDays: 30,
  bankName: '',
  bankAccountNo: '',
  bankAccountName: '',
  note: '',
  active: true,
};

/** Checks the 13-digit Thai tax ID checksum. */
export function isValidThaiTaxId(taxId: string): boolean {
  if (!/^\d{13}$/.test(taxId)) return false;
  const sum = [...taxId.slice(0, 12)].reduce((acc, d, i) => acc + Number(d) * (13 - i), 0);
  return (11 - (sum % 11)) % 10 === Number(taxId[12]);
}

/** 'สำนักงานใหญ่' or 'สาขา 00001' */
export const branchLabel = (s: Pick<Supplier, 'branchType' | 'branchNo'>): string =>
  s.branchType === 'head' ? 'สำนักงานใหญ่' : `สาขา ${s.branchNo}`;

/** 'เงินสด' or 'เครดิต 30 วัน' */
export const creditLabel = (days: number): string => (days > 0 ? `เครดิต ${days} วัน` : 'เงินสด');
