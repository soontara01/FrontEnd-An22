import { mfaResetError } from './mfa.model';

describe('mfa.model (E57)', () => {
  it('lets an admin clear someone else’s only', () => {
    expect(mfaResetError({ id: 1, mfaEnabled: true }, 1)).toBe(
      'ล้าง Microsoft Authenticator ของตัวเองไม่ได้ — ให้ผู้ดูแลระบบคนอื่นล้างให้',
    );
    expect(mfaResetError({ id: 2, mfaEnabled: false }, 1)).toBe(
      'ผู้ใช้นี้ยังไม่ได้ผูก Microsoft Authenticator',
    );
    expect(mfaResetError({ id: 2, mfaEnabled: true }, 1)).toBeNull();
  });
});
