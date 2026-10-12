import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';

const TERMINAL_KEY = 'pos.terminal';

/**
 * The POS terminal (cash drawer) this device is, kept in localStorage; sent with every request as
 * `X-Terminal-Id` so the server knows the drawer, shift and POS ID of a sale (docs/terminal-plan.md).
 * Set once by an admin in Settings → "เครื่องนี้" from the terminal registry; null = not set, the
 * device cannot sell or open a shift.
 */
@Injectable({ providedIn: 'root' })
export class TerminalService {
  private readonly storage = inject(StorageService);
  private readonly _terminalId = signal(validId(this.storage.get<number>(TERMINAL_KEY)));

  readonly terminalId = this._terminalId.asReadonly();

  /** Ignores anything but a positive whole number. */
  set(id: number): void {
    const valid = validId(id);
    if (valid === null) return;
    this._terminalId.set(valid);
    this.storage.set(TERMINAL_KEY, valid);
  }

  clear(): void {
    this._terminalId.set(null);
    this.storage.remove(TERMINAL_KEY);
  }
}

function validId(id: unknown): number | null {
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}
