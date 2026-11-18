import {
  NewCompanyPayload,
  companyCodeError,
  newCompanyError,
  onboardingSteps,
} from './signup.model';

describe('new company (E37 / E59)', () => {
  const valid: NewCompanyPayload = {
    companyCode: 'acme',
    companyName: 'บริษัท แอคมี จำกัด',
    taxId: '0105550123451',
    vatRegistered: true,
    branch: { code: 'HQ', name: 'สำนักงานใหญ่', branchNo: '00000', address: 'กรุงเทพฯ', phone: '' },
    owner: { name: 'สมศักดิ์', username: 'boss', email: 'boss@acme.test' },
    planId: 'starter',
    trialDays: 14,
  };

  it('checks the company code format', () => {
    expect(companyCodeError(' acme ')).toBeNull();
    expect(companyCodeError('')).toBe('กรุณากรอกรหัสบริษัท');
    expect(companyCodeError('AB')).toBe('รหัสบริษัทใช้ได้เฉพาะ A-Z, 0-9 ยาว 3–20 ตัว');
    expect(companyCodeError('AC-ME')).not.toBeNull();
  });

  it('checks company, first branch, owner and package in that order', () => {
    expect(newCompanyError(valid)).toBeNull();
    expect(newCompanyError({ ...valid, companyName: ' ' })).toBe('กรุณากรอกชื่อบริษัท');
    expect(newCompanyError({ ...valid, taxId: '123' })).toBe(
      'เลขประจำตัวผู้เสียภาษีต้องเป็น 13 หลักที่ถูกต้อง',
    );
    expect(newCompanyError({ ...valid, vatRegistered: false, taxId: '' })).toBeNull();
    expect(
      newCompanyError({ ...valid, branch: { ...valid.branch, branchNo: '1' } }),
    ).not.toBeNull();
    expect(newCompanyError({ ...valid, owner: { ...valid.owner, name: '' } })).toBe(
      'กรุณากรอกชื่อเจ้าของบริษัท',
    );
    expect(newCompanyError({ ...valid, owner: { ...valid.owner, email: '' } })).toBe(
      'เจ้าของบริษัทต้องมีอีเมล (ใช้กู้รหัสผ่านและแจ้งเรื่องการเก็บเงิน)',
    );
    expect(newCompanyError({ ...valid, planId: 'gold' as never })).toBe('กรุณาเลือกแพ็กเกจ');
  });

  it('takes 0–90 whole trial days (0 = no trial)', () => {
    expect(newCompanyError({ ...valid, trialDays: 0 })).toBeNull();
    expect(newCompanyError({ ...valid, trialDays: 90 })).toBeNull();
    for (const trialDays of [-1, 91, 1.5, Number.NaN]) {
      expect(newCompanyError({ ...valid, trialDays })).toBe(
        'วันทดลองใช้ต้องเป็นจำนวนเต็ม 0–90 วัน',
      );
    }
  });

  it('lists what a new company still has to set up', () => {
    const steps = onboardingSteps({
      terminals: 1,
      categories: 0,
      products: 0,
      prices: 0,
      users: 1,
    });
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ['terminals', true],
      ['categories', false],
      ['products', false],
      ['prices', false],
      ['users', false],
    ]);
  });
});
