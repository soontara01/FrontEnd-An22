import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { isPlatformRequest } from '../http/platform-request';

/**
 * Sends the working branch as `X-Branch-Id` when one is chosen (saas-plan section 2); the server
 * checks it is one the user may work in (else 403). Never to the platform API (E36).
 */
export const branchInterceptor: HttpInterceptorFn = (req, next) => {
  const branch = isPlatformRequest(req.url) ? null : inject(AuthService).currentBranch();
  return next(branch ? req.clone({ setHeaders: { 'X-Branch-Id': String(branch.id) } }) : req);
};
