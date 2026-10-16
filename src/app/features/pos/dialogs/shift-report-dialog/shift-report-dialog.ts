import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { forkJoin } from 'rxjs';
import { CashMovement, DrawerOpen, Shift, ShiftSummary } from '@core/models';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { MATERIAL } from '@shared/material';
import { httpErrorShown } from '@core/http/http-error-shown';
import { PosStore } from '../../data/pos.store';

/**
 * X report of the open shift (read only). The server leaves out the expected amount per method
 * for non-admins while the shift is open, so the cashier's count at close stays blind (S2).
 * Open it with the page's injector (route-scoped `PosStore`).
 */
@Component({
  selector: 'app-shift-report-dialog',
  imports: [DecimalPipe, MatDialogModule, LoadingSpinner, MATERIAL],
  templateUrl: './shift-report-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 16px;
    }
    .total {
      font-weight: 600;
      border-top: 1px solid var(--mat-sys-outline-variant);
      padding-top: 4px;
    }
    h3 {
      font: var(--mat-sys-title-small);
      margin: 16px 0 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      padding: 4px 8px;
      text-align: left;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .num {
      text-align: right;
    }
  `,
})
export class ShiftReportDialog {
  protected readonly shift = inject<Shift>(MAT_DIALOG_DATA);
  protected readonly store = inject(PosStore);

  protected readonly summary = signal<ShiftSummary | null>(null);
  protected readonly movements = signal<CashMovement[]>([]);
  protected readonly drawerOpens = signal<DrawerOpen[]>([]);

  constructor() {
    forkJoin({
      summary: this.store.shiftSummary(this.shift.id),
      movements: this.store.cashMovements(this.shift.id),
      drawerOpens: this.store.drawerOpens(this.shift.id),
    }).subscribe({
      next: ({ summary, movements, drawerOpens }) => {
        this.summary.set(summary);
        this.movements.set(movements);
        this.drawerOpens.set(drawerOpens);
      },
      error: httpErrorShown,
    });
  }

  /** 'HH:mm' (no DatePipe: keeps locale formatting out of the initial bundle). */
  protected time(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
