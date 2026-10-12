import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import {
  DenominationCount,
  ShiftOpenPayload,
  denominationTotal,
  openShiftError,
} from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { DenominationCounter } from '../../components/denomination-counter/denomination-counter';

export interface OpenShiftDialogData {
  /** This device's terminal (from `TerminalService`, never typed by the cashier) */
  terminalId: number;
  /** e.g. 'เครื่อง 2 · แคชเชียร์หน้าร้าน' */
  terminalLabel: string;
  /** Float the last shift of this terminal left in the drawer */
  defaultFloat: number;
}

/**
 * Opens a POS shift at this device's terminal: opening float, optionally counted per banknote / coin
 * (the count then sets the float). Duplicate shifts are checked by the server (`openShiftError()`).
 */
@Component({
  selector: 'app-open-shift-dialog',
  imports: [MatDialogModule, AutofocusDirective, DenominationCounter, MATERIAL],
  templateUrl: './open-shift-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }
    .terminal {
      font: var(--mat-sys-title-small);
    }
    .problem {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class OpenShiftDialog {
  protected readonly data = inject<OpenShiftDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<OpenShiftDialog, ShiftOpenPayload>>(MatDialogRef);

  protected readonly float = signal(this.data.defaultFloat);
  protected readonly counting = signal(false);
  /** Quantity per banknote / coin (when counting) */
  protected readonly counted = signal<DenominationCount[]>([]);
  protected readonly countTotal = computed(() => denominationTotal(this.counted()));

  private readonly payload = computed<ShiftOpenPayload>(() => {
    const counted = this.counting() ? this.counted() : [];
    return {
      terminalId: this.data.terminalId,
      openingFloat: counted.length ? this.countTotal() : Number(this.float()),
      openingDenominations: counted,
    };
  });
  protected readonly openingFloat = computed(() => this.payload().openingFloat);
  protected readonly problem = computed(() =>
    openShiftError(this.payload(), { terminalHasOpenShift: false, userHasOpenShift: false }),
  );

  protected save(): void {
    if (this.problem()) return;
    this.dialogRef.close(this.payload());
  }
}
