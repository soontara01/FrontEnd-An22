import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TerminalService } from '../services/terminal.service';

/** Sends this device's POS terminal number when it is set (docs/terminal-plan.md). */
export const terminalInterceptor: HttpInterceptorFn = (req, next) => {
  const id = inject(TerminalService).terminalId();
  return next(id === null ? req : req.clone({ setHeaders: { 'X-Terminal-Id': String(id) } }));
};
