import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { rxResource } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Router, RouterLink } from '@angular/router';
import {
  MOVEMENT_TYPE_LABEL,
  MovementType,
  StockMovement,
  formatDateRange,
  fromIsoDate,
  toIsoDate,
} from '@core/models';
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
import { AuthService } from '@core/auth/auth.service';
import { NotificationService } from '@core/services/notification.service';
import { InventoryStore } from '../../data/inventory.store';

const TYPE_BADGE: Record<MovementType, string> = {
  opening: '',
  receive: 'badge-success',
  issue: 'badge-warn',
  transfer_out: 'badge-warn',
  transfer_in: 'badge-success',
};

/**
 * Stock card (inventory ledger) of one SKU for a date range
 * (`/inventory/stock-card/:productId?from=YYYY-MM-DD&to=YYYY-MM-DD`, at most 366 days).
 * The range lives in the URL so reload / print / shared links keep it; default = this month.
 */
@Component({
  selector: 'app-stock-card',
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    MatDatepickerModule,
    PageHeader,
    StatCard,
    LoadingSpinner,
    ThaiDatePipe,
    MATERIAL,
  ],
  templateUrl: './stock-card.html',
  styleUrl: './stock-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class StockCard {
  protected readonly store = inject(InventoryStore);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly notify = inject(NotificationService);

  /** Route param + query params (withComponentInputBinding). */
  readonly productId = input.required<string>();
  readonly from = input<string>();
  readonly to = input<string>();
  /** Query param: another branch the user works in (E15); none = the working branch */
  readonly branch = input<string>();

  protected readonly presets = DATE_PRESETS;
  private readonly auth = inject(AuthService);
  /** Cost columns / values only for who may see cost (E43). */
  protected readonly canSeeCost = this.auth.canSeeCost;
  /** Branches whose card the user may open; the picker shows when there is more than one. */
  protected readonly branches = this.auth.branches;
  /** The card is always one branch's (D1, E15). */
  protected readonly branchId = computed(
    () => Number(this.branch()) || this.auth.currentBranch()?.id || 0,
  );
  protected readonly branchCode = computed(
    () => this.branches().find((b) => b.id === this.branchId())?.code ?? '',
  );

  /** Effective range from the URL; no params → this month. */
  protected readonly range = computed<DateRange>(() => {
    if (!this.from() && !this.to()) return presetRange('thisMonth');
    return { from: this.from() || null, to: this.to() || null };
  });

  protected readonly activePreset = computed(() => matchingPreset(this.range()));

  protected readonly rangeText = computed(() => {
    const { from, to } = this.range();
    if (from && to) return formatDateRange({ startDate: from, endDate: to });
    return from ? `ตั้งแต่ ${formatDateRange({ startDate: from, endDate: null })}` : `ถึง ${to}`;
  });

  protected readonly card = rxResource({
    params: () => ({ id: Number(this.productId()), branchId: this.branchId(), ...this.range() }),
    stream: ({ params }) =>
      this.store.movements(
        params.id,
        params.from ?? undefined,
        params.to ?? undefined,
        params.branchId || undefined,
      ),
  });

  protected readonly product = computed(() =>
    this.store.products().find((p) => p.id === Number(this.productId())),
  );

  /** Picker form, kept in sync with the URL range. */
  protected readonly rangeForm = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  constructor() {
    this.store.load();
    effect(() => {
      const { from, to } = this.range();
      this.rangeForm.setValue(
        { start: from ? fromIsoDate(from) : null, end: to ? fromIsoDate(to) : null },
        { emitEvent: false },
      );
    });
    // A SKU / branch that cannot be opened → back to the list; a refused range (400, the snackbar
    // says why) stays here to be fixed (V2-U-11).
    effect(() => {
      const error = this.card.error();
      if (error && !(error instanceof HttpErrorResponse && error.status === 400)) {
        void this.router.navigate(['/inventory']);
      }
    });
  }

  protected applyPreset(preset: DatePreset): void {
    const { from, to } = presetRange(preset);
    this.navigate({ all: null, from, to });
  }

  protected search(): void {
    const { start, end } = this.rangeForm.getRawValue();
    if (start && end && start > end) {
      this.notify.error('วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
      return;
    }
    this.navigate({
      from: start ? toIsoDate(start) : null,
      to: end ? toIsoDate(end) : null,
    });
  }

  protected selectBranch(id: number): void {
    this.navigate({ branch: id === this.auth.currentBranch()?.id ? null : String(id) });
  }

  protected typeText(m: StockMovement): string {
    return MOVEMENT_TYPE_LABEL[m.type];
  }

  protected typeBadge(m: StockMovement): string {
    return TYPE_BADGE[m.type];
  }

  protected print(): void {
    this.document.defaultView?.print();
  }

  /** Same page, new query params (SPA navigation inside the Inventory menu). */
  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge' });
  }
}
