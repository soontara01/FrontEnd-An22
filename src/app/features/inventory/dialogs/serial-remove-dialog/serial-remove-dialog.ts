import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatListModule, MatSelectionListChange } from '@angular/material/list';
import { Product, SERIAL_STATUS_LABEL, SerialNumber, SerialRemoveStatus } from '@core/models';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { InventoryStore } from '../../data/inventory.store';

/** Removes selected serials from stock with a reason (kept as history). Closes with the updated Product. */
@Component({
  selector: 'app-serial-remove-dialog',
  imports: [MatDialogModule, MatListModule, LoadingSpinner, AutofocusDirective, MATERIAL],
  templateUrl: './serial-remove-dialog.html',
  styleUrl: '../serial-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SerialRemoveDialog {
  protected readonly product = inject<Product>(MAT_DIALOG_DATA);
  private readonly store = inject(InventoryStore);
  private readonly dialogRef = inject<MatDialogRef<SerialRemoveDialog, Product>>(MatDialogRef);

  protected readonly reasons: SerialRemoveStatus[] = ['sold', 'damaged', 'other'];
  protected readonly reasonLabel = SERIAL_STATUS_LABEL;

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  private readonly inStock = signal<SerialNumber[]>([]);
  protected readonly search = signal('');
  protected readonly selected = signal<ReadonlySet<number>>(new Set());
  protected readonly scanError = signal('');
  protected readonly reason = signal<SerialRemoveStatus>('sold');
  protected readonly note = signal('');

  protected readonly visible = computed(() => {
    const text = this.search().trim().toUpperCase();
    return text ? this.inStock().filter((s) => s.serial.includes(text)) : this.inStock();
  });
  protected readonly noteRequired = computed(() => this.reason() === 'other');
  protected readonly canSave = computed(
    () =>
      !this.saving() &&
      this.selected().size > 0 &&
      (!this.noteRequired() || this.note().trim().length > 0),
  );

  constructor() {
    this.store.serials(this.product.id).subscribe({
      next: (serials) => {
        this.inStock.set(serials.filter((s) => s.status === 'in_stock'));
        this.loading.set(false);
      },
      error: () => this.dialogRef.close(),
    });
  }

  protected onSelectionChange(event: MatSelectionListChange): void {
    const next = new Set(this.selected());
    for (const option of event.options) {
      if (option.selected) next.add(option.value as number);
      else next.delete(option.value as number);
    }
    this.selected.set(next);
  }

  /** Scanner / typed serial + Enter → tick it. */
  protected scan(input: HTMLInputElement): void {
    const serial = input.value.trim().toUpperCase();
    input.value = '';
    if (!serial) return;
    const match = this.inStock().find((s) => s.serial === serial);
    if (!match) {
      this.scanError.set(`ไม่พบ ${serial} ในคลังของ SKU นี้`);
      return;
    }
    this.scanError.set('');
    this.selected.update((set) => new Set(set).add(match.id));
  }

  protected selectVisible(): void {
    this.selected.update((set) => {
      const next = new Set(set);
      this.visible().forEach((s) => next.add(s.id));
      return next;
    });
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected save(): void {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.store
      .removeSerials(this.product.id, [...this.selected()], this.reason(), this.note().trim())
      .subscribe({
        next: (product) => this.dialogRef.close(product),
        error: () => this.saving.set(false),
      });
  }
}
