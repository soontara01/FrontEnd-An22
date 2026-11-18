import {
  BRANCH_DEFAULTS,
  COMPANY_INFO_DEFAULTS,
  branchError,
  companyInfoError,
  normalizeCompanyCode,
} from './company.model';
import { PLANS, PlanId } from './plan.model';
import { userIdentityError } from './user.model';

/**
 * A new company, created only by the platform (E59 — nobody signs up by themselves since then,
 * E37): the company, its first branch and its owner, on a trial of the chosen package.
 * `POST /platform/companies` answers `NewCompanyResult`; the owner has no password until they use
 * the setup link the platform passes on.
 */
export interface NewCompanyPayload {
  /** Company code used at login (D4): A-Z 0-9, 3–20, unique on the platform forever (E39) */
  companyCode: string;
  companyName: string;
  taxId: string;
  vatRegistered: boolean;
  branch: { code: string; name: string; branchNo: string; address: string; phone: string };
  owner: { name: string; username: string; email: string };
  planId: PlanId;
  /** Trial days (E59): `TRIAL_DAYS` by default, 0 = no trial — the first invoice is issued at once */
  trialDays: number;
}

/** Longest trial the platform may give (E59). */
export const MAX_TRIAL_DAYS = 90;

/** Hours a setup link (owner's first password, E59) stays valid. */
export const SETUP_LINK_HOURS = 72;

/**
 * A single-use link for the owner to set their password (E59): `path` is
 * `/auth/reset-password?token=…` — the platform page puts its own origin in front and the platform
 * admin passes it on (LINE / SMS / e-mail). Shown once: the api keeps only a hash of the token.
 */
export interface SetupLink {
  path: string;
  expiresAt: string;
}

const COMPANY_CODE_PATTERN = /^[A-Z0-9]{3,20}$/;

/** Format of a company code (stored upper case). Thai message or null. */
export function companyCodeError(code: string): string | null {
  const value = normalizeCompanyCode(code);
  if (!value) return 'กรุณากรอกรหัสบริษัท';
  if (!COMPANY_CODE_PATTERN.test(value)) return 'รหัสบริษัทใช้ได้เฉพาะ A-Z, 0-9 ยาว 3–20 ตัว';
  return null;
}

/**
 * The single rule for a new company (platform form + server), in the order the form shows:
 * company, first branch, owner, package, trial. Whether the code is free is the server's
 * (`รหัสบริษัทนี้ถูกใช้แล้ว`).
 */
export function newCompanyError(p: NewCompanyPayload): string | null {
  const company =
    companyCodeError(p.companyCode) ??
    companyInfoError({
      ...COMPANY_INFO_DEFAULTS,
      name: p.companyName,
      taxId: p.taxId.trim(),
      vatRegistered: p.vatRegistered,
    });
  if (company) return company.replace('ชื่อร้าน', 'ชื่อบริษัท');
  const branch = branchError({ ...BRANCH_DEFAULTS, ...p.branch, active: true }, []);
  if (branch) return branch;
  if (!p.owner.name.trim()) return 'กรุณากรอกชื่อเจ้าของบริษัท';
  const owner = userIdentityError(
    [],
    { username: p.owner.username, email: p.owner.email, role: 'owner' },
    null,
  );
  if (owner) return owner;
  if (!PLANS.some((plan) => plan.id === p.planId)) return 'กรุณาเลือกแพ็กเกจ';
  if (!Number.isInteger(p.trialDays) || p.trialDays < 0 || p.trialDays > MAX_TRIAL_DAYS) {
    return `วันทดลองใช้ต้องเป็นจำนวนเต็ม 0–${MAX_TRIAL_DAYS} วัน`;
  }
  return null;
}

/** `POST /auth/forgot-password` (E41): the answer never tells whether the code / e-mail exist. */
export const FORGOT_PASSWORD_ANSWER =
  'ถ้ารหัสบริษัทและอีเมลตรงกับเจ้าของบริษัท ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลนั้น (ใช้ได้ภายใน 1 ชั่วโมง)';

/** Minutes a password reset link stays valid (E41). */
export const RESET_LINK_MINUTES = 60;

/** What a new company still has to set up (E37 / E59): counts from `GET /company/onboarding`. */
export interface OnboardingCounts {
  terminals: number;
  categories: number;
  products: number;
  prices: number;
  users: number;
}

export interface OnboardingStep {
  key: keyof OnboardingCounts;
  label: string;
  /** Cross-menu link (plain href — SPA per menu) */
  href: string;
  done: boolean;
}

/** The setup checklist of a new company, in the order it is best done. */
export function onboardingSteps(c: OnboardingCounts): OnboardingStep[] {
  return [
    {
      key: 'terminals',
      label: 'ลงทะเบียนเครื่อง POS',
      href: '/master-data/terminals',
      done: c.terminals > 0,
    },
    {
      key: 'categories',
      label: 'สร้างหมวดหมู่สินค้า',
      href: '/master-data/categories',
      done: c.categories > 0,
    },
    { key: 'products', label: 'เพิ่มสินค้า (SKU)', href: '/sku', done: c.products > 0 },
    { key: 'prices', label: 'ตั้งราคาขาย', href: '/pricing', done: c.prices > 0 },
    { key: 'users', label: 'เพิ่มพนักงาน', href: '/users', done: c.users > 1 },
  ];
}
