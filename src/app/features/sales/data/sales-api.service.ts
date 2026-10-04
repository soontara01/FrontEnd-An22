import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import { Sale, SaleStatus } from '@core/models';

/** HTTP calls for the sales feature (provided in sales.routes.ts). */
@Injectable()
export class SalesApi {
  private readonly api = inject(ApiService);

  list(): Observable<Sale[]> {
    return this.api.get<Sale[]>('sales');
  }

  setStatus(id: number, status: SaleStatus): Observable<Sale> {
    return this.api.put<Sale>(`sales/${id}/status`, { status });
  }
}
