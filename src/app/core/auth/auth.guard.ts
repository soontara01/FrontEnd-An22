import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Matches only when logged in; otherwise redirects to the login page. */
export const authGuard: CanMatchFn = () =>
  inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/auth/login']);

/** Matches only when logged out (login page); otherwise redirects home. */
export const guestGuard: CanMatchFn = () =>
  !inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/']);
