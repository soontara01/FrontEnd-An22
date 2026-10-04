import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Product, effectiveCost, mainSupplier, movingAverage } from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { InventoryStore } from '../../data/inventory.store';

/**
 * Receive stock of a non-serial SKU with its purchase cost (moving weighted average).
 * Quantity/cost may be entered per pack; the server always gets base units.
 * Closes with the updated Product.
 */
@Component({
  selector: 'app-stock-receive-dialog',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatDialogModule,
    AutofocusDirective,
    MATERIAL,
  ],
  templateUrl: './stock-receive-dialog.html',
  styleUrl: '../serial-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockReceiveDialog {
  protected readonly product = inject<Product>(MAT_DIALOG_DATA);
  private readonly store = inject(InventoryStore);
  private readonly dialogRef = inject<MatDialogRef<StockReceiveDialog, Product>>(MatDialogRef);

  /** Default cost per base unit: main supplier's price, else the current/standard cost. */
  private readonly baseDefaultCost =
    mainSupplier(this.product)?.cost ?? effectiveCost(this.product);

  protected readonly saving = signal(false);
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
    unitCost: [this.baseDefaultCost, [Validators.required, Validators.min(0)]],
    note: [''],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  private readonly factor = computed(
    () => this.units.find((u) => u.name === (this.value().unit ?? ''))?.factor ?? 1,
  );
  protected readonly unitLabel = computed(() => this.value().unit || this.product.unit);
  protected readonly baseQty = computed(() => (this.value().qty ?? 0) * this.factor());
  protected readonly baseCost = computed(() => (this.value().unitCost ?? 0) / this.factor());
  protected readonly total = computed(() => (this.value().qty ?? 0) * (this.value().unitCost ?? 0));
  protected readonly newAvg = computed(() =>
    movingAverage(this.product.stock, this.product.avgCost, this.baseQty(), this.baseCost()),
  );

  constructor() {
    // Switching unit re-prices the default cost for that unit.
    this.form.controls.unit.valueChanges.subscribe((name) => {
      const factor = this.units.find((u) => u.name === name)?.factor ?? 1;
      this.form.controls.unitCost.setValue(Math.round(this.baseDefaultCost * factor * 100) / 100);
    });
  }

  protected save(): void {
    if (this.form.invalid || this.baseQty() <= 0) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.store
      .adjustStock(
        this.product.id,
        this.baseQty(),
        this.baseCost(),
        this.form.controls.note.value.trim(),
      )
      .subscribe({
        next: (product) => this.dialogRef.close(product),
        error: () => this.saving.set(false),
      });
  }
}
