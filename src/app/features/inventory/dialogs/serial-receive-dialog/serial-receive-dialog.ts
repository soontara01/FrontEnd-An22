import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Product, effectiveCost, mainSupplier } from '@core/models';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { InventoryStore } from '../../data/inventory.store';
import { parseSerialLines } from '../../data/serial-input';
import { serialFormatHint } from '../serial-format-hint';

/** Receives serial numbers into stock (1 line = 1 serial). Closes with the updated Product. */
@Component({
  selector: 'app-serial-receive-dialog',
  imports: [CurrencyPipe, MatDialogModule, LoadingSpinner, AutofocusDirective, MATERIAL],
  templateUrl: './serial-receive-dialog.html',
  styleUrl: '../serial-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SerialReceiveDialog {
  protected readonly product = inject<Product>(MAT_DIALOG_DATA);
  private readonly store = inject(InventoryStore);
  private readonly dialogRef = inject<MatDialogRef<SerialReceiveDialog, Product>>(MatDialogRef);

  protected readonly formatHint = serialFormatHint(this.product);
  protected readonly text = signal('');
  /** Cost per unit (excl. VAT) stored on every received serial — specific identification. */
  protected readonly unitCost = signal(
    mainSupplier(this.product)?.cost ?? effectiveCost(this.product),
  );
  protected readonly note = signal('');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  private readonly inStock = signal<ReadonlySet<string>>(new Set());

  protected readonly lines = computed(() =>
    parseSerialLines(this.text(), this.product, this.inStock()),
  );
  protected readonly errorCount = computed(() => this.lines().filter((l) => l.error).length);
  protected readonly validCount = computed(() => this.lines().length - this.errorCount());
  protected readonly costValid = computed(
    () => Number.isFinite(this.unitCost()) && this.unitCost() >= 0,
  );
  protected readonly total = computed(() => this.validCount() * this.unitCost());
  protected readonly canSave = computed(
    () =>
      this.costValid() &&
      !this.loading() &&
      !this.saving() &&
      this.validCount() > 0 &&
      this.errorCount() === 0,
  );

  constructor() {
    this.store.serials(this.product.id).subscribe({
      next: (serials) => {
        this.inStock.set(
          new Set(serials.filter((s) => s.status === 'in_stock').map((s) => s.serial)),
        );
        this.loading.set(false);
      },
      error: () => this.dialogRef.close(),
    });
  }

  protected save(): void {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.store
      .receiveSerials(
        this.product.id,
        this.lines().map((l) => l.serial),
        this.unitCost(),
        this.note().trim(),
      )
      .subscribe({
        next: (product) => this.dialogRef.close(product),
        error: () => this.saving.set(false),
      });
  }
}
