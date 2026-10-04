import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler, Injectable, inject } from '@angular/core';
import { NotificationService } from '../services/notification.service';

/** Catches uncaught (non-HTTP) errors; HTTP errors are handled by errorInterceptor. */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly notify = inject(NotificationService);

  handleError(error: unknown): void {
    console.error(error);
    if (!(error instanceof HttpErrorResponse)) {
      this.notify.error('เกิดข้อผิดพลาดที่ไม่คาดคิด');
    }
  }
}
