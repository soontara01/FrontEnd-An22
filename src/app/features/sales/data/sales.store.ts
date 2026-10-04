import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, tap } from 'rxjs';
import { Sale, SaleStatus } from '@core/models';
import { SalesApi } from './sales-api.service';

/** Signals-based state for the sales feature (provided in sales.routes.ts). */
@Injectable()
export class SalesStore {
  private readonly api = inject(SalesApi);

  private readonly _sales = signal<Sale[]>([]);
  private readonly _loading = signal(false);
  private loaded = false;

  readonly sales = this._sales.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly orderCount = computed(() => this._sales().length);
  /** Revenue counts paid orders only. */
  readonly revenue = computed(() =>
    this._sales()
      .filter((s) => s.status === 'paid')
      .reduce((sum, s) => sum + s.total, 0),
  );
  readonly pendingCount = computed(
    () => this._sales().filter((s) => s.status === 'pending').length,
  );
  readonly averageOrder = computed(() => {
    const paid = this._sales().filter((s) => s.status === 'paid');
    return paid.length ? this.revenue() / paid.length : 0;
  });

  /** Loads the list once; pass `force` to refresh from the server. */
  load(force = false): void {
    if (this.loaded && !force) return;
    this._loading.set(true);
    this.api
      .list()
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe((sales) => {
        this._sales.set(sales);
        this.loaded = true;
      });
  }

  setStatus(id: number, status: SaleStatus): Observable<Sale> {
    return this.api
      .setStatus(id, status)
      .pipe(tap((sale) => this._sales.update((list) => list.map((s) => (s.id === id ? sale : s)))));
  }
}
