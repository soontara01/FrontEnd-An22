import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, tap } from 'rxjs';
import { User, UserPayload } from '@core/models';
import { UsersApi } from './users-api.service';

/** Signals-based state for the users feature (provided in users.routes.ts). */
@Injectable()
export class UsersStore {
  private readonly api = inject(UsersApi);

  private readonly _users = signal<User[]>([]);
  private readonly _loading = signal(false);
  private loaded = false;

  readonly users = this._users.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly count = computed(() => this._users().length);

  /** Loads the list once; pass `force` to refresh from the server. */
  load(force = false): void {
    if (this.loaded && !force) return;
    this._loading.set(true);
    this.api
      .list()
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe((users) => {
        this._users.set(users);
        this.loaded = true;
      });
  }

  getById(id: number): Observable<User> {
    return this.api.get(id);
  }

  create(payload: UserPayload): Observable<User> {
    return this.api
      .create(payload)
      .pipe(tap((user) => this._users.update((list) => [...list, user])));
  }

  update(id: number, payload: UserPayload): Observable<User> {
    return this.api
      .update(id, payload)
      .pipe(tap((user) => this._users.update((list) => list.map((u) => (u.id === id ? user : u)))));
  }

  remove(id: number): Observable<void> {
    return this.api
      .remove(id)
      .pipe(tap(() => this._users.update((list) => list.filter((u) => u.id !== id))));
  }
}
