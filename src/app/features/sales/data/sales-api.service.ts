import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import { Promotion, Sale, SaleStatus, StoreInfo } from '@core/models';

/** HTTP calls for the sales feature (provided in sales.routes.ts). */
@Injectable()
export class SalesApi {
  private readonly api = inject(ApiService);

  /** Bills sold within a local-date range (null = open end), newest first. */
  list(from: string | null, to: string | null): Observable<Sale[]> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.api.get<Sale[]>('sales', params);
  }

  get(id: number): Observable<Sale> {
    return this.api.get<Sale>(`sales/${id}`);
  }

  void(id: number, reason: string): Observable<Sale> {
    return this.api.post<Sale>(`sales/${id}/void`, { reason });
  }

  setStatus(id: number, status: SaleStatus): Observable<Sale> {
    return this.api.put<Sale>(`sales/${id}/status`, { status });
  }

  storeInfo(): Observable<StoreInfo> {
    return this.api.get<StoreInfo>('settings/store');
  }

  promotions(): Observable<Promotion[]> {
    return this.api.get<Promotion[]>('promotions');
  }
}
