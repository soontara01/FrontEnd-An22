import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import {
  CashMovement,
  CashMovementPayload,
  CashMovementType,
  cashMovementError,
} from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { PosStore } from '../../data/pos.store';

export interface CashMovementDialogData {
  shiftId: number;
}

/**
 * Cash put into / taken out of the drawer during a shift (not a sale). Whether the drawer holds
 * enough cash is checked by the server (`cashMovementError()` with the expected cash); the dialog
 * saves itself and stays open with the typed values when the server refuses. Closes with the
 * saved `CashMovement`. Open it with the POS page's injector (`PosStore`).
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
  private readonly data = inject<CashMovementDialogData>(MAT_DIALOG_DATA);
  private readonly store = inject(PosStore);
  private readonly dialogRef = inject<MatDialogRef<CashMovementDialog, CashMovement>>(MatDialogRef);

  protected readonly quickReasons: Record<CashMovementType, string[]> = {
    in: ['เติมเงินทอน'],
    out: ['นำเงินเข้าตู้เซฟ', 'จ่ายค่าส่งของ'],
  };
  protected readonly type = signal<CashMovementType>('out');
  protected readonly amount = signal(0);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  /** Why the server refused the last save; cleared as soon as anything is changed. */
  protected readonly serverError = signal('');

  private readonly payload = computed<CashMovementPayload>(() => ({
    type: this.type(),
    amount: Number(this.amount()) || 0,
    reason: this.reason().trim(),
  }));
  protected readonly problem = computed(() =>
    cashMovementError(this.payload(), Infinity, this.store.isAdmin()),
  );

  protected setType(type: CashMovementType): void {
    this.type.set(type);
    this.serverError.set('');
  }

  protected setAmount(value: string): void {
    this.amount.set(Number(value) || 0);
    this.serverError.set('');
  }

  protected setReason(value: string): void {
    this.reason.set(value);
    this.serverError.set('');
  }

  protected save(): void {
    if (this.problem() || this.saving()) return;
    this.saving.set(true);
    this.store.addCashMovement(this.data.shiftId, this.payload()).subscribe({
      next: (movement) => this.dialogRef.close(movement),
      error: (err: unknown) => {
        this.saving.set(false);
        const message = err instanceof HttpErrorResponse ? err.error?.message : null;
        this.serverError.set(message ?? 'บันทึกไม่สำเร็จ');
      },
    });
  }
}
