import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, tap } from 'rxjs';
import { Supplier, SupplierPayload } from '@core/models';
import { MasterDataApi } from './master-data-api.service';

/** Signals-based state for suppliers (provided in master-data.routes.ts). */
@Injectable()
export class SupplierStore {
  private readonly api = inject(MasterDataApi);

  private readonly _suppliers = signal<Supplier[]>([]);
  private readonly _loading = signal(false);
  private loaded = false;

  readonly suppliers = this._suppliers.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly count = computed(() => this._suppliers().length);
  readonly activeCount = computed(() => this._suppliers().filter((s) => s.active).length);
  readonly creditCount = computed(() => this._suppliers().filter((s) => s.creditDays > 0).length);
  readonly linkedSkuCount = computed(() =>
    this._suppliers().reduce((sum, s) => sum + s.productCount, 0),
  );

  /** Loads once; pass `force` to refresh (e.g. to update SKU counts). */
  load(force = false): void {
    if (this.loaded && !force) return;
    this._loading.set(true);
    this.api
      .suppliers()
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe((suppliers) => {
        this._suppliers.set(suppliers);
        this.loaded = true;
      });
  }

  getById(id: number): Observable<Supplier> {
    return this.api.supplier(id);
  }

  isDuplicateCode(code: string, exceptId?: number): boolean {
    return this._suppliers().some((s) => s.id !== exceptId && s.code === code);
  }

  create(payload: SupplierPayload): Observable<Supplier> {
    return this.api
      .createSupplier(payload)
      .pipe(tap((s) => this._suppliers.update((list) => [...list, s])));
  }

  update(id: number, payload: SupplierPayload): Observable<Supplier> {
    return this.api
      .updateSupplier(id, payload)
      .pipe(tap((s) => this._suppliers.update((list) => list.map((x) => (x.id === id ? s : x)))));
  }

  remove(id: number): Observable<void> {
    return this.api
      .removeSupplier(id)
      .pipe(tap(() => this._suppliers.update((list) => list.filter((s) => s.id !== id))));
  }
}
