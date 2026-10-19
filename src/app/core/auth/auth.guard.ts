import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { canSeeMenu } from '../models/menu-access.model';
import { MenuAccessService } from '../navigation/menu-access.service';
import { MENU } from '../navigation/menu.config';
import { NotificationService } from '../services/notification.service';
import { AuthService } from './auth.service';

/** Matches only when logged in; otherwise redirects to the login page. */
export const authGuard: CanMatchFn = () =>
  inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/auth/login']);

/**
 * Matches only for admins; others get a snackbar and are redirected to `fallback`. Inside a feature
 * pass a path of the same menu (e.g. `/promotions`) so the redirect stays in that menu's chunk.
 */
export const adminGuardTo =
  (fallback: string): CanMatchFn =>
  () => {
    if (inject(AuthService).isAdmin()) return true;
    inject(NotificationService).error('หน้านี้สำหรับผู้ดูแลระบบเท่านั้น');
    return inject(Router).parseUrl(fallback);
  };

/** Admin-only menus (`MenuItem.adminOnly`): others go home. */
export const adminGuard: CanMatchFn = adminGuardTo('/');

/**
 * A menu the `user` role may not see (`MenuAccess`): a snackbar, then the first menu they see.
 * Admins always pass. Hides the route only — data rights are checked by the server. While the
 * company waits for deletion (E39) only its owner is logged in, and only บัญชีบริษัท → ข้อมูลบริษัท
 * works.
 */
export const menuGuard =
  (path: string): CanMatchFn =>
  () => {
    const auth = inject(AuthService);
    if (auth.company()?.deletionPurgeAfter && path !== 'account') {
      return inject(Router).parseUrl('/account/data');
    }
    if (auth.isAdmin()) return true;
    const menus = inject(MenuAccessService);
    const router = inject(Router);
    const notify = inject(NotificationService);
    return menus.load().pipe(
      map((access) => {
        if (canSeeMenu(path, false, access)) return true;
        const label = MENU.find((m) => m.path === path)?.label ?? path;
        notify.error(`ไม่มีสิทธิ์เข้าเมนู${label}`);
        return router.parseUrl('/' + menus.firstVisible(access).path);
      }),
    );
  };

/**
 * The main app needs a working branch (`X-Branch-Id`): logged in with several branches and none
 * chosen on this device → the branch page.
 */
export const branchGuard: CanMatchFn = () =>
  !!inject(AuthService).currentBranch() || inject(Router).createUrlTree(['/auth/select-branch']);

/** Matches only when logged out (login page); otherwise redirects home. */
export const guestGuard: CanMatchFn = () =>
  !inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/']);
