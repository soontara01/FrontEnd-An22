import {
  branchScopeError,
  parseBranchScope,
  User,
  canWorkIn,
  isCompanyAdmin,
  normalizeUsername,
  passwordError,
  userBranchError,
  userScopeError,
  userChangeError,
  userIdentityError,
  usernameError,
} from './user.model';

describe('userChangeError', () => {
  const user = (id: number, role: User['role'], active = true) => ({ id, role, active });
  const users = [user(1, 'admin'), user(2, 'user'), user(3, 'admin', false)];

  it('blocks demoting, deactivating or deleting yourself', () => {
    const update = (role: User['role'], active: boolean) =>
      userChangeError(
        [...users, user(4, 'admin')],
        { kind: 'update', id: 1, payload: { role, active } },
        1,
      );
    expect(update('user', true)).toBe('ลดสิทธิ์ผู้ดูแลระบบของตัวเองไม่ได้');
    expect(update('admin', false)).toBe('ปิดใช้งานบัญชีของตัวเองไม่ได้');
    expect(update('admin', true)).toBeNull();
    expect(userChangeError(users, { kind: 'delete', id: 1 }, 1)).toBe('ลบบัญชีของตัวเองไม่ได้');
  });

  it('keeps the last active admin', () => {
    const last = 'ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน';
    // Admin 1 is the only active admin (3 is inactive); the actor is someone else.
    expect(userChangeError(users, { kind: 'delete', id: 1 }, 9)).toBe(last);
    expect(
      userChangeError(users, { kind: 'update', id: 1, payload: { role: 'user', active: true } }, 9),
    ).toBe(last);
    // With a second active admin it is fine.
    expect(userChangeError([...users, user(4, 'admin')], { kind: 'delete', id: 1 }, 4)).toBeNull();
  });

  it('allows ordinary changes', () => {
    expect(userChangeError(users, { kind: 'delete', id: 2 }, 1)).toBeNull();
    expect(userChangeError(users, { kind: 'delete', id: 3 }, 1)).toBeNull();
    expect(
      userChangeError(
        users,
        { kind: 'update', id: 2, payload: { role: 'admin', active: true } },
        1,
      ),
    ).toBeNull();
  });
});

describe('userIdentityError', () => {
  const users = [
    { id: 1, username: 'admin', email: 'admin@example.com' },
    { id: 2, username: 'somchai', email: '' },
  ];

  it('checks the username format', () => {
    expect(usernameError('')).toBe('กรุณากรอกชื่อผู้ใช้');
    expect(usernameError('ab')).toBe('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9, . _ - ยาว 3–30 ตัว');
    expect(usernameError('สมชาย')).toBe('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9, . _ - ยาว 3–30 ตัว');
    expect(usernameError(' Som.Chai_2-x ')).toBeNull();
    expect(normalizeUsername(' SomChai ')).toBe('somchai');
  });

  it('keeps usernames and e-mails unique within the company, e-mail optional (B5)', () => {
    const check = (username: string, email: string, exceptId: number | null = null) =>
      userIdentityError(users, { username, email }, exceptId);
    expect(check('SOMCHAI', '')).toBe('ชื่อผู้ใช้นี้มีอยู่แล้ว');
    expect(check('somchai', '', 2)).toBeNull();
    expect(check('somying', '')).toBeNull();
    expect(check('somying', 'x@')).toBe('รูปแบบอีเมลไม่ถูกต้อง');
    expect(check('somying', ' Admin@Example.com')).toBe('อีเมลนี้มีผู้ใช้อื่นใช้แล้ว');
    expect(check('admin', 'admin@example.com', 1)).toBeNull();
  });
});

describe('user branch rights and passwords', () => {
  const branches = [
    { id: 1, active: true },
    { id: 2, active: true },
    { id: 3, active: false },
  ];
  const admin = (allBranches: boolean, branchIds: number[] = []) => ({
    role: 'admin' as const,
    allBranches,
    branchIds,
  });

  it('knows the company admin (E5) and who may work in a branch', () => {
    expect(isCompanyAdmin(admin(true))).toBe(true);
    expect(isCompanyAdmin(admin(false, [1]))).toBe(false);
    expect(isCompanyAdmin({ role: 'user', allBranches: true })).toBe(false);
    expect(canWorkIn({ allBranches: false, branchIds: [1] }, branches[0])).toBe(true);
    expect(canWorkIn({ allBranches: false, branchIds: [1] }, branches[1])).toBe(false);
    expect(canWorkIn({ allBranches: true, branchIds: [] }, branches[2])).toBe(false);
  });

  it('needs all branches or at least one active branch', () => {
    expect(userBranchError({ allBranches: true, branchIds: [] }, branches)).toBeNull();
    expect(userBranchError({ allBranches: false, branchIds: [] }, branches)).toBe(
      'กรุณาเลือกสาขาอย่างน้อย 1 สาขา',
    );
    expect(userBranchError({ allBranches: false, branchIds: [1, 3] }, branches)).toBe(
      'สาขาที่เลือกไม่มีอยู่หรือปิดใช้งานแล้ว',
    );
    expect(userBranchError({ allBranches: false, branchIds: [2] }, branches)).toBeNull();
  });

  it('keeps a branch admin to users of their own branches (E6)', () => {
    const branchAdmin = admin(false, [1, 2]);
    const user = (branchIds: number[], allBranches = false) => ({ allBranches, branchIds });
    expect(userScopeError(admin(true), user([], true), null)).toBeNull();
    expect(userScopeError(branchAdmin, null, user([2]))).toBeNull();
    expect(userScopeError(branchAdmin, user([1]), user([1, 2]))).toBeNull();
    expect(userScopeError(branchAdmin, user([3]), user([1]))).toBe(
      'จัดการผู้ใช้ของสาขาอื่นหรือทุกสาขาได้เฉพาะผู้ดูแลระบบระดับบริษัท',
    );
    expect(userScopeError(branchAdmin, user([], true), null)).toBe(
      'จัดการผู้ใช้ของสาขาอื่นหรือทุกสาขาได้เฉพาะผู้ดูแลระบบระดับบริษัท',
    );
    expect(userScopeError(branchAdmin, null, user([], true))).toBe(
      'ให้สิทธิ์ทุกสาขาหรือสาขาที่ตัวเองไม่มีได้เฉพาะผู้ดูแลระบบระดับบริษัท',
    );
    expect(userScopeError(branchAdmin, user([1]), user([1, 3]))).toBe(
      'ให้สิทธิ์ทุกสาขาหรือสาขาที่ตัวเองไม่มีได้เฉพาะผู้ดูแลระบบระดับบริษัท',
    );
  });

  it('checks a password (E10)', () => {
    expect(passwordError('')).toBe('กรุณากรอกรหัสผ่าน');
    expect(passwordError(' 1234')).toBe('รหัสผ่านต้องไม่ขึ้นต้นหรือลงท้ายด้วยช่องว่าง');
    expect(passwordError('123')).toBe('รหัสผ่านต้องมีอย่างน้อย 4 ตัว');
    expect(passwordError('x'.repeat(65))).toBe('รหัสผ่านต้องไม่เกิน 64 ตัว');
    expect(passwordError('1234')).toBeNull();
  });
});

describe('branch scope of lists (E23)', () => {
  const branches = [
    { id: 1, active: true },
    { id: 2, active: true },
    { id: 3, active: false },
  ];
  const companyAdmin = { role: 'admin' as const, allBranches: true, branchIds: [] };
  const branchAdmin = { role: 'admin' as const, allBranches: false, branchIds: [2] };
  const staff = { role: 'user' as const, allBranches: false, branchIds: [1] };

  it('reads ?branchId= (missing = the working branch)', () => {
    expect(parseBranchScope(null, 2)).toBe(2);
    expect(parseBranchScope('all', 2)).toBe('all');
    expect(parseBranchScope('1', 2)).toBe(1);
    expect(parseBranchScope('x', 2)).toBeNull();
  });

  it('lets company admins see any branch or all, others only their own', () => {
    expect(branchScopeError('all', companyAdmin, branches)).toBeNull();
    expect(branchScopeError(3, companyAdmin, branches)).toBeNull();
    expect(branchScopeError('all', branchAdmin, branches)).toBe(
      'ดูทุกสาขาได้เฉพาะผู้ดูแลระบบระดับบริษัท',
    );
    expect(branchScopeError(2, branchAdmin, branches)).toBeNull();
    expect(branchScopeError(1, branchAdmin, branches)).toBe('ไม่มีสิทธิ์ดูข้อมูลของสาขานี้');
    expect(branchScopeError(1, staff, branches)).toBeNull();
    expect(branchScopeError(9, companyAdmin, branches)).toBe('ไม่มีสิทธิ์ดูข้อมูลของสาขานี้');
  });
});
