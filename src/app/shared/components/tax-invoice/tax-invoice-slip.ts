import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Sale, StoreInfo, TaxInvoice, branchLabel, invoiceTotals } from '@core/models';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { bahtText } from '@shared/utils/baht-text';

/**
 * 80 mm full tax invoice for the receipt printer (same content as the A4 `TaxInvoiceDocument`,
 * receipt layout; print with `printElement(el)`).
 */
@Component({
  selector: 'app-tax-invoice-slip',
  imports: [DecimalPipe, ThaiDatePipe],
  templateUrl: './tax-invoice-slip.html',
  styleUrl: '../receipt/receipt.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaxInvoiceSlip {
  readonly sale = input.required<Sale>();
  readonly invoice = input.required<TaxInvoice>();
  readonly store = input.required<StoreInfo>();
  /** false = ต้นฉบับ (original), true = สำเนา (copy) */
  readonly copy = input(false);

  protected readonly sellerBranch = computed(() => branchLabel(this.store()));
  protected readonly buyerBranch = computed(() => branchLabel(this.invoice().buyer));
  protected readonly totals = computed(() => invoiceTotals(this.sale()));
  protected readonly words = computed(() => bahtText(this.sale().total));
}
