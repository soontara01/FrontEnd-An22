import type { Branch } from './company.model';

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
  /** Branches this user may work in (ignored when `allBranches`) */
  branchIds: number[];
  /** Every branch of the company, now and later (an admin with it = company admin, E5) */
  allBranches: boolean;
  createdAt: string;
}

export type UserPayload = Omit<User, 'id' | 'createdAt'>;

/** `POST /users`: a new user needs a password (E10); the API never returns it. */
export type NewUserPayload = UserPayload & { password: string };

/** Who may do company-level work (branches, company settings, branch-limited promotions — E5 / E6). */
export const isCompanyAdmin = (u: Pick<User, 'role' | 'allBranches'> | null | undefined): boolean =>
  !!u && u.role === 'admin' && u.allBranches;

/** Whether the user may work in this branch (an inactive branch is never open to anyone). */
export const canWorkIn = (
  u: Pick<User, 'allBranches' | 'branchIds'>,
  branch: Pick<Branch, 'id' | 'active'>,
): boolean => branch.active && (u.allBranches || u.branchIds.includes(branch.id));

/** Branch rights of a user form / `POST`·`PUT /users`: all branches or at least one active one. */
export function userBranchError(
  p: Pick<UserPayload, 'allBranches' | 'branchIds'>,
  branches: readonly Pick<Branch, 'id' | 'active'>[],
): string | null {
  if (p.allBranches) return null;
  if (p.branchIds.length === 0) return 'กรุณาเลือกสาขาอย่างน้อย 1 สาขา';
  const active = new Set(branches.filter((b) => b.active).map((b) => b.id));
  if (p.branchIds.some((id) => !active.has(id))) return 'สาขาที่เลือกไม่มีอยู่หรือปิดใช้งานแล้ว';
  return null;
}

/**
 * E6: an admin limited to some branches manages only users within those branches, and cannot give
 * all branches or a branch they don't have. `before` null = a new user, `after` null = a delete.
 */
export function userScopeError(
  actor: Pick<User, 'role' | 'allBranches' | 'branchIds'>,
  before: Pick<User, 'allBranches' | 'branchIds'> | null,
  after: Pick<User, 'allBranches' | 'branchIds'> | null,
): string | null {
  if (isCompanyAdmin(actor)) return null;
  const mine = new Set(actor.branchIds);
  const within = (u: Pick<User, 'allBranches' | 'branchIds'>) =>
    !u.allBranches && u.branchIds.every((id) => mine.has(id));
  if (before && !within(before)) {
    return 'จัดการผู้ใช้ของสาขาอื่นหรือทุกสาขาได้เฉพาะผู้ดูแลระบบระดับบริษัท';
  }
  if (after && !within(after)) {
    return 'ให้สิทธิ์ทุกสาขาหรือสาขาที่ตัวเองไม่มีได้เฉพาะผู้ดูแลระบบระดับบริษัท';
  }
  return null;
}

/** A password set by an admin (E10): 4–64 characters, no spaces at either end. */
export function passwordError(password: string): string | null {
  if (!password) return 'กรุณากรอกรหัสผ่าน';
  if (password !== password.trim()) return 'รหัสผ่านต้องไม่ขึ้นต้นหรือลงท้ายด้วยช่องว่าง';
  if (password.length < 4) return 'รหัสผ่านต้องมีอย่างน้อย 4 ตัว';
  if (password.length > 64) return 'รหัสผ่านต้องไม่เกิน 64 ตัว';
  return null;
}

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
