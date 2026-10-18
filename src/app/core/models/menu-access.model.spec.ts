import { DEFAULT_MENU_ACCESS, canSeeMenu, menuAccessError } from './menu-access.model';

describe('menu access', () => {
  const known = ['dashboard', 'pos', 'sales', 'inventory', 'users', 'settings'];

  it('accepts known menus for the user role, at least one, never users', () => {
    expect(menuAccessError({ userMenus: ['pos', 'sales'] }, known)).toBeNull();
    expect(menuAccessError({ userMenus: [] }, known)).toBe(
      'ต้องเลือกอย่างน้อย 1 เมนูให้ผู้ใช้ทั่วไป',
    );
    expect(menuAccessError({}, known)).toBe('ต้องเลือกอย่างน้อย 1 เมนูให้ผู้ใช้ทั่วไป');
    expect(menuAccessError({ userMenus: ['pos', 'users'] }, known)).toBe(
      'เมนูผู้ใช้งาน / บัญชีบริษัท เป็นของผู้ดูแลระบบเท่านั้น',
    );
    expect(menuAccessError({ userMenus: ['account'] }, [...known, 'account'])).toBe(
      'เมนูผู้ใช้งาน / บัญชีบริษัท เป็นของผู้ดูแลระบบเท่านั้น',
    );
    expect(menuAccessError({ userMenus: ['reports'] }, known)).toBe('ไม่มีเมนู reports');
    expect(menuAccessError({ userMenus: ['pos', 'pos'] }, known)).toBe('เลือกเมนูซ้ำ');
  });

  it('shows admins every menu and the user role only its own', () => {
    const access = { userMenus: ['pos'] };
    expect(canSeeMenu('inventory', true, access)).toBe(true);
    expect(canSeeMenu('users', true, access)).toBe(true);
    expect(canSeeMenu('pos', false, access)).toBe(true);
    expect(canSeeMenu('inventory', false, access)).toBe(false);
    expect(canSeeMenu('users', false, { userMenus: ['users'] })).toBe(false);
    expect(canSeeMenu('account', false, { userMenus: ['account'] })).toBe(false);
    // Not loaded yet: the default (cashier work).
    expect(DEFAULT_MENU_ACCESS.userMenus).toEqual(['dashboard', 'pos', 'sales', 'settings']);
    expect(canSeeMenu('sales', false, null)).toBe(true);
    expect(canSeeMenu('sku', false, null)).toBe(false);
  });
});
