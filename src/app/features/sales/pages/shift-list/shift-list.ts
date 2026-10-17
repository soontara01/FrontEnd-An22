import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import {
  BranchScope,
  SHIFT_APPROVAL_BADGE,
  SHIFT_APPROVAL_LABEL,
  SHIFT_STATUS_LABEL,
  Shift,
  formatDateRange,
  shiftOpenTooLong,
  variance,
} from '@core/models';
import { AuthService } from '@core/auth/auth.service';
import { AdminOnlyNote } from '@shared/components/admin-only-note/admin-only-note';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import {
  DATE_PRESETS,
  DateRange,
  DatePreset,
  matchingPreset,
  presetRange,
} from '@shared/utils/date-range';
import { SalesStore } from '../../data/sales.store';
import { BranchScopeSelect } from '../../components/branch-scope-select';

/**
 * POS shifts opened within a local-date range (`/sales/shifts?from=&to=`, `?all=1`; default this
 * month): status, variance, approval (pending first to act on) and the variance per cashier (S3).
 */
@Component({
  selector: 'app-shift-list',
  imports: [
    BranchScopeSelect,
    DecimalPipe,
    RouterLink,
    MatTableModule,
    PageHeader,
    EmptyState,
    LoadingSpinner,
    AdminOnlyNote,
    ThaiDatePipe,
    MATERIAL,
  ],
  templateUrl: './shift-list.html',
  styleUrl: './shift-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ShiftList {
  protected readonly store = inject(SalesStore);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  /** Non-admins get only their own shifts from the server (P6). */
  protected readonly isAdmin = this.auth.isAdmin;

  /** Query params (withComponentInputBinding). */
  readonly from = input<string>();
  readonly to = input<string>();
  readonly all = input<string>();
  /** `?branch=<id>|all` (E23); none = the working branch */
  readonly branch = input<string>();
  protected readonly scope = computed<BranchScope>(() =>
    this.branch() === 'all' ? 'all' : Number(this.branch()) || this.auth.currentBranch()?.id || 0,
  );

  protected readonly presets = DATE_PRESETS;
  private readonly baseColumns = [
    'shiftNo',
    'opened',
    'terminal',
    'cashier',
    'status',
    'variance',
    'approval',
  ];
  /** + the branch when every branch is shown */
  protected readonly columns = computed(() =>
    this.scope() === 'all' ? ['shiftNo', 'branch', ...this.baseColumns.slice(1)] : this.baseColumns,
  );
  protected readonly reportColumns = [
    'cashier',
    'shifts',
    'short',
    'over',
    'pending',
    'drawerOpens',
  ];
  protected readonly pendingOnly = signal(false);

  protected readonly range = computed<DateRange>(() => {
    if (this.all()) return presetRange('all');
    if (!this.from() && !this.to()) return presetRange('thisMonth');
    return { from: this.from() || null, to: this.to() || null };
  });
  protected readonly activePreset = computed(() => matchingPreset(this.range()));
  protected readonly rangeText = computed(() => {
    const { from, to } = this.range();
    if (!from && !to) return 'ทั้งหมด';
    return formatDateRange({ startDate: from ?? to ?? '', endDate: to });
  });

  protected readonly data = rxResource({
    params: () => ({ ...this.range(), scope: this.scope() }),
    stream: ({ params }) => this.store.shiftList(params.from, params.to, params.scope),
  });
  protected readonly shifts = computed(() => {
    const list = this.data.hasValue() ? this.data.value().shifts : [];
    return this.pendingOnly() ? list.filter((s) => s.approvalStatus === 'pending') : list;
  });
  protected readonly pendingCount = computed(() =>
    this.data.hasValue()
      ? this.data.value().shifts.filter((s) => s.approvalStatus === 'pending').length
      : 0,
  );
  protected readonly report = computed(() =>
    this.data.hasValue() ? this.data.value().report : [],
  );

  constructor() {
    this.store.loadLookups();
  }

  protected statusText(shift: Shift): string {
    return SHIFT_STATUS_LABEL[shift.status];
  }

  protected leftOpen(shift: Shift): boolean {
    return shiftOpenTooLong(shift, new Date(), this.store.storeInfo()?.shiftMaxHours ?? 12);
  }

  protected totalVariance(shift: Shift): number {
    return shift.counts.reduce((sum, c) => sum + variance(c), 0);
  }

  /** Variance after the adjustments made since closing (S8; server-derived `adjustmentTotal`). */
  protected adjustedTotal(shift: Shift): number {
    return Math.round((this.totalVariance(shift) + (shift.adjustmentTotal ?? 0)) * 100) / 100;
  }

  protected approvalText(shift: Shift): string {
    return SHIFT_APPROVAL_LABEL[shift.approvalStatus];
  }

  protected approvalBadge(shift: Shift): string {
    return SHIFT_APPROVAL_BADGE[shift.approvalStatus];
  }

  protected selectBranch(scope: BranchScope): void {
    const working = scope === this.auth.currentBranch()?.id;
    void this.router.navigate([], {
      queryParams: { branch: working ? null : String(scope) },
      queryParamsHandling: 'merge',
    });
  }

  protected branchCode(shift: Shift): string {
    return this.auth.branches().find((b) => b.id === shift.branchId)?.code ?? '-';
  }

  protected applyPreset(preset: DatePreset): void {
    const { from, to } = presetRange(preset);
    void this.router.navigate([], {
      queryParams: preset === 'all' ? { all: '1', from: null, to: null } : { all: null, from, to },
      queryParamsHandling: 'merge',
    });
  }
}
