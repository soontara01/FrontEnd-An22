import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import { MenuAccess, User, UserPayload } from '@core/models';

/** HTTP calls for the users feature (provided in users.routes.ts). */
@Injectable()
export class UsersApi {
  private readonly api = inject(ApiService);

  list(): Observable<User[]> {
    return this.api.get<User[]>('users');
  }

  get(id: number): Observable<User> {
    return this.api.get<User>(`users/${id}`);
  }

  create(payload: UserPayload): Observable<User> {
    return this.api.post<User>('users', payload);
  }

  update(id: number, payload: UserPayload): Observable<User> {
    return this.api.put<User>(`users/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.api.delete(`users/${id}`);
  }

  /** Menus the `user` role sees (`/users/menu-access`). */
  menuAccess(): Observable<MenuAccess> {
    return this.api.get<MenuAccess>('settings/menu-access');
  }

  saveMenuAccess(access: MenuAccess): Observable<MenuAccess> {
    return this.api.put<MenuAccess>('settings/menu-access', access);
  }
}
