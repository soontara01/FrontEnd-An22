import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CashMovementPayload, CashMovementType, cashMovementError } from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';

/**
 * Cash put into / taken out of the drawer during a shift (not a sale). Whether the drawer holds
 * enough cash is checked by the server (`cashMovementError()` with the expected cash).
 */
@Component({
  selector: 'app-cash-movement-dialog',
  imports: [MatDialogModule, MatButtonToggleModule, AutofocusDirective, MATERIAL],
  templateUrl: './cash-movement-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .kind {
      margin: 4px 0 16px;
    }
    .quick {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .problem {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class CashMovementDialog {
  private readonly dialogRef =
    inject<MatDialogRef<CashMovementDialog, CashMovementPayload>>(MatDialogRef);

  protected readonly quickReasons: Record<CashMovementType, string[]> = {
    in: ['เติมเงินทอน'],
    out: ['นำเงินเข้าตู้เซฟ', 'จ่ายค่าส่งของ'],
  };
  protected readonly type = signal<CashMovementType>('out');
  protected readonly amount = signal(0);
  protected readonly reason = signal('');

  private readonly payload = computed<CashMovementPayload>(() => ({
    type: this.type(),
    amount: Number(this.amount()) || 0,
    reason: this.reason().trim(),
  }));
  protected readonly problem = computed(() => cashMovementError(this.payload(), Infinity));

  protected save(): void {
    if (this.problem()) return;
    this.dialogRef.close(this.payload());
  }
}
