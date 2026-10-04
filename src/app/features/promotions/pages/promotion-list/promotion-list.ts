import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import {
  PROMOTION_STATUS_BADGE,
  PROMOTION_STATUS_LABEL,
  PROMOTION_TYPE_ICON,
  PROMOTION_TYPE_LABEL,
  PromotionStatus,
  PromotionType,
  formatDateRange,
} from '@core/models';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { PromotionRow, PromotionsStore } from '../../data/promotions.store';

/** Promotion master list (`/promotions`). */
@Component({
  selector: 'app-promotion-list',
  imports: [
    RouterLink,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    PageHeader,
    StatCard,
    EmptyState,
    LoadingSpinner,
    MATERIAL,
  ],
  templateUrl: './promotion-list.html',
  styleUrl: './promotion-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PromotionList {
  protected readonly store = inject(PromotionsStore);
  private readonly router = inject(Router);

  protected readonly columns = ['code', 'name', 'type', 'condition', 'reward', 'period', 'status'];
  protected readonly types = Object.keys(PROMOTION_TYPE_LABEL) as PromotionType[];
  protected readonly typeLabel = PROMOTION_TYPE_LABEL;
  protected readonly statuses = Object.keys(PROMOTION_STATUS_LABEL) as PromotionStatus[];
  protected readonly statusLabel = PROMOTION_STATUS_LABEL;
  protected readonly dataSource = new MatTableDataSource<PromotionRow>([]);

  protected readonly filterText = signal('');
  /** 'current' = active + scheduled (default) */
  protected readonly statusFilter = signal<PromotionStatus | 'all' | 'current'>('current');
  protected readonly typeFilter = signal<PromotionType | 'all'>('all');

  private readonly filtered = computed(() => {
    const text = this.filterText().trim().toLowerCase();
    const status = this.statusFilter();
    const type = this.typeFilter();
    return this.store
      .rows()
      .filter((r) =>
        status === 'all'
          ? true
          : status === 'current'
            ? r.status === 'active' || r.status === 'scheduled'
            : r.status === status,
      )
      .filter((r) => type === 'all' || r.promotion.type === type)
      .filter(
        (r) =>
          !text ||
          [r.promotion.code, r.promotion.name, r.condition, r.reward].some((f) =>
            f.toLowerCase().includes(text),
          ),
      );
  });

  private readonly paginator = viewChild(MatPaginator);
  private readonly sort = viewChild(MatSort);

  constructor() {
    this.store.load();
    this.dataSource.sortingDataAccessor = (row, column) => {
      switch (column) {
        case 'period':
          return row.promotion.startDate;
        case 'status':
          return row.status;
        case 'type':
          return row.promotion.type;
        default:
          return String(row.promotion[column as 'code' | 'name']);
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

  protected typeText(row: PromotionRow): string {
    return PROMOTION_TYPE_LABEL[row.promotion.type];
  }

  protected typeIcon(row: PromotionRow): string {
    return PROMOTION_TYPE_ICON[row.promotion.type];
  }

  protected statusText(row: PromotionRow): string {
    return PROMOTION_STATUS_LABEL[row.status];
  }

  protected statusClass(row: PromotionRow): string {
    return PROMOTION_STATUS_BADGE[row.status];
  }

  protected range(row: PromotionRow): string {
    return formatDateRange(row.promotion);
  }

  protected open(row: PromotionRow): void {
    void this.router.navigate(['/promotions', row.promotion.id]);
  }
}
