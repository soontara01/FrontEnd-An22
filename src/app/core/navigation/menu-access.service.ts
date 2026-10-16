import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, of, shareReplay, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ApiService } from '../http/api.service';
import { DEFAULT_MENU_ACCESS, MenuAccess, canSeeMenu } from '../models/menu-access.model';
import { MENU, MenuItem } from './menu.config';

/**
 * Menus the logged-in user may see (`MenuAccess`, set by an admin on `/users/menu-access`).
 * Loaded once per page load — a menu switch reloads the page anyway; admins see every menu
 * without asking the server.
 */
@Injectable({ providedIn: 'root' })
export class MenuAccessService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private readonly _access = signal<MenuAccess | null>(null);
  private request$: Observable<MenuAccess> | null = null;

  /** The setting, fetched once; on an error (snackbar already shown) the default applies. */
  load(): Observable<MenuAccess> {
    this.request$ ??= this.api.get<MenuAccess>('settings/menu-access').pipe(
      catchError(() => of(DEFAULT_MENU_ACCESS)),
      tap((access) => this._access.set(access)),
      shareReplay(1),
    );
    return this.request$;
  }

  /** Reactive: re-evaluates once the setting arrives (the default until then). */
  canSee(path: string): boolean {
    return canSeeMenu(path, this.auth.isAdmin(), this._access());
  }

  /** The first menu this user sees, for redirects (every user sees at least one). */
  firstVisible(access: MenuAccess | null = this._access()): MenuItem {
    const isAdmin = this.auth.isAdmin();
    return MENU.find((m) => canSeeMenu(m.path, isAdmin, access)) ?? MENU[0];
  }
}
