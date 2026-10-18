import { SignupPayload, companyCodeError, onboardingSteps, signupError } from './signup.model';

describe('signup (E37)', () => {
  const valid: SignupPayload = {
    companyCode: 'acme',
    companyName: 'บริษัท แอคมี จำกัด',
    taxId: '0105550123451',
    vatRegistered: true,
    branch: { code: 'HQ', name: 'สำนักงานใหญ่', branchNo: '00000', address: 'กรุงเทพฯ', phone: '' },
    owner: { name: 'สมศักดิ์', username: 'boss', email: 'boss@acme.test', password: 'secret' },
    planId: 'starter',
  };

  it('checks the company code format', () => {
    expect(companyCodeError(' acme ')).toBeNull();
    expect(companyCodeError('')).toBe('กรุณากรอกรหัสบริษัท');
    expect(companyCodeError('AB')).toBe('รหัสบริษัทใช้ได้เฉพาะ A-Z, 0-9 ยาว 3–20 ตัว');
    expect(companyCodeError('AC-ME')).not.toBeNull();
  });

  it('checks company, first branch, owner and package in that order', () => {
    expect(signupError(valid)).toBeNull();
    expect(signupError({ ...valid, companyName: ' ' })).toBe('กรุณากรอกชื่อบริษัท');
    expect(signupError({ ...valid, taxId: '123' })).toBe(
      'เลขประจำตัวผู้เสียภาษีต้องเป็น 13 หลักที่ถูกต้อง',
    );
    expect(signupError({ ...valid, vatRegistered: false, taxId: '' })).toBeNull();
    expect(signupError({ ...valid, branch: { ...valid.branch, branchNo: '1' } })).not.toBeNull();
    expect(signupError({ ...valid, owner: { ...valid.owner, name: '' } })).toBe(
      'กรุณากรอกชื่อเจ้าของบริษัท',
    );
    expect(signupError({ ...valid, owner: { ...valid.owner, email: '' } })).toBe(
      'เจ้าของบริษัทต้องมีอีเมล (ใช้กู้รหัสผ่านและแจ้งเรื่องการเก็บเงิน)',
    );
    expect(signupError({ ...valid, owner: { ...valid.owner, password: '12' } })).toBe(
      'รหัสผ่านต้องมีอย่างน้อย 4 ตัว',
    );
    expect(signupError({ ...valid, planId: 'gold' as never })).toBe('กรุณาเลือกแพ็กเกจ');
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
