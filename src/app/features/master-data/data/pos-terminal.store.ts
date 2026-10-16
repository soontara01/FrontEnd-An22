import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, forkJoin, tap } from 'rxjs';
import { PosTerminal, missingPosId } from '@core/models';
import { httpErrorShown } from '@core/http/http-error-shown';
import { MasterDataApi } from './master-data-api.service';

/** Signals-based state for the POS terminal registry (provided in master-data.routes.ts). */
@Injectable()
export class PosTerminalStore {
  private readonly api = inject(MasterDataApi);

  private readonly _terminals = signal<PosTerminal[]>([]);
  private readonly _vatRegistered = signal(false);
  private readonly _loading = signal(false);
  private loaded = false;

  /** By terminal number. */
  readonly terminals = computed(() => [...this._terminals()].sort((a, b) => a.id - b.id));
  readonly loading = this._loading.asReadonly();
  readonly vatRegistered = this._vatRegistered.asReadonly();

  readonly count = computed(() => this._terminals().length);
  readonly activeCount = computed(() => this._terminals().filter((t) => t.active).length);
  /** Active terminals of a VAT-registered store without a POS ID (their receipts lack it). */
  readonly missingPosIdCount = computed(
    () => this._terminals().filter((t) => missingPosId(t, this._vatRegistered())).length,
  );
  /** Smallest unused terminal number, the default for a new one. */
  readonly nextId = computed(() => {
    const used = new Set(this._terminals().map((t) => t.id));
    let id = 1;
    while (used.has(id)) id++;
    return id;
  });

  load(force = false): void {
    if (this.loaded && !force) return;
    this._loading.set(true);
    forkJoin([this.api.posTerminals(), this.api.storeInfo()])
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe({
        next: ([terminals, store]) => {
          this._terminals.set(terminals);
          this._vatRegistered.set(store.vatRegistered);
          this.loaded = true;
        },
        error: httpErrorShown,
      });
  }

  create(terminal: PosTerminal): Observable<PosTerminal> {
    return this.api
      .createPosTerminal(terminal)
      .pipe(tap((t) => this._terminals.update((list) => [...list, t])));
  }

  update(terminal: PosTerminal): Observable<PosTerminal> {
    return this.api
      .updatePosTerminal(terminal)
      .pipe(tap((t) => this._terminals.update((list) => list.map((x) => (x.id === t.id ? t : x)))));
  }

  remove(id: number): Observable<void> {
    return this.api
      .removePosTerminal(id)
      .pipe(tap(() => this._terminals.update((list) => list.filter((t) => t.id !== id))));
  }
}
