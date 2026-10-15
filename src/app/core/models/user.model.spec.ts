import { User, userChangeError } from './user.model';

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
