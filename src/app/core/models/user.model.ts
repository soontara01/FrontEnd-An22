export type UserRole = 'admin' | 'user';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export type UserPayload = Omit<User, 'id' | 'createdAt'>;

/** A change to a user account checked by `userChangeError()`: an edit (new values) or a delete. */
export type UserChange =
  | { kind: 'update'; id: number; payload: Pick<UserPayload, 'role' | 'active'> }
  | { kind: 'delete'; id: number };

/**
 * Admin-account rule for the user form and the server (the caller must already be an admin):
 * nobody may demote / deactivate / delete themselves, and the last active admin always stays.
 */
export function userChangeError(
  users: readonly Pick<User, 'id' | 'role' | 'active'>[],
  change: UserChange,
  actorId: number | null,
): string | null {
  const target = users.find((u) => u.id === change.id);
  if (!target) return null;
  const removesAdmin =
    change.kind === 'delete' || change.payload.role !== 'admin' || !change.payload.active;
  const removesAccess = change.kind === 'delete' || !change.payload.active;
  if (change.id === actorId) {
    if (change.kind === 'delete') return 'ลบบัญชีของตัวเองไม่ได้';
    if (target.role === 'admin' && change.payload.role !== 'admin') {
      return 'ลดสิทธิ์ผู้ดูแลระบบของตัวเองไม่ได้';
    }
    if (removesAccess) return 'ปิดใช้งานบัญชีของตัวเองไม่ได้';
  }
  if (target.role === 'admin' && target.active && removesAdmin) {
    const others = users.filter((u) => u.id !== target.id && u.role === 'admin' && u.active);
    if (others.length === 0) return 'ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน';
  }
  return null;
}
