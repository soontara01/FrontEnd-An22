import type { User } from './user.model';

/**
 * Two-step login with Microsoft Authenticator: every shop user (E57) and every platform admin
 * (E56) types the 6-digit code after the password, every time — set up (QR) on the first login.
 * An admin clears a user's when a phone is lost; codes are checked by `verifyTotp()`.
 */

/**
 * Platform admins' account in the app reads "AN22 · PLATFORM:<username>" (no company). A lost
 * phone is cleared on the server (`scripts/platform-mfa-reset.sh` of the api).
 */
export const PLATFORM_MFA_ACCOUNT = 'PLATFORM';

export const MFA_WRONG_CODE = 'รหัสยืนยันไม่ถูกต้อง';
export const MFA_CHALLENGE_EXPIRED = 'หมดเวลายืนยันรหัส กรุณาเข้าสู่ระบบใหม่';

/** An admin clearing a user's Authenticator (`DELETE /users/:id/mfa`). Thai message or null. */
export function mfaResetError(
  target: Pick<User, 'id' | 'mfaEnabled'>,
  callerId: number,
): string | null {
  if (target.id === callerId) {
    return 'ล้าง Microsoft Authenticator ของตัวเองไม่ได้ — ให้ผู้ดูแลระบบคนอื่นล้างให้';
  }
  if (!target.mfaEnabled) return 'ผู้ใช้นี้ยังไม่ได้ผูก Microsoft Authenticator';
  return null;
}
