import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Branch,
  BranchScope,
  Product,
  SerialNumber,
  Transfer,
  TransferPayload,
  TransferReceivePayload,
} from '@core/models';
import { TransferDirection, TransfersApi } from './transfers-api.service';

/**
 * Transfers feature state (provided in transfers.routes.ts): the company's branches (names on every
 * page, loaded once per page load) and the calls of the pages.
 */
@Injectable()
export class TransfersStore {
  private readonly api = inject(TransfersApi);
  private readonly _branches = signal<Branch[]>([]);
  private branchesLoaded = false;

  /** Every branch of the company, closed ones too (older transfers name them) */
  readonly branches = this._branches.asReadonly();

  loadBranches(): void {
    if (this.branchesLoaded) return;
    this.branchesLoaded = true;
    this.api.branches().subscribe({
      next: (list) => this._branches.set(list),
      // Tried again on the next page that needs it (the snackbar is already shown).
      error: () => (this.branchesLoaded = false),
    });
  }

  /** 'BN สาขาบางนา'; the id when the branch is unknown. */
  branchName(id: number): string {
    const b = this._branches().find((x) => x.id === id);
    return b ? `${b.code} ${b.name}` : `#${id}`;
  }

  list(direction: TransferDirection, branch?: BranchScope): Observable<Transfer[]> {
    return this.api.list(direction, branch);
  }

  get(id: number): Observable<Transfer> {
    return this.api.get(id);
  }

  create(payload: TransferPayload): Observable<Transfer> {
    return this.api.create(payload);
  }

  receive(id: number, payload: TransferReceivePayload): Observable<Transfer> {
    return this.api.receive(id, payload);
  }

  cancel(id: number, reason: string): Observable<Transfer> {
    return this.api.cancel(id, reason);
  }

  products(): Observable<Product[]> {
    return this.api.products();
  }

  serials(productId: number): Observable<SerialNumber[]> {
    return this.api.serials(productId);
  }
}
