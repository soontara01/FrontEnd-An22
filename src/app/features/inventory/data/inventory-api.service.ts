import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import {
  Product,
  SerialNumber,
  SerialReceiveResult,
  SerialRemoveStatus,
  StockCardResult,
  Supplier,
} from '@core/models';

/** HTTP calls for the inventory feature (provided in inventory.routes.ts). */
@Injectable()
export class InventoryApi {
  private readonly api = inject(ApiService);

  list(): Observable<Product[]> {
    return this.api.get<Product[]>('products');
  }

  /** Supplier master (names / contact / credit for the reorder page). */
  suppliers(): Observable<Supplier[]> {
    return this.api.get<Supplier[]>('suppliers');
  }

  /**
   * Non-serial SKUs: `delta` > 0 receives at `unitCost` (re-averages the cost),
   * `delta` < 0 issues at the current average cost.
   */
  adjustStock(id: number, delta: number, unitCost?: number, note = ''): Observable<Product> {
    return this.api.put<Product>(`products/${id}/stock`, { delta, unitCost, note });
  }

  /** Stock card of one SKU for a local-date range (both optional, inclusive). */
  movements(productId: number, from?: string, to?: string): Observable<StockCardResult> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.api.get<StockCardResult>(`products/${productId}/movements`, params);
  }

  /** All serials of a serial-controlled SKU (in stock + removed history). */
  serials(productId: number): Observable<SerialNumber[]> {
    return this.api.get<SerialNumber[]>(`products/${productId}/serials`);
  }

  /** Every received serial carries `unitCost` (specific identification). */
  receiveSerials(
    productId: number,
    serials: string[],
    unitCost: number,
    note = '',
  ): Observable<SerialReceiveResult> {
    return this.api.post<SerialReceiveResult>(`products/${productId}/serials`, {
      serials,
      unitCost,
      note,
    });
  }

  removeSerials(
    productId: number,
    ids: number[],
    status: SerialRemoveStatus,
    note: string,
  ): Observable<Product> {
    return this.api.post<Product>(`products/${productId}/serials/remove`, { ids, status, note });
  }
}
