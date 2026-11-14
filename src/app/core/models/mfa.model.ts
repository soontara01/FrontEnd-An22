import type { CompanyInfo, MfaRequirement } from './company.model';
import { hasAdminRights, type User } from './user.model';

/**
 * Two-step login with Microsoft Authenticator (TOTP, E55). The company may require it
 * (`CompanyInfo.mfaRequired`); a user may turn it on for themselves; an admin clears it when a
 * phone is lost. Codes are checked by `verifyTotp()` (`totp.model.ts`).
 */

export const MFA_REQUIRED_LABEL: Record<MfaRequirement, string> = {
  none: 'ไม่บังคับ (ผู้ใช้เลือกเปิดเอง)',
  admins: 'บังคับเจ้าของบริษัทและผู้ดูแลระบบ',
  all: 'บังคับผู้ใช้ทุกคน',
};

export const MFA_REQUIREMENTS = Object.keys(MFA_REQUIRED_LABEL) as MfaRequirement[];

/** The company makes this user log in with Authenticator. */
export function mfaRequiredFor(
  user: Pick<User, 'role'>,
  company: Pick<CompanyInfo, 'mfaRequired'>,
): boolean {
  const rule = company.mfaRequired ?? 'none';
  return rule === 'all' || (rule === 'admins' && hasAdminRights(user));
}

/**
 * Whether a login that passed its password goes on to the code step: through `/auth/login-mfa`
 * (`asked`), or the user has Authenticator, or the company requires it — never skipped (E55).
 */
export function loginNeedsMfa(
  user: Pick<User, 'role' | 'mfaEnabled'>,
  company: Pick<CompanyInfo, 'mfaRequired'>,
  asked: boolean,
): boolean {
  return asked || user.mfaEnabled || mfaRequiredFor(user, company);
}

export const MFA_WRONG_CODE = 'รหัสยืนยันไม่ถูกต้อง';
export const MFA_CHALLENGE_EXPIRED = 'หมดเวลายืนยันรหัส กรุณาเข้าสู่ระบบใหม่';

/** Turning one's own Authenticator off (`DELETE /me/mfa`). Thai message or null. */
export function mfaDisableError(
  user: Pick<User, 'role' | 'mfaEnabled'>,
  company: Pick<CompanyInfo, 'mfaRequired'>,
): string | null {
  if (!user.mfaEnabled) return 'ยังไม่ได้เปิดใช้ Microsoft Authenticator';
  if (mfaRequiredFor(user, company)) {
    return 'บริษัทบังคับให้ใช้ Microsoft Authenticator — ปิดเองไม่ได้';
  }
  return null;
}

/** An admin clearing a user's Authenticator (`DELETE /users/:id/mfa`). Thai message or null. */
export function mfaResetError(
  target: Pick<User, 'id' | 'mfaEnabled'>,
  callerId: number,
): string | null {
  if (target.id === callerId) {
    return 'ล้าง Microsoft Authenticator ของตัวเองไม่ได้ — ปิดได้ที่หน้าตั้งค่า';
  }
  if (!target.mfaEnabled) return 'ผู้ใช้นี้ยังไม่ได้เปิดใช้ Microsoft Authenticator';
  return null;
}
