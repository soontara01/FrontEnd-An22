import { Injectable, computed, inject, signal } from '@angular/core';
import { EMPTY, Observable, finalize, tap } from 'rxjs';
import { PaymentMethod, PaymentMethodPayload, isLastActiveCash } from '@core/models';
import { MasterDataApi } from './master-data-api.service';

/** Signals-based state for payment methods (provided in master-data.routes.ts). */
@Injectable()
export class PaymentMethodStore {
  private readonly api = inject(MasterDataApi);

  private readonly _methods = signal<PaymentMethod[]>([]);
  private readonly _loading = signal(false);
  private loaded = false;

  /** In POS button order. */
  readonly methods = computed(() => [...this._methods()].sort((a, b) => a.sortOrder - b.sortOrder));
  readonly loading = this._loading.asReadonly();

  readonly count = computed(() => this._methods().length);
  readonly activeCount = computed(() => this._methods().filter((m) => m.active).length);
  readonly withFeeCount = computed(
    () => this._methods().filter((m) => m.active && m.feePercent > 0).length,
  );
  /** Active methods = the buttons the POS will show, in order. */
  readonly posButtons = computed(() => this.methods().filter((m) => m.active));

  load(force = false): void {
    if (this.loaded && !force) return;
    this._loading.set(true);
    this.api
      .paymentMethods()
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe((methods) => {
        this._methods.set(methods);
        this.loaded = true;
      });
  }

  /** The only active cash method cannot be switched off, retyped or deleted. */
  isLastActiveCash(id: number): boolean {
    return isLastActiveCash(this._methods(), id);
  }

  create(payload: PaymentMethodPayload): Observable<PaymentMethod> {
    return this.api
      .createPaymentMethod(payload)
      .pipe(tap((m) => this._methods.update((list) => [...list, m])));
  }

  update(id: number, payload: PaymentMethodPayload): Observable<PaymentMethod> {
    return this.api
      .updatePaymentMethod(id, payload)
      .pipe(tap((m) => this._methods.update((list) => list.map((x) => (x.id === id ? m : x)))));
  }

  /** Moves a method one place up (-1) or down (+1) in the POS order. */
  move(id: number, direction: -1 | 1): Observable<PaymentMethod[]> {
    const ids = this.methods().map((m) => m.id);
    const from = ids.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return EMPTY;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    return this.api.reorderPaymentMethods(ids).pipe(tap((list) => this._methods.set(list)));
  }

  remove(id: number): Observable<void> {
    return this.api
      .removePaymentMethod(id)
      .pipe(tap(() => this._methods.update((list) => list.filter((m) => m.id !== id))));
  }
}
