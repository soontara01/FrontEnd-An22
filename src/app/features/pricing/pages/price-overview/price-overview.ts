import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { effectiveCost, formatDateRange } from '@core/models';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { EXPIRING_DAYS, PriceRow, PricingStore } from '../../data/pricing.store';

type RowFilter = 'all' | 'none' | 'scheduled' | 'expiring';

/** Pricing overview: one row per active SKU with today's price and upcoming changes. */
@Component({
  selector: 'app-price-overview',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    PageHeader,
    StatCard,
    EmptyState,
    LoadingSpinner,
    ThaiDatePipe,
    MATERIAL,
  ],
  templateUrl: './price-overview.html',
  styleUrl: './price-overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PriceOverview {
  protected readonly store = inject(PricingStore);
  private readonly router = inject(Router);

  protected readonly expiringDays = EXPIRING_DAYS;
  protected readonly columns = ['sku', 'name', 'cost', 'current', 'margin', 'period', 'next'];
  protected readonly dataSource = new MatTableDataSource<PriceRow>([]);
  protected readonly filterText = signal('');
  protected readonly rowFilter = signal<RowFilter>('all');

  private readonly filtered = computed(() => {
    const text = this.filterText().trim().toLowerCase();
    const filter = this.rowFilter();
    return this.store
      .rows()
      .filter(
        (r) =>
          filter === 'all' ||
          (filter === 'none' && !r.current) ||
          (filter === 'scheduled' && !!r.next) ||
          (filter === 'expiring' && r.expiringSoon),
      )
      .filter(
        (r) =>
          !text ||
          r.product.sku.toLowerCase().includes(text) ||
          r.product.name.toLowerCase().includes(text),
      );
  });

  private readonly paginator = viewChild(MatPaginator);
  private readonly sort = viewChild(MatSort);

  constructor() {
    this.store.load();

    // Sort on nested row fields.
    this.dataSource.sortingDataAccessor = (row, column) => {
      switch (column) {
        case 'sku':
          return row.product.sku;
        case 'name':
          return row.product.name;
        case 'cost':
          return effectiveCost(row.product);
        case 'current':
          return row.current?.price ?? -1;
        case 'margin':
          return row.margin ?? -Infinity;
        case 'next':
          return row.next?.startDate ?? '9999';
        default:
          return '';
      }
    };

    effect(() => {
      this.dataSource.data = this.filtered();
    });
    effect(() => {
      this.dataSource.paginator = this.paginator() ?? null;
      this.dataSource.sort = this.sort() ?? null;
    });
  }

  protected cost(row: PriceRow): number {
    return effectiveCost(row.product);
  }

  protected range(row: PriceRow): string {
    return row.current ? formatDateRange(row.current) : '-';
  }

  protected open(row: PriceRow): void {
    void this.router.navigate(['/pricing', row.product.id]);
  }
}
