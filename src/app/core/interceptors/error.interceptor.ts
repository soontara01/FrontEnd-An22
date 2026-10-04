import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { NotificationService } from '../services/notification.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const notify = inject(NotificationService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401 && !req.url.endsWith('/auth/login')) {
          notify.error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
          auth.logout();
        } else {
          notify.error(err.error?.message ?? err.message ?? 'เกิดข้อผิดพลาด');
        }
      }
      return throwError(() => err);
    }),
  );
};
