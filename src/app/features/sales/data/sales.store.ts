import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { Promotion, Sale, SaleStatus, StoreInfo } from '@core/models';
import { SalesApi } from './sales-api.service';

/**
 * Sales feature state (provided in sales.routes.ts). Bill lists are date-range queries owned by
 * the pages (rxResource); the store caches the lookups shared by the pages (receipt header,
 * promotion names) and wraps the write calls.
 */
@Injectable()
export class SalesStore {
  private readonly api = inject(SalesApi);

  private readonly _storeInfo = signal<StoreInfo | null>(null);
  private readonly _promotionNames = signal<ReadonlyMap<number, string>>(new Map());
  private lookupsLoaded = false;

  readonly storeInfo = this._storeInfo.asReadonly();
  readonly promotionNames = this._promotionNames.asReadonly();

  list(from: string | null, to: string | null): Observable<Sale[]> {
    return this.api.list(from, to);
  }

  get(id: number): Observable<Sale> {
    return this.api.get(id);
  }

  /** Receipt header + promotion names, loaded once per page load. */
  loadLookups(): void {
    if (this.lookupsLoaded) return;
    this.lookupsLoaded = true;
    this.api.storeInfo().subscribe((info) => this._storeInfo.set(info));
    this.api
      .promotions()
      .subscribe((list: Promotion[]) =>
        this._promotionNames.set(new Map(list.map((p) => [p.id, `${p.code} ${p.name}`]))),
      );
  }

  void(id: number, reason: string): Observable<Sale> {
    return this.api.void(id, reason);
  }

  /** Orders from before the POS only (pending → paid / cancelled). */
  setStatus(id: number, status: SaleStatus): Observable<Sale> {
    return this.api.setStatus(id, status);
  }
}
