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
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { filter, switchMap } from 'rxjs';
import { Sale, SaleStatus } from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { SalesStore } from '../../data/sales.store';

@Component({
  selector: 'app-sale-list',
  imports: [
    CurrencyPipe,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatMenuModule,
    PageHeader,
    StatCard,
    EmptyState,
    LoadingSpinner,
    ThaiDatePipe,
    MATERIAL,
  ],
  templateUrl: './sale-list.html',
  styleUrl: './sale-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SaleList {
  protected readonly store = inject(SalesStore);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);

  protected readonly columns = [
    'orderNo',
    'date',
    'customer',
    'itemCount',
    'total',
    'status',
    'actions',
  ];
  protected readonly dataSource = new MatTableDataSource<Sale>([]);
  protected readonly filterText = signal('');
  protected readonly statusFilter = signal<SaleStatus | 'all'>('all');

  protected readonly statuses: SaleStatus[] = ['pending', 'paid', 'cancelled'];
  protected readonly statusLabel: Record<SaleStatus, string> = {
    pending: 'รอชำระ',
    paid: 'ชำระแล้ว',
    cancelled: 'ยกเลิก',
  };
  protected readonly statusClass: Record<SaleStatus, string> = {
    pending: 'badge-warn',
    paid: 'badge-success',
    cancelled: 'badge-error',
  };

  protected statusText(sale: Sale): string {
    return this.statusLabel[sale.status];
  }

  protected statusBadge(sale: Sale): string {
    return this.statusClass[sale.status];
  }

  private readonly filtered = computed(() => {
    const text = this.filterText().trim().toLowerCase();
    const status = this.statusFilter();
    return this.store
      .sales()
      .filter((s) => status === 'all' || s.status === status)
      .filter(
        (s) =>
          !text ||
          s.orderNo.toLowerCase().includes(text) ||
          s.customer.toLowerCase().includes(text),
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

  protected markPaid(sale: Sale): void {
    this.store
      .setStatus(sale.id, 'paid')
      .subscribe(() => this.notify.success(`${sale.orderNo}: บันทึกการชำระเงินแล้ว`));
  }

  protected cancel(sale: Sale): void {
    openConfirm(this.dialog, {
      title: 'ยกเลิกคำสั่งขาย',
      message: `ต้องการยกเลิก ${sale.orderNo} (${sale.customer}) ใช่หรือไม่?`,
      confirmText: 'ยกเลิกคำสั่งขาย',
      cancelText: 'ไม่ใช่',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.setStatus(sale.id, 'cancelled')),
      )
      .subscribe(() => this.notify.success(`${sale.orderNo}: ยกเลิกแล้ว`));
  }
}
