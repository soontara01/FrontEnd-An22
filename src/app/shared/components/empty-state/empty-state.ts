import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule],
  template: `
    <mat-icon>{{ icon() }}</mat-icon>
    <p>{{ message() }}</p>
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 16px;
      color: var(--mat-sys-on-surface-variant);
    }
    mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly icon = input('inbox');
  readonly message = input('ไม่มีข้อมูล');
}
