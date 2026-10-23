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
  BranchScope,
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
import { AuthService } from '@core/auth/auth.service';
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
import { httpErrorShown } from '@core/http/http-error-shown';
import { MenuAccessService } from '@core/navigation/menu-access.service';
import { saveBlob, timestampedName } from '@shared/utils/download';
import { summarizeSales } from '../../data/sale-summary';
import { salesXlsx } from '../../data/sales-excel';
import { SalesStore } from '../../data/sales.store';
import { BranchScopeSelect } from '../../components/branch-scope-select';

/**
 * Bills of a local-date range (`/sales?from=&to=`, at most 366 days; default = today) with totals,
 * gross profit and money in per payment method (for closing the drawer), net of the credit notes
 * issued in the same range.
 */
@Component({
  selector: 'app-sale-list',
  imports: [
    BranchScopeSelect,
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
  protected readonly menus = inject(MenuAccessService);
  private readonly store = inject(SalesStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);
  /** The sales tax report is admin only (P4). */
  protected readonly isAdmin = this.auth.isAdmin;
  /** Gross profit only for who may see cost (E43). */
  protected readonly canSeeCost = this.auth.canSeeCost;

  /** Query params (withComponentInputBinding). */
  readonly from = input<string>();
  readonly to = input<string>();
  /** `?shift=<id>`: bills sold or voided in that shift (the date range is ignored) */
  readonly shift = input<string>();
  /** `?branch=<id>|all` (E23); none = the working branch */
  readonly branch = input<string>();
  protected readonly scope = computed<BranchScope>(() =>
    this.branch() === 'all' ? 'all' : Number(this.branch()) || this.auth.currentBranch()?.id || 0,
  );
  protected readonly shiftId = computed(() => Number(this.shift()) || null);
  protected readonly shiftInfo = rxResource({
    params: () => this.shiftId() ?? undefined,
    stream: ({ params }) => this.store.shift(params),
  });
  protected readonly shiftNo = computed(() =>
    this.shiftInfo.hasValue() ? this.shiftInfo.value().shiftNo : `#${this.shiftId()}`,
  );

  protected readonly presets = DATE_PRESETS;
  protected readonly methodIcon = PAYMENT_TYPE_ICON;
  private readonly baseColumns = [
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
  /** + the branch when every branch is shown */
  protected readonly columns = computed(() =>
    this.scope() === 'all' ? ['orderNo', 'branch', ...this.baseColumns.slice(1)] : this.baseColumns,
  );
  protected readonly statuses: SaleStatus[] = ['paid', 'cancelled', 'pending'];
  protected readonly statusLabel = SALE_STATUS_LABEL;

  protected readonly filterText = signal('');
  /** A bill status, or 'returned' = bills with credit notes */
  protected readonly statusFilter = signal<SaleStatus | 'all' | 'returned'>('all');
  /** Bills of one POS terminal (null = all) */
  protected readonly terminalFilter = signal<number | null>(null);
  protected readonly terminals = this.store.terminals;

  /** Effective range from the URL; no params → today. */
  protected readonly range = computed<DateRange>(() => {
    if (!this.from() && !this.to()) return presetRange('today');
    return { from: this.from() || null, to: this.to() || null };
  });
  protected readonly activePreset = computed(() => matchingPreset(this.range()));
  protected readonly rangeText = computed(() => {
    const { from, to } = this.range();
    if (from && to) return formatDateRange({ startDate: from, endDate: to });
    return from ? `ตั้งแต่ ${formatDateRange({ startDate: from, endDate: null })}` : `ถึง ${to}`;
  });

  protected readonly sales = rxResource({
    params: () => ({ ...this.range(), shiftId: this.shiftId(), scope: this.scope() }),
    stream: ({ params }) =>
      params.shiftId
        ? this.store.salesOfShift(params.shiftId)
        : this.store.list(params.from, params.to, params.scope),
  });
  protected readonly creditNotes = rxResource({
    params: () => ({ ...this.range(), shiftId: this.shiftId(), scope: this.scope() }),
    stream: ({ params }) =>
      params.shiftId
        ? this.store.creditNotesOfShift(params.shiftId)
        : this.store.creditNotes(params.from, params.to, params.scope),
  });
  private readonly rows = computed(() => (this.sales.hasValue() ? this.sales.value() : []));
  protected readonly summary = computed(() =>
    summarizeSales(this.rows(), this.creditNotes.hasValue() ? this.creditNotes.value() : []),
  );

  private readonly filtered = computed(() => {
    const text = this.filterText().trim().toLowerCase();
    const status = this.statusFilter();
    const terminal = this.terminalFilter();
    return this.rows()
      .filter((s) => terminal === null || s.terminalId === terminal)
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
    this.store.loadLookups();
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

  protected readonly exporting = signal(false);

  /**
   * Excel of what the list shows (range / shift, branch scope, status, terminal, search): bills,
   * their lines and payments, + the credit notes of the same range and scope. Cost / gross
   * profit only for who may see cost (E46).
   */
  protected async exportExcel(): Promise<void> {
    this.exporting.set(true);
    try {
      const scope = this.scope();
      const code =
        scope === 'all' ? '' : (this.auth.branches().find((b) => b.id === scope)?.code ?? '');
      const terminal = this.terminalFilter();
      const filters = [
        this.statusFilter() === 'all'
          ? ''
          : `สถานะ: ${this.statusFilter() === 'returned' ? 'มีการคืนสินค้า' : SALE_STATUS_LABEL[this.statusFilter() as SaleStatus]}`,
        terminal === null ? '' : this.store.terminalLabel(terminal),
        this.filterText().trim() ? `ค้นหา: ${this.filterText().trim()}` : '',
      ].filter(Boolean);
      const scopeText = [
        scope === 'all' ? 'ทุกสาขา' : `สาขา ${code || '-'}`,
        this.shiftId() ? `กะ ${this.shiftNo()}` : `ช่วงวันที่: ${this.rangeText()}`,
        ...filters,
      ].join(' · ');
      const blob = await salesXlsx({
        sales: this.filtered(),
        creditNotes: this.creditNotes.hasValue() ? this.creditNotes.value() : [],
        scopeText,
        seeCost: this.canSeeCost(),
        showBranch: scope === 'all',
        branchCode: (id) => this.auth.branches().find((b) => b.id === id)?.code ?? '-',
        terminalLabel: (id) => this.store.terminalLabel(id),
      });
      saveBlob(blob, `${timestampedName(`sales-${code || 'all'}`)}.xlsx`);
    } finally {
      this.exporting.set(false);
    }
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

  protected selectBranch(scope: BranchScope): void {
    const working = scope === this.auth.currentBranch()?.id;
    this.navigate({ branch: working ? null : String(scope), shift: null });
  }

  /** Branch code of a bill (shown when every branch is listed). */
  protected branchCode(sale: Sale): string {
    return this.auth.branches().find((b) => b.id === sale.branchId)?.code ?? '-';
  }

  protected applyPreset(preset: DatePreset): void {
    const { from, to } = presetRange(preset);
    this.navigate({ all: null, from, to, shift: null });
  }

  protected search(): void {
    const { start, end } = this.rangeForm.getRawValue();
    this.navigate({
      from: start ? toIsoDate(start) : null,
      to: end ? toIsoDate(end) : null,
      shift: null,
    });
  }

  /** Back to the date range (the shift filter replaces it). */
  protected clearShift(): void {
    this.navigate({ shift: null });
  }

  protected reload(): void {
    this.sales.reload();
    this.creditNotes.reload();
  }

  /** Pre-POS orders only. */
  protected markPaid(sale: Sale): void {
    this.store.setStatus(sale.id, 'paid').subscribe({
      next: () => {
        this.notify.success(`${sale.orderNo}: บันทึกการชำระเงินแล้ว`);
        this.sales.reload();
      },
      error: httpErrorShown,
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
      .subscribe({
        next: () => {
          this.notify.success(`${sale.orderNo}: ยกเลิกแล้ว`);
          this.sales.reload();
        },
        error: httpErrorShown,
      });
  }

  /** Same page, new query params (SPA navigation inside the Sales menu). */
  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge' });
  }
}
