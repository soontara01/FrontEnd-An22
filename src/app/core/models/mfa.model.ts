import type { User } from './user.model';

/**
 * Two-step login with Microsoft Authenticator: every shop user (E57) and every platform admin
 * (E56) types the 6-digit code after the password, every time — set up (QR) on the first login.
 * A user moves it to a new phone themselves while logged in (E58, `MfaChange`); a lost phone is
 * cleared by an admin of the company, or by the platform (E58 — e.g. the owner with no other company
 * admin); codes are checked by `verifyTotp()`.
 */

/**
 * Platform admins' account in the app reads "AN22 · PLATFORM:<username>" (no company). A lost
 * phone is cleared on the server (`scripts/platform-mfa-reset.sh` of the api).
 */
export const PLATFORM_MFA_ACCOUNT = 'PLATFORM';

export const MFA_WRONG_CODE = 'รหัสยืนยันไม่ถูกต้อง';
export const MFA_CHALLENGE_EXPIRED = 'หมดเวลายืนยันรหัส กรุณาเข้าสู่ระบบใหม่';
/** E58: the `change` proof of a phone change is missing / expired / someone else's. */
export const MFA_CHANGE_EXPIRED = 'หมดเวลาเปลี่ยนเครื่อง กรุณาเริ่มใหม่';
export const MFA_WRONG_PASSWORD = 'รหัสผ่านไม่ถูกต้อง';
export const MFA_NOT_SET = 'ผู้ใช้นี้ยังไม่ได้ผูก Microsoft Authenticator';
/** E58: the platform clearing a user of a company (`POST /platform/companies/:id/mfa-reset`). */
export const MFA_USER_NOT_FOUND = 'ไม่พบชื่อผู้ใช้นี้ในบริษัท';

/** An admin clearing a user's Authenticator (`DELETE /users/:id/mfa`). Thai message or null. */
export function mfaResetError(
  target: Pick<User, 'id' | 'mfaEnabled'>,
  callerId: number,
): string | null {
  if (target.id === callerId) {
    return 'ล้าง Microsoft Authenticator ของตัวเองไม่ได้ — ให้ผู้ดูแลระบบคนอื่นล้างให้';
  }
  if (!target.mfaEnabled) return MFA_NOT_SET;
  return null;
}
