import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, tap } from 'rxjs';
import { Category, CategoryPayload, buildTree, isLeaf } from '@core/models';
import { MasterDataApi } from './master-data-api.service';

/** Signals-based state for the category tree (provided in master-data.routes.ts). */
@Injectable()
export class CategoryStore {
  private readonly api = inject(MasterDataApi);

  private readonly _categories = signal<Category[]>([]);
  private readonly _loading = signal(false);
  private loaded = false;

  readonly categories = this._categories.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly tree = computed(() => buildTree(this._categories()));

  readonly departmentCount = computed(() => this._categories().filter((c) => c.level === 1).length);
  readonly leafCount = computed(
    () => this._categories().filter((c) => isLeaf(this._categories(), c.id)).length,
  );
  readonly inactiveCount = computed(() => this._categories().filter((c) => !c.active).length);

  /** Loads once; pass `force` to refresh (e.g. to update SKU counts). */
  load(force = false): void {
    if (this.loaded && !force) return;
    this._loading.set(true);
    this.api
      .categories()
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe((categories) => {
        this._categories.set(categories);
        this.loaded = true;
      });
  }

  isLeaf(id: number): boolean {
    return isLeaf(this._categories(), id);
  }

  isDuplicateCode(code: string, exceptId?: number): boolean {
    return this._categories().some((c) => c.id !== exceptId && c.code === code);
  }

  create(payload: CategoryPayload): Observable<Category> {
    return this.api
      .createCategory(payload)
      .pipe(tap((c) => this._categories.update((list) => [...list, c])));
  }

  update(id: number, payload: CategoryPayload): Observable<Category> {
    return this.api
      .updateCategory(id, payload)
      .pipe(tap((c) => this._categories.update((list) => list.map((x) => (x.id === id ? c : x)))));
  }

  remove(id: number): Observable<void> {
    return this.api
      .removeCategory(id)
      .pipe(tap(() => this._categories.update((list) => list.filter((c) => c.id !== id))));
  }
}
