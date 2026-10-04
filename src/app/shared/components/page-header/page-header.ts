import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Page title + optional subtitle, with a slot for action buttons on the right. */
@Component({
  selector: 'app-page-header',
  template: `
    <div class="header">
      <div>
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <p class="subtitle">{{ subtitle() }}</p>
        }
      </div>
      <div class="actions"><ng-content /></div>
    </div>
  `,
  styles: `
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }
    h1 {
      margin: 0;
      font: var(--mat-sys-headline-small);
    }
    .subtitle {
      margin: 4px 0 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .actions {
      display: flex;
      gap: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}
