import { COMPANY_INFO_DEFAULTS, companyInfoError } from './company.model';
import { loginNeedsMfa, mfaDisableError, mfaRequiredFor, mfaResetError } from './mfa.model';

describe('mfa.model (E55)', () => {
  const company = (mfaRequired: 'none' | 'admins' | 'all') => ({ mfaRequired });

  it('requires it by the company rule', () => {
    expect(mfaRequiredFor({ role: 'owner' }, company('none'))).toBe(false);
    expect(mfaRequiredFor({ role: 'owner' }, company('admins'))).toBe(true);
    expect(mfaRequiredFor({ role: 'admin' }, company('admins'))).toBe(true);
    expect(mfaRequiredFor({ role: 'user' }, company('admins'))).toBe(false);
    expect(mfaRequiredFor({ role: 'user' }, company('all'))).toBe(true);
  });

  it('goes to the code step when asked, when the user has it or when required', () => {
    const user = { role: 'user' as const, mfaEnabled: false };
    expect(loginNeedsMfa(user, company('none'), false)).toBe(false);
    expect(loginNeedsMfa(user, company('none'), true)).toBe(true);
    expect(loginNeedsMfa({ ...user, mfaEnabled: true }, company('none'), false)).toBe(true);
    expect(loginNeedsMfa(user, company('all'), false)).toBe(true);
  });

  it('lets a user turn it off only when it is on and not required', () => {
    expect(mfaDisableError({ role: 'user', mfaEnabled: false }, company('none'))).toBe(
      'ยังไม่ได้เปิดใช้ Microsoft Authenticator',
    );
    expect(mfaDisableError({ role: 'admin', mfaEnabled: true }, company('admins'))).toBe(
      'บริษัทบังคับให้ใช้ Microsoft Authenticator — ปิดเองไม่ได้',
    );
    expect(mfaDisableError({ role: 'user', mfaEnabled: true }, company('admins'))).toBeNull();
  });

  it('lets an admin clear someone else’s only', () => {
    expect(mfaResetError({ id: 1, mfaEnabled: true }, 1)).toContain('ของตัวเองไม่ได้');
    expect(mfaResetError({ id: 2, mfaEnabled: false }, 1)).toBe(
      'ผู้ใช้นี้ยังไม่ได้เปิดใช้ Microsoft Authenticator',
    );
    expect(mfaResetError({ id: 2, mfaEnabled: true }, 1)).toBeNull();
  });

  it('checks the company setting value', () => {
    const base = { ...COMPANY_INFO_DEFAULTS, name: 'ร้าน', vatRegistered: false };
    expect(companyInfoError({ ...base, mfaRequired: 'all' })).toBeNull();
    expect(companyInfoError({ ...base, mfaRequired: 'x' as never })).toBe(
      'การบังคับใช้ Microsoft Authenticator ไม่ถูกต้อง',
    );
  });
});
