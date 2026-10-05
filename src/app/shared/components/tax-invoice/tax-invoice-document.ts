import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  Sale,
  StoreInfo,
  TaxInvoice,
  branchLabel,
  buyerBranchLabel,
  invoiceTotals,
} from '@core/models';
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
  protected readonly buyerBranch = computed(() => buyerBranchLabel(this.invoice().buyer));
  protected readonly totals = computed(() => invoiceTotals(this.sale()));
  protected readonly words = computed(() => bahtText(this.sale().total));
}
