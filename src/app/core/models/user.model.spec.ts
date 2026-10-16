import {
  User,
  normalizeUsername,
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
