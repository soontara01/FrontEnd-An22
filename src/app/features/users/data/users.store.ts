import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, tap } from 'rxjs';
import { Branch, NewUserPayload, User, UserPayload } from '@core/models';
import { httpErrorShown } from '@core/http/http-error-shown';
import { UsersApi } from './users-api.service';

/** Signals-based state for the users feature (provided in users.routes.ts). */
@Injectable()
export class UsersStore {
  private readonly api = inject(UsersApi);

  private readonly _users = signal<User[]>([]);
  private readonly _branches = signal<Branch[]>([]);
  private readonly _loading = signal(false);
  private loaded = false;

  readonly users = this._users.asReadonly();
  /** All branches of the company (incl. ones this admin does not work in). */
  readonly branches = this._branches.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly count = computed(() => this._users().length);

  /** Loads the list once; pass `force` to refresh from the server. */
  load(force = false): void {
    if (this.loaded && !force) return;
    this._loading.set(true);
    this.api
      .list()
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe({
        next: (users) => {
          this._users.set(users);
          this.loaded = true;
        },
        error: httpErrorShown,
      });
    this.api.branches().subscribe({
      next: (branches) => this._branches.set(branches),
      error: httpErrorShown,
    });
  }

  getById(id: number): Observable<User> {
    return this.api.get(id);
  }

  create(payload: NewUserPayload): Observable<User> {
    return this.api
      .create(payload)
      .pipe(tap((user) => this._users.update((list) => [...list, user])));
  }

  update(id: number, payload: UserPayload): Observable<User> {
    return this.api
      .update(id, payload)
      .pipe(tap((user) => this._users.update((list) => list.map((u) => (u.id === id ? user : u)))));
  }

  setPassword(id: number, password: string): Observable<null> {
    return this.api.setPassword(id, password);
  }

  transferOwner(userId: number, password: string): Observable<User[]> {
    return this.api.transferOwner(userId, password).pipe(tap((users) => this._users.set(users)));
  }

  remove(id: number): Observable<void> {
    return this.api
      .remove(id)
      .pipe(tap(() => this._users.update((list) => list.filter((u) => u.id !== id))));
  }
}
