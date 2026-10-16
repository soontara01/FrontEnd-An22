import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';

/**
 * Sends the working branch as `X-Branch-Id` when one is chosen (saas-plan section 2); the server
 * checks it is one the user may work in (else 403).
 */
export const branchInterceptor: HttpInterceptorFn = (req, next) => {
  const branch = inject(AuthService).currentBranch();
  return next(branch ? req.clone({ setHeaders: { 'X-Branch-Id': String(branch.id) } }) : req);
};
