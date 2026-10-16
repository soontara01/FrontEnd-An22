/**
 * Which menus the `user` role sees (admins see every menu). Set by an admin on
 * `/users/menu-access`; it hides menus and blocks their routes only — data rights stay with the
 * permission table (`docs/saas-plan.md` section 17), since APIs are shared by several menus.
 */
export interface MenuAccess {
  /** `MenuItem.path` of every menu the `user` role sees */
  userMenus: string[];
}

/** Admin-only menu: never shown to the `user` role. */
export const ADMIN_ONLY_MENU = 'users';

/** Default for a new store: cashier work only (decided 2026-10-16). */
export const DEFAULT_USER_MENUS: readonly string[] = ['dashboard', 'pos', 'sales', 'settings'];

export const DEFAULT_MENU_ACCESS: MenuAccess = { userMenus: [...DEFAULT_USER_MENUS] };

/** The single rule for saving (form + server). `knownPaths` = every `MENU` path. */
export function menuAccessError(
  p: Partial<MenuAccess> | null | undefined,
  knownPaths: readonly string[],
): string | null {
  const menus = p?.userMenus;
  if (!Array.isArray(menus) || !menus.length) return 'ต้องเลือกอย่างน้อย 1 เมนูให้ผู้ใช้ทั่วไป';
  if (menus.includes(ADMIN_ONLY_MENU)) return 'เมนูผู้ใช้งานเป็นของผู้ดูแลระบบเท่านั้น';
  const unknown = menus.find((m) => !knownPaths.includes(m));
  if (unknown !== undefined) return `ไม่มีเมนู ${unknown}`;
  if (new Set(menus).size !== menus.length) return 'เลือกเมนูซ้ำ';
  return null;
}

/** Whether a role sees a menu: admins every one, `user` only those in `access` (never `users`). */
export function canSeeMenu(path: string, isAdmin: boolean, access: MenuAccess | null): boolean {
  if (isAdmin) return true;
  if (path === ADMIN_ONLY_MENU) return false;
  return (access ?? DEFAULT_MENU_ACCESS).userMenus.includes(path);
}
