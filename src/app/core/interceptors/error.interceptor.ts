import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { DOCUMENT, inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { isPlatformRequest } from '../http/platform-request';
import { SILENT_UNAUTHORIZED } from '../http/silent-unauthorized';
import { NotificationService } from '../services/notification.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const notify = inject(NotificationService);
  const document = inject(DOCUMENT);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401 && req.context.get(SILENT_UNAUTHORIZED)) {
          // "Not logged in" — the caller decides (the page opens logged out, logout goes on)
        } else if (err.status === 401 && !req.url.endsWith('/auth/login')) {
          notify.error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
          if (isPlatformRequest(req.url)) {
            // The platform admin's session (E36) has ended (the web server dropped its token);
            // the shop session on this device stays.
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
