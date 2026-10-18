import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, tap } from 'rxjs';
import { Branch, BranchPayload } from '@core/models';
import { httpErrorShown } from '@core/http/http-error-shown';
import { MasterDataApi } from './master-data-api.service';

/** Signals-based state for the branch list (provided in master-data.routes.ts). */
@Injectable()
export class BranchStore {
  private readonly api = inject(MasterDataApi);

  private readonly _branches = signal<Branch[]>([]);
  private readonly _loading = signal(false);
  private loaded = false;

  /** By code. */
  readonly branches = computed(() =>
    [...this._branches()].sort((a, b) => a.branchNo.localeCompare(b.branchNo)),
  );
  readonly loading = this._loading.asReadonly();
  readonly count = computed(() => this._branches().length);
  readonly activeCount = computed(() => this._branches().filter((b) => b.active).length);

  load(force = false): void {
    if (this.loaded && !force) return;
    this._loading.set(true);
    this.api
      .branches()
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe({
        next: (branches) => {
          this._branches.set(branches);
          this.loaded = true;
        },
        error: httpErrorShown,
      });
  }

  create(branch: BranchPayload): Observable<Branch> {
    return this.api
      .createBranch(branch)
      .pipe(tap((b) => this._branches.update((list) => [...list, b])));
  }

  update(id: number, branch: BranchPayload): Observable<Branch> {
    return this.api
      .updateBranch(id, branch)
      .pipe(tap((b) => this._branches.update((list) => list.map((x) => (x.id === id ? b : x)))));
  }
}
