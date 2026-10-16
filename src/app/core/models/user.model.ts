export type UserRole = 'admin' | 'user';

export interface User {
  id: number;
  /** Login name (D4): `a-z 0-9 . _ -`, 3–30, lower case, unique within the company */
  username: string;
  name: string;
  /** Optional ('' = none); unique within the company when set */
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export type UserPayload = Omit<User, 'id' | 'createdAt'>;

/** The form a username is stored and compared in (trimmed, lower case). */
export const normalizeUsername = (username: string): string => username.trim().toLowerCase();

const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Format of a login name (decided 2026-10-16, E4). Thai message or null. */
export function usernameError(username: string): string | null {
  const name = normalizeUsername(username);
  if (!name) return 'กรุณากรอกชื่อผู้ใช้';
  if (!USERNAME_PATTERN.test(name)) {
    return 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9, . _ - ยาว 3–30 ตัว';
  }
  return null;
}

/**
 * The single rule for a user's login name and e-mail (user form + server, closes B5): a valid
 * username not used by another user of the company (ignoring case); an e-mail is optional but,
 * when given, valid and not used by another user. `exceptId` = the user being edited.
 */
export function userIdentityError(
  users: readonly Pick<User, 'id' | 'username' | 'email'>[],
  payload: Pick<UserPayload, 'username' | 'email'>,
  exceptId: number | null,
): string | null {
  const nameProblem = usernameError(payload.username);
  if (nameProblem) return nameProblem;
  const others = users.filter((u) => u.id !== exceptId);
  const name = normalizeUsername(payload.username);
  if (others.some((u) => normalizeUsername(u.username) === name)) return 'ชื่อผู้ใช้นี้มีอยู่แล้ว';
  const email = payload.email.trim().toLowerCase();
  if (!email) return null;
  if (!EMAIL_PATTERN.test(email)) return 'รูปแบบอีเมลไม่ถูกต้อง';
  if (others.some((u) => u.email.trim().toLowerCase() === email)) {
    return 'อีเมลนี้มีผู้ใช้อื่นใช้แล้ว';
  }
  return null;
}

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
