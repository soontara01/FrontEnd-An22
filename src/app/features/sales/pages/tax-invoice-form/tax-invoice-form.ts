import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs';
import {
  EMPTY_BUYER,
  TaxInvoice,
  TaxInvoiceBuyer,
  isValidThaiTaxId,
  normalizeBuyer,
  taxInvoiceError,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { TaxInvoiceDocument } from '@shared/components/tax-invoice/tax-invoice-document';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { SalesStore } from '../../data/sales.store';

/**
 * Issues the full tax invoice of a bill (`/sales/:id/tax-invoice`): buyer details (filled from
 * the last invoice with the same tax ID) with a live A4 preview. Saving goes back to the bill
 * page, which prints the original.
 */
@Component({
  selector: 'app-tax-invoice-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonToggleModule,
    PageHeader,
    LoadingSpinner,
    TaxInvoiceDocument,
    ThaiDatePipe,
    MATERIAL,
  ],
  templateUrl: './tax-invoice-form.html',
  styleUrl: './tax-invoice-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class TaxInvoiceForm {
  protected readonly store = inject(SalesStore);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  /** Route param (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly sale = rxResource({
    params: () => Number(this.id()),
    stream: ({ params }) => this.store.get(params),
  });
  protected readonly saving = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({ ...EMPTY_BUYER });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  protected readonly buyer = computed(() =>
    normalizeBuyer({ ...EMPTY_BUYER, ...this.value() } as TaxInvoiceBuyer),
  );
  protected readonly problem = computed(() => {
    const info = this.store.storeInfo();
    if (!this.sale.hasValue() || !info) return null;
    return taxInvoiceError(this.sale.value(), this.buyer(), info);
  });

  /** Preview document (number and date are set by the server on save). */
  protected readonly preview = computed<TaxInvoice | null>(() => {
    if (!this.sale.hasValue()) return null;
    const s = this.sale.value();
    return {
      id: 0,
      invoiceNo: 'INV-(ออกเมื่อบันทึก)',
      saleId: s.id,
      orderNo: s.orderNo,
      saleDate: s.date,
      date: new Date().toISOString(),
      buyer: this.buyer(),
      issuedBy: s.cashier,
      cancelledAt: null,
    };
  });

  constructor() {
    this.store.loadLookups();
    effect(() => {
      if (this.sale.error()) void this.router.navigate(['/sales']);
    });
    // A known tax ID fills the rest from the last invoice issued to that buyer.
    this.form.controls.taxId.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        filter((id) => isValidThaiTaxId(id.replace(/[\s-]/g, ''))),
        switchMap((id) => this.store.buyerByTaxId(id.replace(/[\s-]/g, ''))),
        filter((found): found is TaxInvoiceBuyer => !!found),
      )
      .subscribe((found) => {
        if (!this.form.controls.name.value.trim()) {
          this.form.patchValue({ ...found, taxId: this.form.controls.taxId.value });
          this.notify.info('เติมข้อมูลผู้ซื้อจากใบกำกับภาษีครั้งก่อน');
        }
      });
  }

  protected save(): void {
    if (!this.sale.hasValue() || this.problem() || this.saving()) return;
    const sale = this.sale.value();
    this.saving.set(true);
    this.store.issueTaxInvoice(sale.id, this.buyer()).subscribe({
      next: (invoice) => {
        this.notify.success(`ออกใบกำกับภาษี ${invoice.invoiceNo} แล้ว`);
        void this.router.navigate(['/sales', sale.id], { queryParams: { printInv: 1 } });
      },
      error: () => this.saving.set(false),
    });
  }
}
