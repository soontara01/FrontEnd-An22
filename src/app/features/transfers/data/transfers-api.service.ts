import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import {
  Branch,
  BranchScope,
  Product,
  SerialNumber,
  Transfer,
  TransferPayload,
  TransferReceivePayload,
} from '@core/models';

/** Which side of a transfer a list shows: received by the branch, sent by it, or both. */
export type TransferDirection = 'in' | 'out' | 'all';

/** HTTP calls for the transfers feature (provided in transfers.routes.ts). */
@Injectable()
export class TransfersApi {
  private readonly api = inject(ApiService);

  /** Transfers of a branch (none = the working one, E23), newest first. */
  list(direction: TransferDirection, branch?: BranchScope): Observable<Transfer[]> {
    const params: Record<string, string> = {};
    if (direction !== 'all') params['direction'] = direction;
    if (branch !== undefined) params['branchId'] = String(branch);
    return this.api.get<Transfer[]>('transfers', params);
  }

  get(id: number): Observable<Transfer> {
    return this.api.get<Transfer>(`transfers/${id}`);
  }

  /** At the source branch (`X-Branch-Id`). */
  create(payload: TransferPayload): Observable<Transfer> {
    return this.api.post<Transfer>('transfers', payload);
  }

  /** At the destination branch. */
  receive(id: number, payload: TransferReceivePayload): Observable<Transfer> {
    return this.api.post<Transfer>(`transfers/${id}/receive`, payload);
  }

  /** At the source branch, admins only. */
  cancel(id: number, reason: string): Observable<Transfer> {
    return this.api.post<Transfer>(`transfers/${id}/cancel`, { reason });
  }

  /** SKUs with the working branch's stock (what can be sent from here). */
  products(): Observable<Product[]> {
    return this.api.get<Product[]>('products');
  }

  /** Serials of a SKU at the working branch. */
  serials(productId: number): Observable<SerialNumber[]> {
    return this.api.get<SerialNumber[]>(`products/${productId}/serials`);
  }

  branches(): Observable<Branch[]> {
    return this.api.get<Branch[]>('branches');
  }
}
