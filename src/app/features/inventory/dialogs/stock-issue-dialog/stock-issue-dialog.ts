import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Product, SERIAL_STATUS_LABEL, SerialRemoveStatus } from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { InventoryStore } from '../../data/inventory.store';

/**
 * Issue (remove) stock of a non-serial SKU by quantity, at the current moving-average cost.
 * Quantity may be entered per pack; the server always gets base units.
 * Closes with the updated Product.
 */
@Component({
  selector: 'app-stock-issue-dialog',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatDialogModule,
    AutofocusDirective,
    MATERIAL,
  ],
  templateUrl: './stock-issue-dialog.html',
  styleUrl: '../serial-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockIssueDialog {
  protected readonly product = inject<Product>(MAT_DIALOG_DATA);
  private readonly store = inject(InventoryStore);
  private readonly dialogRef = inject<MatDialogRef<StockIssueDialog, Product>>(MatDialogRef);

  protected readonly saving = signal(false);
  protected readonly reasons: SerialRemoveStatus[] = ['sold', 'damaged', 'other'];
  protected readonly reasonLabel = SERIAL_STATUS_LABEL;
  protected readonly units = [
    { name: '', label: this.product.unit, factor: 1 },
    ...this.product.packUnits.map((p) => ({
      name: p.unit,
      label: `${p.unit} (×${p.factor})`,
      factor: p.factor,
    })),
  ];

  protected readonly form = inject(NonNullableFormBuilder).group({
    qty: [1, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
    unit: [''],
    reason: ['sold' as SerialRemoveStatus],
    note: [''],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  private readonly factor = computed(
    () => this.units.find((u) => u.name === (this.value().unit ?? ''))?.factor ?? 1,
  );
  protected readonly baseQty = computed(() => (this.value().qty ?? 0) * this.factor());
  protected readonly overStock = computed(() => this.baseQty() > this.product.stock);
  protected readonly remaining = computed(() => this.product.stock - this.baseQty());
  /** Issues go out at the current average cost (the average itself does not change). */
  protected readonly issueCost = computed(() => this.baseQty() * this.product.avgCost);
  protected readonly noteRequired = computed(() => this.value().reason === 'other');
  protected readonly canSave = computed(
    () =>
      !this.saving() &&
      this.baseQty() > 0 &&
      !this.overStock() &&
      (!this.noteRequired() || !!this.value().note?.trim()),
  );

  /** Issue everything in stock (in base units). */
  protected issueAll(): void {
    this.form.patchValue({ unit: '', qty: this.product.stock });
  }

  protected save(): void {
    if (this.form.invalid || !this.canSave()) {
      this.form.markAllAsTouched();
      return;
    }
    const { reason, note } = this.form.getRawValue();
    this.saving.set(true);
    this.store
      .adjustStock(
        this.product.id,
        -this.baseQty(),
        undefined,
        [this.reasonLabel[reason], note.trim()].filter(Boolean).join(' · '),
      )
      .subscribe({
        next: (product) => this.dialogRef.close(product),
        error: () => this.saving.set(false),
      });
  }
}
