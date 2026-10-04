import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Router, RouterLink } from '@angular/router';
import {
  MOVEMENT_TYPE_LABEL,
  MovementType,
  StockMovement,
  addDaysIso,
  formatDateRange,
  fromIsoDate,
  toIsoDate,
  todayIso,
} from '@core/models';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { InventoryStore } from '../../data/inventory.store';

const TYPE_BADGE: Record<MovementType, string> = {
  opening: '',
  receive: 'badge-success',
  issue: 'badge-warn',
};

type Preset = 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'all';

interface Range {
  from: string | null;
  to: string | null;
}

const firstOfMonth = (iso: string): string => `${iso.slice(0, 7)}-01`;

/** Local-date range for a preset ('all' = unbounded). */
function presetRange(preset: Preset, today = todayIso()): Range {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'last7':
      return { from: addDaysIso(today, -6), to: today };
    case 'thisMonth':
      return { from: firstOfMonth(today), to: today };
    case 'lastMonth': {
      const lastDay = addDaysIso(firstOfMonth(today), -1);
      return { from: firstOfMonth(lastDay), to: lastDay };
    }
    case 'all':
      return { from: null, to: null };
  }
}

/**
 * Stock card (inventory ledger) of one SKU for a date range
 * (`/inventory/stock-card/:productId?from=YYYY-MM-DD&to=YYYY-MM-DD`, or `?all=1`).
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

  /** Route param + query params (withComponentInputBinding). */
  readonly productId = input.required<string>();
  readonly from = input<string>();
  readonly to = input<string>();
  readonly all = input<string>();

  protected readonly presets: { id: Preset; label: string }[] = [
    { id: 'today', label: 'วันนี้' },
    { id: 'last7', label: '7 วันล่าสุด' },
    { id: 'thisMonth', label: 'เดือนนี้' },
    { id: 'lastMonth', label: 'เดือนก่อน' },
    { id: 'all', label: 'ทั้งหมด' },
  ];

  /** Effective range from the URL; no params → this month. */
  protected readonly range = computed<Range>(() => {
    if (this.all()) return presetRange('all');
    if (!this.from() && !this.to()) return presetRange('thisMonth');
    return { from: this.from() || null, to: this.to() || null };
  });

  protected readonly activePreset = computed<Preset | null>(() => {
    const r = this.range();
    return (
      this.presets.find((p) => {
        const pr = presetRange(p.id);
        return pr.from === r.from && pr.to === r.to;
      })?.id ?? null
    );
  });

  protected readonly rangeText = computed(() => {
    const { from, to } = this.range();
    if (!from && !to) return 'ทั้งหมด';
    if (from && to) return formatDateRange({ startDate: from, endDate: to });
    return from ? `ตั้งแต่ ${formatDateRange({ startDate: from, endDate: null })}` : `ถึง ${to}`;
  });

  protected readonly card = rxResource({
    params: () => ({ id: Number(this.productId()), ...this.range() }),
    stream: ({ params }) =>
      this.store.movements(params.id, params.from ?? undefined, params.to ?? undefined),
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
    effect(() => {
      if (this.card.error()) void this.router.navigate(['/inventory']);
    });
  }

  protected applyPreset(preset: Preset): void {
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
