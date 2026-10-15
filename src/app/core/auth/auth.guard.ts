import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Matches only when logged in; otherwise redirects to the login page. */
export const authGuard: CanMatchFn = () =>
  inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/auth/login']);

/**
 * Matches only for admins; others are redirected to `fallback`. Inside a feature pass a path of
 * the same menu (e.g. `/promotions`) so the redirect stays in that menu's chunk.
 */
export const adminGuardTo =
  (fallback: string): CanMatchFn =>
  () =>
    inject(AuthService).isAdmin() || inject(Router).parseUrl(fallback);

/** Admin-only menus (`MenuItem.adminOnly`): others go home. */
export const adminGuard: CanMatchFn = adminGuardTo('/');

/** Matches only when logged out (login page); otherwise redirects home. */
export const guestGuard: CanMatchFn = () =>
  !inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/']);
