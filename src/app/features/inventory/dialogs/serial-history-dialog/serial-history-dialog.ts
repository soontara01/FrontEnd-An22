import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { Product, SERIAL_STATUS_LABEL, SerialNumber, SerialStatus } from '@core/models';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { InventoryStore } from '../../data/inventory.store';
import { serialFormatHint } from '../serial-format-hint';

type HistoryFilter = 'all' | 'in_stock' | 'removed';

const STATUS_BADGE: Record<SerialStatus, string> = {
  in_stock: 'badge-success',
  sold: '',
  damaged: 'badge-error',
  other: 'badge-warn',
};

/** Read-only list of every serial of a SKU (in stock + removed history). */
@Component({
  selector: 'app-serial-history-dialog',
  imports: [
    DecimalPipe,
    MatDialogModule,
    MatTableModule,
    LoadingSpinner,
    EmptyState,
    ThaiDatePipe,
    MATERIAL,
  ],
  templateUrl: './serial-history-dialog.html',
  styleUrl: '../serial-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SerialHistoryDialog {
  protected readonly product = inject<Product>(MAT_DIALOG_DATA);
  private readonly store = inject(InventoryStore);
  private readonly dialogRef = inject(MatDialogRef);

  protected readonly formatHint = serialFormatHint(this.product);
  protected readonly columns = ['serial', 'status', 'cost', 'receivedAt', 'removedAt', 'note'];

  protected readonly loading = signal(true);
  private readonly serials = signal<SerialNumber[]>([]);
  protected readonly filter = signal<HistoryFilter>('all');
  protected readonly search = signal('');

  protected readonly inStockCount = computed(
    () => this.serials().filter((s) => s.status === 'in_stock').length,
  );
  protected readonly removedCount = computed(() => this.serials().length - this.inStockCount());

  protected readonly rows = computed(() => {
    const f = this.filter();
    const text = this.search().trim().toUpperCase();
    return this.serials()
      .filter((s) => f === 'all' || (f === 'in_stock') === (s.status === 'in_stock'))
      .filter((s) => !text || s.serial.includes(text))
      .sort((a, b) => (b.removedAt ?? b.receivedAt).localeCompare(a.removedAt ?? a.receivedAt));
  });

  constructor() {
    this.store.serials(this.product.id).subscribe({
      next: (serials) => {
        this.serials.set(serials);
        this.loading.set(false);
      },
      error: () => this.dialogRef.close(),
    });
  }

  protected statusText(s: SerialNumber): string {
    return SERIAL_STATUS_LABEL[s.status];
  }

  protected statusBadge(s: SerialNumber): string {
    return STATUS_BADGE[s.status];
  }
}
