import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TerminalService } from '../services/terminal.service';

/** Sends this device's POS terminal number (shifts: docs/shift-plan.md). */
export const terminalInterceptor: HttpInterceptorFn = (req, next) =>
  next(
    req.clone({ setHeaders: { 'X-Terminal-Id': String(inject(TerminalService).terminalId()) } }),
  );
