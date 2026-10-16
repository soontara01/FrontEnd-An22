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
}

export interface Branch {
  id: number;
  /** Short code used in the system and document numbers, unique within the company, e.g. `BKK01` */
  code: string;
  name: string;
  /** Revenue Dept branch number, 5 digits; `00000` = head office */
  branchNo: string;
  active: boolean;
}

export const HEAD_OFFICE_BRANCH_NO = '00000';

/** The form a company code is stored and compared in (trimmed, upper case). */
export const normalizeCompanyCode = (code: string): string => code.trim().toUpperCase();

export const isHeadOffice = (b: Pick<Branch, 'branchNo'>): boolean =>
  b.branchNo === HEAD_OFFICE_BRANCH_NO;

/**
 * The single rule for a branch (branch tab + server): code A-Z / 0-9 2–10 characters and
 * `branchNo` 5 digits, both unique within the company; a name up to 100 characters.
 */
export function branchError(
  b: Pick<Branch, 'code' | 'name' | 'branchNo'> & { id?: number },
  branches: readonly Pick<Branch, 'id' | 'code' | 'branchNo'>[],
): string | null {
  const others = branches.filter((x) => x.id !== b.id);
  const code = b.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(code)) return 'รหัสสาขาต้องเป็น A-Z หรือ 0-9 ยาว 2–10 ตัว';
  if (others.some((x) => x.code.toUpperCase() === code)) return 'รหัสสาขานี้มีอยู่แล้ว';
  if (!b.name.trim()) return 'กรุณากรอกชื่อสาขา';
  if (b.name.length > 100) return 'ชื่อสาขาต้องไม่เกิน 100 ตัวอักษร';
  if (!/^\d{5}$/.test(b.branchNo)) return 'เลขที่สาขาต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)';
  if (others.some((x) => x.branchNo === b.branchNo)) return 'เลขที่สาขานี้มีอยู่แล้ว';
  return null;
}
