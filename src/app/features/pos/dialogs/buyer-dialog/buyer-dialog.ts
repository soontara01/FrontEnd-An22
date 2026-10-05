import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { debounceTime, distinctUntilChanged, filter, map, switchMap } from 'rxjs';
import {
  EMPTY_BUYER,
  TaxInvoiceBuyer,
  buyerError,
  defaultBuyerBranch,
  isValidThaiTaxId,
  normalizeBuyer,
} from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { PosStore } from '../../data/pos.store';

/**
 * Buyer details for a full tax invoice issued together with the sale. A known tax ID fills the
 * rest from the last invoice. Closes with the (normalized) buyer, or nothing when cancelled.
 */
@Component({
  selector: 'app-buyer-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonToggleModule,
    AutofocusDirective,
    MATERIAL,
  ],
  templateUrl: './buyer-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 0 16px;
    }
    mat-button-toggle-group {
      margin: 4px 0 20px;
    }
    .branch-no {
      flex: 0 1 140px;
    }
    .problem {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
    .found {
      color: var(--mat-sys-primary);
      font: var(--mat-sys-body-small);
      margin: -8px 0 8px;
    }
  `,
})
export class BuyerDialog {
  private readonly store = inject(PosStore);
  private readonly dialogRef = inject<MatDialogRef<BuyerDialog, TaxInvoiceBuyer>>(MatDialogRef);
  private readonly initial = inject<TaxInvoiceBuyer | null>(MAT_DIALOG_DATA) ?? EMPTY_BUYER;

  protected readonly form = inject(NonNullableFormBuilder).group({ ...this.initial });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  protected readonly buyer = computed(() =>
    normalizeBuyer({ ...EMPTY_BUYER, ...this.value() } as TaxInvoiceBuyer),
  );
  protected readonly problem = computed(() => buyerError(this.buyer()));

  /** Set when the details came from an earlier invoice. */
  protected readonly found = toSignal(
    this.form.controls.taxId.valueChanges.pipe(
      map((id) => id.replace(/[\s-]/g, '')),
      debounceTime(300),
      distinctUntilChanged(),
      filter((id) => isValidThaiTaxId(id)),
      switchMap((id) => this.store.buyerByTaxId(id)),
      filter((found): found is TaxInvoiceBuyer => !!found && !this.form.controls.name.value.trim()),
      map((found) => {
        this.form.patchValue({ ...found, taxId: this.form.controls.taxId.value });
        return true;
      }),
    ),
    { initialValue: false },
  );

  constructor() {
    // New buyer: suggest head office for a company tax ID, none for a national ID, until the
    // cashier picks one.
    if (this.initial === EMPTY_BUYER) {
      const branch = this.form.controls.branchType;
      this.form.controls.taxId.valueChanges
        .pipe(takeUntilDestroyed())
        .subscribe((id) => branch.dirty || branch.setValue(defaultBuyerBranch(id)));
    }
  }

  protected save(): void {
    if (!this.problem()) this.dialogRef.close(this.buyer());
  }
}
