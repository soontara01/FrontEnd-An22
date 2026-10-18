import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { isPlatformRequest } from '../http/platform-request';
import { TerminalService } from '../services/terminal.service';

/** Sends this device's POS terminal number when it is set (docs/terminal-plan.md); not to the platform API. */
export const terminalInterceptor: HttpInterceptorFn = (req, next) => {
  const id = isPlatformRequest(req.url) ? null : inject(TerminalService).terminalId();
  return next(id === null ? req : req.clone({ setHeaders: { 'X-Terminal-Id': String(id) } }));
};
