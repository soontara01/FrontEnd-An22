import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import { silentUnauthorized } from '@core/http/silent-unauthorized';
import { PlatformAdmin, PlatformLoginResponse } from '@core/models';

/**
 * The platform admin's session (E36), apart from the shop session of the device: the web server
 * keeps its token in the session's platform slot and adds it to `/platform/…` only (E48). The
 * admin is kept in memory — `load()` asks `GET /platform/me` once per page load (route guards).
 * Provided in platform.routes.ts.
 */
@Injectable()
export class PlatformAuth {
  private readonly api = inject(ApiService);
  private readonly document = inject(DOCUMENT);

  private readonly _admin = signal<PlatformAdmin | null>(null);
  /** `GET /platform/me` of this page load, shared by the guards (null = not asked yet). */
  private loading: Observable<boolean> | null = null;

  readonly admin = this._admin.asReadonly();
  readonly isLoggedIn = computed(() => !!this._admin());

  /** Whether a platform admin is logged in; 401 = not (no snackbar). Asked once per page load. */
  load(): Observable<boolean> {
    if (this._admin()) return of(true);
    this.loading ??= this.api
      .get<PlatformAdmin>('platform/me', undefined, silentUnauthorized())
      .pipe(
        tap((admin) => this._admin.set(admin)),
        map(() => true),
        catchError(() => of(false)),
      );
    return this.loading;
  }

  login(username: string, password: string): Observable<PlatformLoginResponse> {
    return this.api
      .post<PlatformLoginResponse>('platform/auth/login', { username, password })
      .pipe(tap(({ admin }) => this._admin.set(admin)));
  }

  /** Ends the platform session on the web server, then the platform login page. */
  logout(): void {
    this._admin.set(null);
    const toLogin = () => this.document.location.assign('/platform/login');
    this.api
      .post('platform/auth/logout', null, silentUnauthorized())
      .subscribe({ next: toLogin, error: toLogin });
  }
}
