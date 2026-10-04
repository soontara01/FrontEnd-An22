import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

export type StatTone = 'primary' | 'warn' | 'error';

/** Summary tile: icon + big value + label. Lay several out in a `.stat-grid`. */
@Component({
  selector: 'app-stat-card',
  imports: [MatCardModule, MatIconModule],
  template: `
    <mat-card appearance="outlined">
      <mat-card-content class="stat">
        <mat-icon [class]="tone()">{{ icon() }}</mat-icon>
        <div>
          <div class="value">{{ value() }}</div>
          <div class="label">{{ label() }}</div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .stat {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    mat-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
    }
    .primary {
      color: var(--mat-sys-primary);
    }
    .warn {
      color: var(--mat-sys-tertiary);
    }
    .error {
      color: var(--mat-sys-error);
    }
    .value {
      font: var(--mat-sys-headline-medium);
    }
    .label {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input('insights');
  readonly tone = input<StatTone>('primary');
}
