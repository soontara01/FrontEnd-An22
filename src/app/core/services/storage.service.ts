import { Injectable } from '@angular/core';

/** Wrapper over localStorage with JSON (de)serialization and safe access. */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly prefix = 'an22.';

  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch {
      /* storage unavailable */
    }
  }
}
