import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Exchange, Sale, StoreInfo, branchLabel, warrantyEnd } from '@core/models';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';

/**
 * 80 mm exchange slip (ใบเปลี่ยนสินค้า) referring to the original bill; same look as `Receipt`.
 * No amounts: the price does not change. Serial lines show the warranty end, still counted from
 * the original sale day.
 */
@Component({
  selector: 'app-exchange-receipt',
  imports: [ThaiDatePipe],
  templateUrl: './exchange-receipt.html',
  styleUrl: './receipt.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExchangeReceipt {
  readonly exchange = input.required<Exchange>();
  /** The original bill (warranty months per line) */
  readonly sale = input.required<Sale>();
  readonly store = input.required<StoreInfo>();

  protected readonly branch = computed(() => branchLabel(this.store()));

  /** Last warranty day of an exchanged line ('YYYY-MM-DD'), null = no warranty. */
  protected warrantyUntil(saleLineIndex: number): string | null {
    const line = this.sale().lines[saleLineIndex];
    return line ? warrantyEnd(this.sale(), line.warrantyMonths) : null;
  }
}
