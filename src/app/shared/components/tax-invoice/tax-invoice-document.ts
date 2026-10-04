import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Sale, StoreInfo, TaxInvoice, branchLabel, round2 } from '@core/models';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { bahtText } from '@shared/utils/baht-text';

/**
 * A4 full tax invoice / receipt of a POS bill (stateless; print with `printElement(el, 'A4')`).
 * Shows everything the Revenue Department requires: seller and buyer names, addresses, tax IDs
 * and branches, document number and date, goods, VAT shown separately, plus the total in words.
 */
@Component({
  selector: 'app-tax-invoice-document',
  imports: [DecimalPipe, ThaiDatePipe],
  templateUrl: './tax-invoice-document.html',
  styleUrl: './tax-invoice-document.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaxInvoiceDocument {
  readonly sale = input.required<Sale>();
  readonly invoice = input.required<TaxInvoice>();
  readonly store = input.required<StoreInfo>();
  /** false = ต้นฉบับ (original), true = สำเนา (copy) */
  readonly copy = input(false);

  protected readonly sellerBranch = computed(() => branchLabel(this.store()));
  protected readonly buyerBranch = computed(() => branchLabel(this.invoice().buyer));
  protected readonly vatable = computed(() =>
    round2(
      this.sale()
        .lines.filter((l) => l.vatType === 'vat7')
        .reduce((n, l) => n + l.amount, 0),
    ),
  );
  protected readonly exempt = computed(() => round2(this.sale().total - this.vatable()));
  protected readonly words = computed(() => bahtText(this.sale().total));
}
