import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';
import {
  PAYMENT_TYPE_ICON,
  RETURN_STATUS_BADGE,
  RETURN_STATUS_LABEL,
  SALE_STATUS_BADGE,
  SALE_STATUS_LABEL,
  Sale,
  SaleStatus,
  formatDateRange,
  fromIsoDate,
  toIsoDate,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import {
  DATE_PRESETS,
  DatePreset,
  DateRange,
  matchingPreset,
  presetRange,
} from '@shared/utils/date-range';
import { summarizeSales } from '../../data/sale-summary';
import { SalesStore } from '../../data/sales.store';

/**
 * Bills of a local-date range (`/sales?from=&to=`, `?all=1`; default = today) with totals,
 * gross profit and money in per payment method (for closing the drawer), net of the credit notes
 * issued in the same range.
 */
@Component({
  selector: 'app-sale-list',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    MatDatepickerModule,
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
  private readonly store = inject(SalesStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);

  /** Query params (withComponentInputBinding). */
  readonly from = input<string>();
  readonly to = input<string>();
  readonly all = input<string>();

  protected readonly presets = DATE_PRESETS;
  protected readonly methodIcon = PAYMENT_TYPE_ICON;
  protected readonly columns = [
    'orderNo',
    'date',
    'customer',
    'cashier',
    'itemCount',
    'total',
    'payments',
    'status',
    'actions',
  ];
  protected readonly statuses: SaleStatus[] = ['paid', 'cancelled', 'pending'];
  protected readonly statusLabel = SALE_STATUS_LABEL;

  protected readonly filterText = signal('');
  /** A bill status, or 'returned' = bills with credit notes */
  protected readonly statusFilter = signal<SaleStatus | 'all' | 'returned'>('all');

  /** Effective range from the URL; no params → today. */
  protected readonly range = computed<DateRange>(() => {
    if (this.all()) return presetRange('all');
    if (!this.from() && !this.to()) return presetRange('today');
    return { from: this.from() || null, to: this.to() || null };
  });
  protected readonly activePreset = computed(() => matchingPreset(this.range()));
  protected readonly rangeText = computed(() => {
    const { from, to } = this.range();
    if (!from && !to) return 'ทั้งหมด';
    if (from && to) return formatDateRange({ startDate: from, endDate: to });
    return from ? `ตั้งแต่ ${formatDateRange({ startDate: from, endDate: null })}` : `ถึง ${to}`;
  });

  protected readonly sales = rxResource({
    params: () => this.range(),
    stream: ({ params }) => this.store.list(params.from, params.to),
  });
  protected readonly creditNotes = rxResource({
    params: () => this.range(),
    stream: ({ params }) => this.store.creditNotes(params.from, params.to),
  });
  private readonly rows = computed(() => (this.sales.hasValue() ? this.sales.value() : []));
  protected readonly summary = computed(() =>
    summarizeSales(this.rows(), this.creditNotes.hasValue() ? this.creditNotes.value() : []),
  );

  private readonly filtered = computed(() => {
    const text = this.filterText().trim().toLowerCase();
    const status = this.statusFilter();
    return this.rows()
      .filter(
        (s) =>
          status === 'all' ||
          (status === 'returned' ? s.returnStatus !== 'none' : s.status === status),
      )
      .filter(
        (s) =>
          !text ||
          [s.orderNo, s.customer, s.cashier, ...s.lines.map((l) => l.serial ?? '')].some((v) =>
            v.toLowerCase().includes(text),
          ),
      );
  });

  protected readonly dataSource = new MatTableDataSource<Sale>([]);
  private readonly paginator = viewChild(MatPaginator);
  private readonly sort = viewChild(MatSort);

  /** Picker form, kept in sync with the URL range. */
  protected readonly rangeForm = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  constructor() {
    effect(() => {
      this.dataSource.data = this.filtered();
    });
    effect(() => {
      this.dataSource.paginator = this.paginator() ?? null;
      this.dataSource.sort = this.sort() ?? null;
    });
    effect(() => {
      const { from, to } = this.range();
      this.rangeForm.setValue(
        { start: from ? fromIsoDate(from) : null, end: to ? fromIsoDate(to) : null },
        { emitEvent: false },
      );
    });
  }

  protected statusText(sale: Sale): string {
    return SALE_STATUS_LABEL[sale.status];
  }

  protected statusBadge(sale: Sale): string {
    return SALE_STATUS_BADGE[sale.status];
  }

  /** Second badge next to the status: goods returned by credit notes ('' = none). */
  protected returnText(sale: Sale): string {
    return RETURN_STATUS_LABEL[sale.returnStatus];
  }

  protected returnBadge(sale: Sale): string {
    return RETURN_STATUS_BADGE[sale.returnStatus];
  }

  protected returnTooltip(sale: Sale): string {
    return `${sale.creditNoteNos.join(', ')} · คืนเงิน ${sale.creditedTotal.toLocaleString(
      'th-TH',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    )}`;
  }

  protected methodNames(sale: Sale): string {
    return sale.payments.map((p) => p.name).join(', ');
  }

  protected applyPreset(preset: DatePreset): void {
    if (preset === 'all') {
      this.navigate({ all: '1', from: null, to: null });
    } else {
      const { from, to } = presetRange(preset);
      this.navigate({ all: null, from, to });
    }
  }

  protected search(): void {
    const { start, end } = this.rangeForm.getRawValue();
    this.navigate({
      all: start || end ? null : '1',
      from: start ? toIsoDate(start) : null,
      to: end ? toIsoDate(end) : null,
    });
  }

  protected reload(): void {
    this.sales.reload();
    this.creditNotes.reload();
  }

  /** Pre-POS orders only. */
  protected markPaid(sale: Sale): void {
    this.store.setStatus(sale.id, 'paid').subscribe(() => {
      this.notify.success(`${sale.orderNo}: บันทึกการชำระเงินแล้ว`);
      this.sales.reload();
    });
  }

  /** Pre-POS orders only (POS bills are voided from the bill page). */
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
      .subscribe(() => {
        this.notify.success(`${sale.orderNo}: ยกเลิกแล้ว`);
        this.sales.reload();
      });
  }

  /** Same page, new query params (SPA navigation inside the Sales menu). */
  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge' });
  }
}
