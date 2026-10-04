import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatListModule, MatSelectionListChange } from '@angular/material/list';
import { Product, SerialNumber } from '@core/models';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { PosStore } from '../../data/pos.store';

export interface SerialPickData {
  product: Product;
  /** Serials already used elsewhere in the bill */
  exclude: ReadonlySet<string>;
  /** Exact number to pick (free items); null = any number ≥ 1 */
  count: number | null;
  /** Pre-selected serials (editing the free serials of a promotion) */
  selected?: readonly string[];
  title: string;
}

/** Scan or tick in-stock serials of one SKU. Closes with the picked serials. */
@Component({
  selector: 'app-serial-pick-dialog',
  imports: [MatDialogModule, MatListModule, LoadingSpinner, AutofocusDirective, MATERIAL],
  templateUrl: './serial-pick-dialog.html',
  styleUrl: './serial-pick-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SerialPickDialog {
  protected readonly data = inject<SerialPickData>(MAT_DIALOG_DATA);
  private readonly store = inject(PosStore);
  private readonly dialogRef = inject<MatDialogRef<SerialPickDialog, string[]>>(MatDialogRef);

  protected readonly loading = signal(true);
  private readonly inStock = signal<SerialNumber[]>([]);
  protected readonly search = signal('');
  protected readonly picked = signal<readonly string[]>(this.data.selected ?? []);
  protected readonly scanError = signal('');

  protected readonly available = computed(() =>
    this.inStock().filter(
      (s) => !this.data.exclude.has(s.serial) || this.data.selected?.includes(s.serial),
    ),
  );
  protected readonly visible = computed(() => {
    const text = this.search().trim().toUpperCase();
    return text ? this.available().filter((s) => s.serial.includes(text)) : this.available();
  });
  protected readonly canSave = computed(() => {
    const n = this.picked().length;
    return this.data.count === null ? n > 0 : n === this.data.count;
  });

  constructor() {
    this.store.serials(this.data.product.id).subscribe({
      next: (serials) => {
        this.inStock.set(serials.filter((s) => s.status === 'in_stock'));
        this.loading.set(false);
      },
      error: () => this.dialogRef.close(),
    });
  }

  protected isPicked(serial: string): boolean {
    return this.picked().includes(serial);
  }

  protected onSelectionChange(event: MatSelectionListChange): void {
    let next = [...this.picked()];
    for (const option of event.options) {
      const serial = option.value as string;
      next = option.selected ? [...next, serial] : next.filter((s) => s !== serial);
    }
    this.picked.set(this.limit(next));
  }

  /** Scanner / typed serial + Enter → pick it; a single pick in "any" mode saves right away. */
  protected scan(input: HTMLInputElement): void {
    const serial = input.value.trim().toUpperCase();
    input.value = '';
    if (!serial) return;
    if (this.data.exclude.has(serial) && !this.data.selected?.includes(serial)) {
      this.scanError.set(`${serial} อยู่ในบิลนี้แล้ว`);
      return;
    }
    if (!this.available().some((s) => s.serial === serial)) {
      this.scanError.set(`ไม่พบ ${serial} ในคลังของ ${this.data.product.sku}`);
      return;
    }
    this.scanError.set('');
    if (!this.isPicked(serial)) this.picked.set(this.limit([...this.picked(), serial]));
    if (this.data.count !== null && this.canSave()) this.save();
  }

  protected save(): void {
    if (this.canSave()) this.dialogRef.close([...this.picked()]);
  }

  /** Keeps the newest picks when an exact count is required. */
  private limit(serials: string[]): string[] {
    const count = this.data.count;
    return count === null ? serials : serials.slice(-count);
  }
}
