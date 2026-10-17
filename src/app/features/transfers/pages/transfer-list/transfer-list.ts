import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { BranchScope, TRANSFER_STATUS_BADGE, TRANSFER_STATUS_LABEL, Transfer } from '@core/models';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { BranchScopeSelect } from '../../components/branch-scope-select';
import { TransferDirection } from '../../data/transfers-api.service';
import { TransfersStore } from '../../data/transfers.store';

/**
 * Transfers of a branch (`/transfers?dir=in|out|all&branch=<id>|all`, default: still to receive here).
 * Anyone who works at the source or the destination sees a transfer (E30).
 */
@Component({
  selector: 'app-transfer-list',
  imports: [
    BranchScopeSelect,
    MatButtonToggleModule,
    RouterLink,
    PageHeader,
    EmptyState,
    LoadingSpinner,
    ThaiDatePipe,
    MATERIAL,
  ],
  templateUrl: './transfer-list.html',
  styleUrl: '../transfers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class TransferList {
  protected readonly store = inject(TransfersStore);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** Query params (withComponentInputBinding). */
  readonly dir = input<string>();
  readonly branch = input<string>();

  protected readonly direction = computed<TransferDirection>(() =>
    this.dir() === 'out' || this.dir() === 'all' ? (this.dir() as TransferDirection) : 'in',
  );
  protected readonly scope = computed<BranchScope>(() =>
    this.branch() === 'all' ? 'all' : Number(this.branch()) || this.auth.currentBranch()?.id || 0,
  );
  protected readonly tabs: { value: TransferDirection; label: string }[] = [
    { value: 'in', label: 'รับเข้า' },
    { value: 'out', label: 'ส่งออก' },
    { value: 'all', label: 'ทั้งหมด' },
  ];

  protected readonly data = rxResource({
    params: () => ({ direction: this.direction(), scope: this.scope() }),
    stream: ({ params }) => this.store.list(params.direction, params.scope),
  });
  protected readonly transfers = computed(() => (this.data.hasValue() ? this.data.value() : []));
  protected readonly waiting = computed(
    () =>
      this.transfers().filter(
        (t) => t.status === 'in_transit' && t.toBranchId === this.auth.currentBranch()?.id,
      ).length,
  );

  constructor() {
    this.store.loadBranches();
  }

  protected statusText(t: Transfer): string {
    return TRANSFER_STATUS_LABEL[t.status];
  }

  protected statusBadge(t: Transfer): string {
    return TRANSFER_STATUS_BADGE[t.status];
  }

  protected itemCount(t: Transfer): number {
    return t.lines.reduce((n, l) => n + l.qty, 0);
  }

  protected select(params: { dir?: TransferDirection; branch?: BranchScope }): void {
    const queryParams: Record<string, string | null> = {};
    if (params.dir) queryParams['dir'] = params.dir === 'in' ? null : params.dir;
    if (params.branch !== undefined) {
      const working = params.branch === this.auth.currentBranch()?.id;
      queryParams['branch'] = working ? null : String(params.branch);
    }
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge' });
  }
}
