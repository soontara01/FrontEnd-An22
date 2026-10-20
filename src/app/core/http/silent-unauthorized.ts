import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * A request whose 401 only means "not logged in" (`GET /me` when a page opens, logout):
 * `errorInterceptor` shows nothing and does not log out — the caller handles it.
 */
export const SILENT_UNAUTHORIZED = new HttpContextToken<boolean>(() => false);

export const silentUnauthorized = (): HttpContext =>
  new HttpContext().set(SILENT_UNAUTHORIZED, true);
