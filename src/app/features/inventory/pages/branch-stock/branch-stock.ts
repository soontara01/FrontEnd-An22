import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { Branch, BranchStockRow, round2 } from '@core/models';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { InventoryStore } from '../../data/inventory.store';

interface Line extends BranchStockRow {
  branch: Pick<Branch, 'id' | 'code' | 'name'>;
  /** stock × avgCost; null when the cost is not shown (E14 → E43) */
  value: number | null;
  current: boolean;
  /** The user works in this branch, so its stock card opens (E15) */
  canOpen: boolean;
}

/**
 * Stock of one SKU in every active branch (`/inventory/branch-stock/:productId`, E14): everyone sees
 * the quantities ("มีที่สาขา BN 3 ชิ้น"), admins also the branch's average cost and value.
 */
@Component({
  selector: 'app-branch-stock',
  imports: [DecimalPipe, RouterLink, PageHeader, LoadingSpinner, MATERIAL],
  templateUrl: './branch-stock.html',
  styleUrl: './branch-stock.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class BranchStock {
  protected readonly store = inject(InventoryStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Route param (withComponentInputBinding). */
  readonly productId = input.required<string>();

  protected readonly data = rxResource({
    params: () => Number(this.productId()),
    stream: ({ params }) =>
      forkJoin({ rows: this.store.branchStock(params), branches: this.store.branches() }),
  });

  protected readonly product = computed(() =>
    this.store.products().find((p) => p.id === Number(this.productId())),
  );
  protected readonly showCost = this.auth.canSeeCost;

  protected readonly lines = computed<Line[]>(() => {
    if (!this.data.hasValue()) return [];
    const { rows, branches } = this.data.value();
    const mine = new Set(this.auth.branches().map((b) => b.id));
    const currentId = this.auth.currentBranch()?.id;
    return rows.map((row) => ({
      ...row,
      branch: branches.find((b) => b.id === row.branchId) ?? {
        id: row.branchId,
        code: String(row.branchId),
        name: '',
      },
      value: row.avgCost === null ? null : round2(row.stock * row.avgCost),
      current: row.branchId === currentId,
      canOpen: mine.has(row.branchId),
    }));
  });

  protected readonly totalStock = computed(() => this.lines().reduce((sum, l) => sum + l.stock, 0));
  protected readonly totalValue = computed(() =>
    round2(this.lines().reduce((sum, l) => sum + (l.value ?? 0), 0)),
  );

  constructor() {
    this.store.load();
    effect(() => {
      if (this.data.error()) void this.router.navigate(['/inventory']);
    });
  }
}
