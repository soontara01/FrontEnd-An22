import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';

const TERMINAL_KEY = 'pos.terminal';

/**
 * Number of this device's POS terminal (cash drawer), kept in localStorage; sent with every
 * request as `X-Terminal-Id` so the server knows which shift a sale, void or refund belongs to.
 */
@Injectable({ providedIn: 'root' })
export class TerminalService {
  private readonly storage = inject(StorageService);
  private readonly _terminalId = signal(validId(this.storage.get<number>(TERMINAL_KEY)) ?? 1);

  readonly terminalId = this._terminalId.asReadonly();

  /** Ignores anything but a positive whole number. */
  set(id: number): void {
    const valid = validId(id);
    if (valid === null) return;
    this._terminalId.set(valid);
    this.storage.set(TERMINAL_KEY, valid);
  }
}

function validId(id: unknown): number | null {
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}
