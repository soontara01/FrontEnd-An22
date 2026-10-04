import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import {
  Product,
  SerialNumber,
  SerialReceiveResult,
  SerialRemoveStatus,
  StockMovement,
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

  /** Stock card (inventory ledger) of one SKU, oldest first. */
  movements(productId: number): Observable<StockMovement[]> {
    return this.api.get<StockMovement[]>(`products/${productId}/movements`);
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
