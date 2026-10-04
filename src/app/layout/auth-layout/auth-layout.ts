import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Centered layout for pages shown before login. */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet],
  template: `<main><router-outlet /></main>`,
  styles: `
    main {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 16px;
      background: var(--mat-sys-surface-container);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayout {}
