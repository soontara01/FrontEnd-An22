import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, UrlSegment, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { MenuAccessService } from '../navigation/menu-access.service';
import { NotificationService } from '../services/notification.service';
import {
  adminGuard,
  adminGuardTo,
  authGuard,
  branchGuard,
  guestGuard,
  menuGuard,
} from './auth.guard';
import { AuthService } from './auth.service';

describe('auth guards', () => {
  const isLoggedIn = signal(false);
  const isAdmin = signal(false);
  const currentBranch = signal<{ id: number } | null>(null);
  const company = signal<{ deletionPurgeAfter?: string | null } | null>(null);
  const notify = { error: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isLoggedIn, isAdmin, currentBranch, company } },
        { provide: NotificationService, useValue: notify },
        {
          provide: MenuAccessService,
          useValue: {
            load: () => of({ userMenus: ['pos', 'sales'] }),
            firstVisible: () => ({ path: 'pos' }),
          },
        },
      ],
    });
  });

  const run = (guard: typeof authGuard) =>
    TestBed.runInInjectionContext(() =>
      guard({} as Route, [] as UrlSegment[], {} as Parameters<typeof authGuard>[2]),
    );

  it('authGuard redirects to /auth/login when logged out', () => {
    isLoggedIn.set(false);
    const result = run(authGuard);
    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/auth/login');
  });

  it('authGuard allows when logged in', () => {
    isLoggedIn.set(true);
    expect(run(authGuard)).toBe(true);
  });

  it('branchGuard sends a session without a working branch to the branch page', () => {
    currentBranch.set(null);
    expect(String(run(branchGuard))).toBe('/auth/select-branch');
    currentBranch.set({ id: 2 });
    expect(run(branchGuard)).toBe(true);
  });

  it('guestGuard redirects home when logged in', () => {
    isLoggedIn.set(true);
    expect(String(run(guestGuard))).toBe('/');
  });

  it('adminGuard sends non-admins home with a snackbar and lets admins in', () => {
    notify.error.mockClear();
    isAdmin.set(false);
    expect(String(run(adminGuard))).toBe('/');
    expect(notify.error).toHaveBeenCalledWith('หน้านี้สำหรับผู้ดูแลระบบเท่านั้น');
    notify.error.mockClear();
    isAdmin.set(true);
    expect(run(adminGuard)).toBe(true);
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('adminGuardTo redirects non-admins within the feature', () => {
    isAdmin.set(false);
    expect(String(run(adminGuardTo('/promotions')))).toBe('/promotions');
  });

  it('menuGuard lets admins in and the user role only into the menus set for it', async () => {
    isAdmin.set(true);
    expect(run(menuGuard('inventory'))).toBe(true);

    isAdmin.set(false);
    const allowed = run(menuGuard('sales')) as Observable<boolean | UrlTree>;
    expect(await firstValueFrom(allowed)).toBe(true);
    const hidden = run(menuGuard('inventory')) as Observable<boolean | UrlTree>;
    expect(String(await firstValueFrom(hidden))).toBe('/pos');
    expect(notify.error).toHaveBeenCalledWith('ไม่มีสิทธิ์เข้าเมนูคลังสินค้า');
  });

  it('menuGuard keeps a company waiting for deletion on its data page (E39)', () => {
    isAdmin.set(true);
    company.set({ deletionPurgeAfter: '2026-11-17' });
    expect(String(run(menuGuard('dashboard')))).toBe('/account/data');
    expect(run(menuGuard('account'))).toBe(true);
    company.set(null);
  });
});
