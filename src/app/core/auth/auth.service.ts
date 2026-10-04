import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from '../http/api.service';
import { LoginRequest, LoginResponse, User } from '../models';
import { StorageService } from '../services/storage.service';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly storage = inject(StorageService);
  private readonly document = inject(DOCUMENT);

  private readonly _token = signal<string | null>(this.storage.get<string>(TOKEN_KEY));
  private readonly _user = signal<User | null>(this.storage.get<User>(USER_KEY));

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._token());

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('auth/login', credentials).pipe(
      tap(({ token, user }) => {
        this.storage.set(TOKEN_KEY, token);
        this.storage.set(USER_KEY, user);
        this._token.set(token);
        this._user.set(user);
      }),
    );
  }

  logout(): void {
    this.storage.remove(TOKEN_KEY);
    this.storage.remove(USER_KEY);
    this._token.set(null);
    this._user.set(null);
    // Full page reload to the login page (SPA per menu)
    this.document.location.assign('/auth/login');
  }
}
