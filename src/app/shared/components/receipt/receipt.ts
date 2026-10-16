import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  Sale,
  SaleLine,
  StoreInfo,
  branchLabel,
  isFreeLine,
  receiptTitle,
  round2,
} from '@core/models';
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
  protected readonly isFreeLine = isFreeLine;
  readonly sale = input.required<Sale>();
  readonly store = input.required<StoreInfo>();
  /** Reprint: marks the receipt as a copy */
  readonly copy = input(false);

  /**
   * An abbreviated tax invoice only when the bill was sold while VAT-registered (its snapshot, B20;
   * older bills without one follow the store), so a reprint after the status changed matches.
   */
  protected readonly withVat = computed(
    () => this.sale().vatRegistered ?? this.store().vatRegistered,
  );
  /** Once a full tax invoice exists for the bill, this slip is only a receipt referring to it. */
  protected readonly title = computed(() =>
    this.sale().taxInvoiceNo ? 'ใบเสร็จรับเงิน' : receiptTitle({ vatRegistered: this.withVat() }),
  );
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
