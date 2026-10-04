import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';
import {
  Product,
  SKU_STATUS_BADGE,
  SKU_STATUS_LABEL,
  SkuStatus,
  allBarcodes,
  isDiscontinued,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { exportSkusToExcel } from '../../data/sku-excel';
import { SkuStore } from '../../data/sku.store';
import { saveBlob, timestampedName } from '@shared/utils/download';
import { MatMenuModule } from '@angular/material/menu';

type SerialFilter = 'all' | 'serial' | 'none';

@Component({
  selector: 'app-sku-list',
  imports: [
    CurrencyPipe,
    RouterLink,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatMenuModule,
    PageHeader,
    StatCard,
    EmptyState,
    LoadingSpinner,
    MATERIAL,
  ],
  templateUrl: './sku-list.html',
  styleUrl: './sku-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SkuList {
  protected readonly store = inject(SkuStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);

  protected readonly columns = [
    'image',
    'sku',
    'name',
    'brand',
    'categoryPath',
    'unit',
    'currentPrice',
    'serialControl',
    'saleStatus',
    'actions',
  ];
  protected readonly statuses = Object.keys(SKU_STATUS_LABEL) as SkuStatus[];
  protected readonly statusLabel = SKU_STATUS_LABEL;
  protected readonly dataSource = new MatTableDataSource<Product>([]);

  protected readonly filterText = signal('');
  protected readonly categoryFilter = signal<number | null>(null);
  protected readonly serialFilter = signal<SerialFilter>('all');
  /** 'current' = everything except discontinued (default). */
  protected readonly statusFilter = signal<SkuStatus | 'all' | 'current'>('current');

  private readonly filtered = computed(() => {
    const text = this.filterText().trim().toLowerCase();
    const category = this.categoryFilter();
    const serial = this.serialFilter();
    return this.store
      .skus()
      .filter((s) => {
        const status = this.statusFilter();
        if (status === 'all') return true;
        if (status === 'current') return !isDiscontinued(s);
        return s.saleStatus === status;
      })
      .filter((s) => category === null || s.categoryId === category)
      .filter((s) => serial === 'all' || s.serialControl === (serial === 'serial'))
      .filter(
        (s) =>
          !text ||
          [s.sku, s.name, s.shortName, s.brand, s.model, ...allBarcodes(s)].some((f) =>
            f.toLowerCase().includes(text),
          ),
      );
  });

  private readonly paginator = viewChild(MatPaginator);
  private readonly sort = viewChild(MatSort);

  constructor() {
    this.store.load();

    effect(() => {
      this.dataSource.data = this.filtered();
    });
    effect(() => {
      this.dataSource.paginator = this.paginator() ?? null;
      this.dataSource.sort = this.sort() ?? null;
    });
  }

  protected readonly exporting = signal(false);

  /** Exports the rows currently shown (search / filters applied). */
  protected async exportExcel(): Promise<void> {
    this.exporting.set(true);
    try {
      const blob = await exportSkusToExcel(
        this.dataSource.filteredData,
        this.store.categories(),
        this.store.suppliers(),
      );
      saveBlob(blob, `${timestampedName('sku')}.xlsx`);
    } finally {
      this.exporting.set(false);
    }
  }

  protected statusText(sku: Product): string {
    return SKU_STATUS_LABEL[sku.saleStatus];
  }

  protected statusClass(sku: Product): string {
    return SKU_STATUS_BADGE[sku.saleStatus];
  }

  protected open(sku: Product): void {
    void this.router.navigate(['/sku', sku.id]);
  }

  protected remove(sku: Product, event: Event): void {
    event.stopPropagation();
    openConfirm(this.dialog, {
      title: 'ลบ SKU',
      message: `ต้องการลบ ${sku.sku} - ${sku.name} ใช่หรือไม่?`,
      confirmText: 'ลบ',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.remove(sku.id)),
      )
      .subscribe(() => this.notify.success(`ลบ ${sku.sku} เรียบร้อย`));
  }
}
