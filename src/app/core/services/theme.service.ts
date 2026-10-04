import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storage = inject(StorageService);
  private readonly document = inject(DOCUMENT);

  readonly theme = signal<Theme>(this.storage.get<Theme>('theme') ?? 'light');

  constructor() {
    effect(() => {
      const theme = this.theme();
      this.document.documentElement.classList.toggle('dark-theme', theme === 'dark');
      this.storage.set('theme', theme);
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }
}
