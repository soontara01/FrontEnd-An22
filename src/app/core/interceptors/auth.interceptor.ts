import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { PLATFORM_TOKEN_KEY, isPlatformRequest } from '../http/platform-request';
import { StorageService } from '../services/storage.service';

/** The shop user's token — or, for the platform API, the platform admin's (E36). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = isPlatformRequest(req.url)
    ? inject(StorageService).get<string>(PLATFORM_TOKEN_KEY)
    : inject(AuthService).token();
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};
