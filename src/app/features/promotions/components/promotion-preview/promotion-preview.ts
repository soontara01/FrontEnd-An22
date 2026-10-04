import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { PromotionPayload } from '@core/models';
import { MATERIAL } from '@shared/material';
import {
  billDiscountPreview,
  discountPreview,
  freeGoodsPreview,
} from '../../data/promotion-preview';
import { PromotionsStore } from '../../data/promotions.store';

/** Today's effect of a promotion: discounted prices / margins, free-goods cost, bill discount. */
@Component({
  selector: 'app-promotion-preview',
  imports: [CurrencyPipe, DecimalPipe, MATERIAL],
  templateUrl: './promotion-preview.html',
  styleUrl: './promotion-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromotionPreview {
  private readonly store = inject(PromotionsStore);

  readonly promotion = input.required<PromotionPayload>();

  protected readonly discountRows = computed(() =>
    discountPreview(this.promotion(), this.store.products(), this.store.categories()),
  );
  protected readonly freeGoods = computed(() =>
    freeGoodsPreview(this.promotion(), this.store.products(), this.store.categories()),
  );
  protected readonly bill = computed(() => billDiscountPreview(this.promotion()));

  protected readonly belowCostCount = computed(
    () =>
      this.discountRows().filter((r) => r.belowCost).length +
      (this.freeGoods()?.rows.filter((r) => r.margin !== null && r.margin < 0).length ?? 0),
  );
  protected readonly noPriceCount = computed(
    () =>
      [...this.discountRows(), ...(this.freeGoods()?.rows ?? [])].filter((r) => r.price === null)
        .length,
  );
}
