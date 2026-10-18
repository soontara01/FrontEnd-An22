import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { StorageService } from './storage.service';

/** Per company: `pos.terminal.<companyId>` (E42) — another company on the same device has its own. */
const TERMINAL_KEY = 'pos.terminal';

/**
 * The POS terminal (cash drawer) this device is, kept in localStorage per company; sent with every
 * request as `X-Terminal-Id` so the server knows the drawer, shift and POS ID of a sale
 * (docs/terminal-plan.md). Set once by an admin in Settings → "เครื่องนี้" from the terminal
 * registry; null = not set (or nobody logged in), the device cannot sell or open a shift.
 */
@Injectable({ providedIn: 'root' })
export class TerminalService {
  private readonly storage = inject(StorageService);
  private readonly auth = inject(AuthService);
  /** Bumped on `set()` / `clear()` so `terminalId` re-reads storage. */
  private readonly version = signal(0);

  private readonly key = computed(() => {
    const companyId = this.auth.company()?.id;
    return companyId == null ? null : `${TERMINAL_KEY}.${companyId}`;
  });

  readonly terminalId = computed(() => {
    this.version();
    const key = this.key();
    return key === null ? null : validId(this.read(key));
  });

  /** Ignores anything but a positive whole number, and needs a logged-in company. */
  set(id: number): void {
    const valid = validId(id);
    const key = this.key();
    if (valid === null || key === null) return;
    this.storage.set(key, valid);
    this.version.update((v) => v + 1);
  }

  clear(): void {
    const key = this.key();
    if (key === null) return;
    this.storage.remove(key);
    this.version.update((v) => v + 1);
  }

  /** The device-wide `pos.terminal` of before E42 moves into the first company read after login, once. */
  private read(key: string): unknown {
    const legacy = this.storage.get<number>(TERMINAL_KEY);
    if (legacy === null) return this.storage.get<number>(key);
    this.storage.remove(TERMINAL_KEY);
    const current = this.storage.get<number>(key);
    if (current !== null) return current;
    this.storage.set(key, legacy);
    return legacy;
  }
}

function validId(id: unknown): number | null {
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}
