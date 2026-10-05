import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, filter, map, switchMap } from 'rxjs';
import {
  BuyerIdType,
  EMPTY_BUYER,
  TaxInvoice,
  TaxInvoiceBuyer,
  defaultBuyerBranch,
  buyerIdError,
  isPassportBuyer,
  normalizeBuyerId,
  normalizeBuyer,
  reissueError,
  taxInvoiceError,
} from '@core/models';
import { AuthService } from '@core/auth/auth.service';
import { NotificationService } from '@core/services/notification.service';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { TaxInvoiceDocument } from '@shared/components/tax-invoice/tax-invoice-document';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { SalesStore } from '../../data/sales.store';

/**
 * Issues the full tax invoice of a bill (`/sales/:id/tax-invoice`): buyer details (filled from
 * the last invoice with the same tax ID) with a live A4 preview. With `?reissue=1` (admins) it
 * cancels the valid invoice with a reason and issues a corrected one (`reissueError()`). Saving goes
 * back to the bill page, which prints the original.
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
  private readonly auth = inject(AuthService);

  /** Route param (withComponentInputBinding). */
  readonly id = input.required<string>();
  /** Query param `reissue=1`: cancel the valid invoice and issue a corrected one */
  readonly reissue = input<string>();

  protected readonly isReissue = computed(() => !!this.reissue());
  protected readonly quickReasons = [
    'ชื่อผู้ซื้อผิด',
    'เลขประจำตัวผู้เสียภาษีผิด',
    'ที่อยู่/สาขาผิด',
  ];
  protected readonly reason = signal('');
  /** The invoice being replaced (reissue mode only). */
  protected readonly current = rxResource({
    params: () => (this.isReissue() ? Number(this.id()) : undefined),
    stream: ({ params }) => this.store.taxInvoiceOf(params),
  });
  private prefilled = false;

  protected readonly sale = rxResource({
    params: () => Number(this.id()),
    stream: ({ params }) => this.store.get(params),
  });
  protected readonly saving = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    ...EMPTY_BUYER,
    idType: 'tax_id' as BuyerIdType,
  });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  protected readonly buyer = computed(() =>
    normalizeBuyer({ ...EMPTY_BUYER, ...this.value() } as TaxInvoiceBuyer),
  );
  /** Foreign buyer identified by passport (no branch). */
  protected readonly passport = computed(() => isPassportBuyer(this.buyer()));
  private readonly idType = () => this.form.controls.idType.value;
  protected readonly problem = computed(() => {
    const info = this.store.storeInfo();
    if (!this.sale.hasValue() || !info) return null;
    if (this.isReissue()) {
      if (this.auth.user()?.role !== 'admin')
        return 'เฉพาะผู้ดูแลระบบ (admin) ยกเลิกใบกำกับภาษีได้';
      if (!this.current.hasValue()) return null;
      return reissueError(this.sale.value(), this.current.value(), this.buyer(), this.reason());
    }
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
      date: s.date,
      issuedAt: new Date().toISOString(),
      buyer: this.buyer(),
      issuedBy: s.cashier,
      cancelledAt: null,
      cancelReason: '',
      replacesInvoiceNo: this.isReissue() ? (this.current.value()?.invoiceNo ?? null) : null,
      replacedByNo: null,
      atSale: this.isReissue() ? (this.current.value()?.atSale ?? false) : false,
    };
  });

  constructor() {
    this.store.loadLookups();
    effect(() => {
      if (this.sale.error()) void this.router.navigate(['/sales']);
    });
    // Reissue: start from the current buyer details, to correct them.
    effect(() => {
      const current = this.current.value();
      if (this.prefilled || !current) return;
      this.prefilled = true;
      this.form.reset({ ...EMPTY_BUYER, ...current.buyer });
    });
    // New buyer: suggest head office for a company tax ID, none for a national ID, until the
    // user picks one (reissue keeps the current choice).
    const branch = this.form.controls.branchType;
    this.form.controls.taxId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(
        (id) =>
          this.isReissue() ||
          branch.dirty ||
          this.idType() === 'passport' ||
          branch.setValue(defaultBuyerBranch(id)),
      );
    // A known tax ID / passport fills the rest from the last invoice issued to that buyer.
    this.form.controls.taxId.valueChanges
      .pipe(
        map((id) => normalizeBuyerId(this.idType(), id)),
        debounceTime(300),
        distinctUntilChanged(),
        filter((id) => !buyerIdError(this.idType(), id)),
        switchMap((id) => this.store.buyerByTaxId(id)),
        filter((found): found is TaxInvoiceBuyer => !!found),
      )
      .subscribe((found) => {
        if (isPassportBuyer(found) === this.passport() && !this.form.controls.name.value.trim()) {
          this.form.patchValue({ ...found, taxId: this.form.controls.taxId.value });
          this.notify.info('เติมข้อมูลผู้ซื้อจากใบกำกับภาษีครั้งก่อน');
        }
      });
  }

  protected save(): void {
    if (!this.sale.hasValue() || this.problem() || this.saving()) return;
    const sale = this.sale.value();
    this.saving.set(true);
    const request = this.isReissue()
      ? this.store.reissueTaxInvoice(sale.id, this.buyer(), this.reason().trim())
      : this.store.issueTaxInvoice(sale.id, this.buyer());
    request.subscribe({
      next: (invoice) => {
        this.notify.success(`ออกใบกำกับภาษี ${invoice.invoiceNo} แล้ว`);
        void this.router.navigate(['/sales', sale.id], { queryParams: { printInv: 1 } });
      },
      error: () => this.saving.set(false),
    });
  }
}
