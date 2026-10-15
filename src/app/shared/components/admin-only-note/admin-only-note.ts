import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Shown to non-admins on screens they may only view (permission table, `saas-plan.md` section 17).
 * The server rejects their writes with 403 anyway; this just says why the buttons are missing.
 */
@Component({
  selector: 'app-admin-only-note',
  imports: [MatIconModule],
  template: `
    <mat-icon inline>lock</mat-icon>
    <span>{{ message() }}</span>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0 0 12px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOnlyNote {
  readonly message = input('เฉพาะผู้ดูแลระบบ (admin) แก้ไขได้ — ดูได้อย่างเดียว');
}
