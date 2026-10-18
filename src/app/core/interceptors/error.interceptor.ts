import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { DOCUMENT, inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { PLATFORM_TOKEN_KEY, isPlatformRequest } from '../http/platform-request';
import { NotificationService } from '../services/notification.service';
import { StorageService } from '../services/storage.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const notify = inject(NotificationService);
  const storage = inject(StorageService);
  const document = inject(DOCUMENT);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401 && !req.url.endsWith('/auth/login')) {
          notify.error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
          if (isPlatformRequest(req.url)) {
            // The platform admin's session (E36); the shop session on this device stays.
            storage.remove(PLATFORM_TOKEN_KEY);
            document.location.assign('/platform/login');
          } else {
            auth.logout();
          }
        } else {
          notify.error(err.error?.message ?? err.message ?? 'เกิดข้อผิดพลาด');
        }
      }
      return throwError(() => err);
    }),
  );
};
