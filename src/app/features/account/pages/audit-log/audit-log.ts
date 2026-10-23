import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import {
  AUDIT_ACTION_LABEL,
  AuditAction,
  AuditEvent,
  AuditQuery,
  formatDateRange,
} from '@core/models';
import { AdminOnlyNote } from '@shared/components/admin-only-note/admin-only-note';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import {
  DATE_PRESETS,
  DateRange,
  DatePreset,
  matchingPreset,
  presetRange,
} from '@shared/utils/date-range';
import { AccountApi } from '../../data/account-api.service';

/**
 * Audit log (E40): `/account/audit-log?from=&to=&action=&user=&branch=` (at most 366 days; default the last
 * 7 days). The server decides what this admin may see — a branch admin only their branches.
 */
@Component({
  selector: 'app-audit-log',
  imports: [MatTableModule, EmptyState, LoadingSpinner, AdminOnlyNote, ThaiDatePipe, MATERIAL],
  templateUrl: './audit-log.html',
  styleUrl: './audit-log.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AuditLog {
  private readonly api = inject(AccountApi);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly isCompanyAdmin = this.auth.isCompanyAdmin;

  /** Query params (withComponentInputBinding). */
  readonly from = input<string>();
  readonly to = input<string>();
  readonly action = input<string>();
  readonly user = input<string>();
  readonly branch = input<string>();

  protected readonly presets = DATE_PRESETS;
  protected readonly columns = ['at', 'action', 'who', 'branch', 'ref', 'detail'];
  protected readonly actions = Object.entries(AUDIT_ACTION_LABEL).map(([id, label]) => ({
    id: id as AuditAction,
    label,
  }));
  protected readonly branches = this.auth.branches;
  protected readonly users = toSignal(this.api.users().pipe(catchError(() => of([]))), {
    initialValue: [],
  });

  protected readonly range = computed<DateRange>(() => {
    if (!this.from() && !this.to()) return presetRange('last7');
    return { from: this.from() || null, to: this.to() || null };
  });
  protected readonly activePreset = computed(() => matchingPreset(this.range()));
  protected readonly rangeText = computed(() => {
    const { from, to } = this.range();
    return formatDateRange({ startDate: from ?? to ?? '', endDate: to });
  });

  private readonly query = computed<AuditQuery>(() => ({
    ...this.range(),
    action: (this.action() as AuditAction) || null,
    userId: Number(this.user()) || null,
    branchId: Number(this.branch()) || null,
  }));
  protected readonly data = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.api.auditLog(params),
  });
  protected readonly events = computed(() => (this.data.hasValue() ? this.data.value() : []));
  protected readonly selectedAction = computed(() => this.action() || '');
  protected readonly selectedUser = computed(() => Number(this.user()) || 0);
  protected readonly selectedBranch = computed(() => Number(this.branch()) || 0);

  protected actionText(event: AuditEvent): string {
    return AUDIT_ACTION_LABEL[event.action] ?? event.action;
  }

  protected whoText(event: AuditEvent): string {
    if (event.actorKind === 'platform') return `ผู้ให้บริการ: ${event.userName || '-'}`;
    if (event.actorKind === 'system') return 'ระบบ';
    return event.userName || '-';
  }

  protected branchText(event: AuditEvent): string {
    if (event.branchId === null) return 'ทั้งบริษัท';
    return this.branches().find((b) => b.id === event.branchId)?.code ?? `#${event.branchId}`;
  }

  protected applyPreset(preset: DatePreset): void {
    const { from, to } = presetRange(preset);
    this.setParams({ all: null, from, to });
  }

  protected setParams(params: Record<string, string | number | null>): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }
}
