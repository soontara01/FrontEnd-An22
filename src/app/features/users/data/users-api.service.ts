import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import { Branch, MenuAccess, NewUserPayload, User, UserPayload } from '@core/models';

/** HTTP calls for the users feature (provided in users.routes.ts). */
@Injectable()
export class UsersApi {
  private readonly api = inject(ApiService);

  list(): Observable<User[]> {
    return this.api.get<User[]>('users');
  }

  /** Every branch of the company, so a user's branches show by code even outside the admin's own. */
  branches(): Observable<Branch[]> {
    return this.api.get<Branch[]>('branches');
  }

  get(id: number): Observable<User> {
    return this.api.get<User>(`users/${id}`);
  }

  create(payload: NewUserPayload): Observable<User> {
    return this.api.post<User>('users', payload);
  }

  update(id: number, payload: UserPayload): Observable<User> {
    return this.api.put<User>(`users/${id}`, payload);
  }

  /** An admin sets a new password for the user (E10). */
  setPassword(id: number, password: string): Observable<null> {
    return this.api.put<null>(`users/${id}/password`, { password });
  }

  /** The owner hands ownership over (E33), confirming with their own password. */
  transferOwner(userId: number, password: string): Observable<User[]> {
    return this.api.post<User[]>('company/owner', { userId, password });
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
