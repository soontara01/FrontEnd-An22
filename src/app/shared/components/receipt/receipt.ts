import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Sale, SaleLine, StoreInfo, branchLabel, receiptTitle, round2 } from '@core/models';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';

/**
 * 80 mm receipt / abbreviated tax invoice of a sale (stateless; print it with `printElement()`).
 * Lines show the receipt name, qty × price, item discounts, serial and warranty; totals split
 * the VAT-able and exempt amounts as the Revenue Department requires.
 */
@Component({
  selector: 'app-receipt',
  imports: [DecimalPipe, ThaiDatePipe],
  templateUrl: './receipt.html',
  styleUrl: './receipt.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Receipt {
  readonly sale = input.required<Sale>();
  readonly store = input.required<StoreInfo>();
  /** Reprint: marks the receipt as a copy */
  readonly copy = input(false);

  protected readonly title = computed(() => receiptTitle(this.store()));
  protected readonly branch = computed(() => branchLabel(this.store()));
  protected readonly vatable = computed(() =>
    round2(this.amountOf(this.sale().lines.filter((l) => l.vatType === 'vat7'))),
  );
  protected readonly exempt = computed(() =>
    round2(this.amountOf(this.sale().lines.filter((l) => l.vatType === 'exempt'))),
  );
  protected readonly paid = computed(() => round2(this.sale().total + this.sale().rounding));

  protected lineGross(line: SaleLine): number {
    return round2(line.unitPrice * line.qty);
  }

  private amountOf(lines: SaleLine[]): number {
    return lines.reduce((sum, l) => sum + l.amount, 0);
  }
}
