import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { forkJoin } from 'rxjs';
import {
  MOVEMENT_TYPE_LABEL,
  Product,
  SERIAL_STATUS_LABEL,
  SerialNumber,
  SerialStatus,
  StockMovement,
  serialMovements,
} from '@core/models';
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

/**
 * Read-only list of every serial of a SKU (in stock + removed). Clicking one shows its timeline
 * from the stock movements (B18), e.g. removed as damaged and later received back.
 */
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
  styles: `
    tr.mat-mdc-row {
      cursor: pointer;
    }
    tr.selected {
      background: var(--mat-sys-secondary-container);
    }
    .timeline {
      margin-top: 16px;
    }
    .timeline h3 {
      margin: 0 0 8px;
      font: var(--mat-sys-title-small);
    }
    .timeline ol {
      margin: 0;
      padding-left: 20px;
    }
    .timeline li {
      padding: 2px 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SerialHistoryDialog {
  protected readonly product = inject<Product>(MAT_DIALOG_DATA);
  private readonly store = inject(InventoryStore);
  private readonly dialogRef = inject(MatDialogRef);

  protected readonly formatHint = serialFormatHint(this.product);
  protected readonly columns = [
    'serial',
    'status',
    'cost',
    'receivedAt',
    'removedAt',
    'note',
    'history',
  ];
  protected readonly movementLabel = MOVEMENT_TYPE_LABEL;

  protected readonly loading = signal(true);
  private readonly serials = signal<SerialNumber[]>([]);
  private readonly movements = signal<StockMovement[]>([]);
  /** Serial whose timeline is shown below the table */
  protected readonly selected = signal<string | null>(null);
  protected readonly timeline = computed(() => {
    const serial = this.selected();
    return serial ? serialMovements(serial, this.movements()) : [];
  });
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
    forkJoin({
      serials: this.store.serials(this.product.id),
      card: this.store.movements(this.product.id),
    }).subscribe({
      next: ({ serials, card }) => {
        this.serials.set(serials);
        this.movements.set([...card.openingMovements, ...card.movements]);
        this.loading.set(false);
      },
      error: () => this.dialogRef.close(),
    });
  }

  /** Stock movements that moved this serial (received, sold, removed, received back …). */
  protected moveCount(s: SerialNumber): number {
    return serialMovements(s.serial, this.movements()).length;
  }

  protected toggle(s: SerialNumber): void {
    this.selected.update((current) => (current === s.serial ? null : s.serial));
  }

  protected statusText(s: SerialNumber): string {
    return SERIAL_STATUS_LABEL[s.status];
  }

  protected statusBadge(s: SerialNumber): string {
    return STATUS_BADGE[s.status];
  }
}
