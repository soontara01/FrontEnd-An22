import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MOVEMENT_TYPE_LABEL, MovementType, StockMovement, costValue } from '@core/models';
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

/** Stock card (inventory ledger with running cost balance) of one SKU. */
@Component({
  selector: 'app-stock-card',
  imports: [DecimalPipe, RouterLink, PageHeader, StatCard, LoadingSpinner, ThaiDatePipe, MATERIAL],
  templateUrl: './stock-card.html',
  styleUrl: './stock-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class StockCard implements OnInit {
  protected readonly store = inject(InventoryStore);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  /** Bound from the `:productId` route param. */
  readonly productId = input.required<string>();

  protected readonly loading = signal(true);
  protected readonly movements = signal<StockMovement[]>([]);

  protected readonly product = computed(() =>
    this.store.products().find((p) => p.id === Number(this.productId())),
  );
  protected readonly value = computed(() => {
    const p = this.product();
    return p ? costValue(p) : 0;
  });
  protected readonly totals = computed(() =>
    this.movements().reduce(
      (t, m) => ({
        inQty: t.inQty + (m.qty > 0 ? m.qty : 0),
        outQty: t.outQty + (m.qty < 0 ? -m.qty : 0),
        outCost: t.outCost + (m.qty < 0 ? -m.totalCost : 0),
      }),
      { inQty: 0, outQty: 0, outCost: 0 },
    ),
  );

  ngOnInit(): void {
    this.store.load();
    this.store.movements(Number(this.productId())).subscribe({
      next: (movements) => {
        this.movements.set(movements);
        this.loading.set(false);
      },
      error: () => void this.router.navigate(['/inventory']),
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
}
