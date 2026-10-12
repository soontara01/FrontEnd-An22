import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import {
  DenominationCount,
  ShiftOpenPayload,
  THAI_DENOMINATIONS,
  denominationTotal,
  openShiftError,
} from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';

export interface OpenShiftDialogData {
  terminalId: number;
  /** Float the last shift of this terminal left in the drawer */
  defaultFloat: number;
}

/**
 * Opens a POS shift: terminal number + opening float, optionally counted per banknote / coin
 * (the count then sets the float). Duplicate shifts are checked by the server (`openShiftError()`).
 */
@Component({
  selector: 'app-open-shift-dialog',
  imports: [DecimalPipe, MatDialogModule, AutofocusDirective, MATERIAL],
  templateUrl: './open-shift-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .row {
      display: grid;
      grid-template-columns: 140px minmax(0, 1fr);
      gap: 12px;
    }
    .notes {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 0 12px;
      margin-top: 8px;
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

  protected readonly denominations = THAI_DENOMINATIONS;
  protected readonly terminalId = signal(this.data.terminalId);
  protected readonly float = signal(this.data.defaultFloat);
  protected readonly counting = signal(false);
  /** Quantity per banknote / coin value */
  protected readonly qty = signal<Record<number, number>>({});

  private readonly counted = computed<DenominationCount[]>(() =>
    Object.entries(this.qty())
      .map(([value, qty]) => ({ value: Number(value), qty }))
      .filter((c) => c.qty > 0)
      .sort((a, b) => b.value - a.value),
  );
  protected readonly countTotal = computed(() => denominationTotal(this.counted()));

  private readonly payload = computed<ShiftOpenPayload>(() => {
    const counted = this.counting() ? this.counted() : [];
    return {
      terminalId: Number(this.terminalId()),
      openingFloat: counted.length ? this.countTotal() : Number(this.float()),
      openingDenominations: counted,
    };
  });
  protected readonly openingFloat = computed(() => this.payload().openingFloat);
  protected readonly problem = computed(() =>
    openShiftError(this.payload(), { terminalHasOpenShift: false, userHasOpenShift: false }),
  );

  protected setQty(value: number, raw: string): void {
    const qty = Math.max(0, Math.floor(Number(raw) || 0));
    this.qty.update((all) => ({ ...all, [value]: qty }));
  }

  protected qtyOf(value: number): number {
    return this.qty()[value] ?? 0;
  }

  protected save(): void {
    if (this.problem()) return;
    this.dialogRef.close(this.payload());
  }
}
