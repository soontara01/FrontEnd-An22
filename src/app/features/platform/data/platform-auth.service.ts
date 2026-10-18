import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import { PLATFORM_TOKEN_KEY } from '@core/http/platform-request';
import { PlatformAdmin, PlatformLoginResponse } from '@core/models';
import { StorageService } from '@core/services/storage.service';

const ADMIN_KEY = 'platformAdmin';

/**
 * The platform admin's session (E36), apart from the shop session of the device: its own token
 * (`authInterceptor` sends it to `/platform/…` only). Provided in platform.routes.ts.
 */
@Injectable()
export class PlatformAuth {
  private readonly api = inject(ApiService);
  private readonly storage = inject(StorageService);
  private readonly document = inject(DOCUMENT);

  private readonly _token = signal(this.storage.get<string>(PLATFORM_TOKEN_KEY));
  private readonly _admin = signal(this.storage.get<PlatformAdmin>(ADMIN_KEY));

  readonly admin = this._admin.asReadonly();
  readonly isLoggedIn = computed(() => !!this._token());

  login(username: string, password: string): Observable<PlatformLoginResponse> {
    return this.api.post<PlatformLoginResponse>('platform/auth/login', { username, password }).pipe(
      tap(({ token, admin }) => {
        this.storage.set(PLATFORM_TOKEN_KEY, token);
        this.storage.set(ADMIN_KEY, admin);
        this._token.set(token);
        this._admin.set(admin);
      }),
    );
  }

  logout(): void {
    this.storage.remove(PLATFORM_TOKEN_KEY);
    this.storage.remove(ADMIN_KEY);
    this.document.location.assign('/platform/login');
  }
}
