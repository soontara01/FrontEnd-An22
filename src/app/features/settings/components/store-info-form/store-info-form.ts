import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { StoreInfo, STORE_INFO_DEFAULTS, normalizeStoreInfo, storeInfoError } from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { Receipt } from '@shared/components/receipt/receipt';
import { TaxInvoiceDocument } from '@shared/components/tax-invoice/tax-invoice-document';
import { TaxInvoiceSlip } from '@shared/components/tax-invoice/tax-invoice-slip';
import { MATERIAL } from '@shared/material';
import { httpErrorShown } from '@core/http/http-error-shown';
import { SettingsApi } from '../../data/settings-api.service';
import { SAMPLE_INVOICE, SAMPLE_SALE } from './sample-sale';

/**
 * Store details printed on POS receipts, with a live preview of the receipt or the full tax
 * invoice on the selected paper. Admins only may edit.
 */
@Component({
  selector: 'app-store-info-form',
  imports: [
    ReactiveFormsModule,
    MatButtonToggleModule,
    Receipt,
    TaxInvoiceDocument,
    TaxInvoiceSlip,
    MATERIAL,
  ],
  templateUrl: './store-info-form.html',
  styleUrl: './store-info-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreInfoForm {
  /** Only admins may change the receipt details */
  readonly editable = input(false);

  private readonly api = inject(SettingsApi);
  private readonly notify = inject(NotificationService);

  protected readonly sample = SAMPLE_SALE;
  protected readonly sampleInvoice = SAMPLE_INVOICE;
  protected readonly loaded = signal(false);
  protected readonly saving = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: '',
    placeName: '',
    vatRegistered: true,
    taxId: '',
    branchType: STORE_INFO_DEFAULTS.branchType,
    branchNo: '',
    address: '',
    phone: '',
    receiptFooter: '',
    taxInvoicePaper: STORE_INFO_DEFAULTS.taxInvoicePaper,
    exchangeDays: STORE_INFO_DEFAULTS.exchangeDays,
    manualDiscountMaxPercent: STORE_INFO_DEFAULTS.manualDiscountMaxPercent,
    requireShift: STORE_INFO_DEFAULTS.requireShift,
    shiftVarianceLimit: STORE_INFO_DEFAULTS.shiftVarianceLimit,
    shiftMaxHours: STORE_INFO_DEFAULTS.shiftMaxHours,
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  protected readonly info = computed(() =>
    normalizeStoreInfo({ ...STORE_INFO_DEFAULTS, ...this.value() } as StoreInfo),
  );
  protected readonly problem = computed(() => storeInfoError(this.info()));

  protected readonly previewPick = signal<'receipt' | 'invoice'>('receipt');
  /** A store without VAT registration issues no full tax invoice → receipt only */
  protected readonly preview = computed(() =>
    this.info().vatRegistered ? this.previewPick() : 'receipt',
  );
  protected readonly paperLabel = computed(() =>
    this.info().taxInvoicePaper === 'A4' ? 'A4' : '80 มม.',
  );

  constructor() {
    this.api.storeInfo().subscribe({
      next: (info) => {
        this.form.reset(info);
        this.loaded.set(true);
        if (!this.editable()) this.form.disable();
      },
      error: httpErrorShown,
    });
  }

  protected save(): void {
    if (this.problem() || this.saving() || !this.editable()) return;
    this.saving.set(true);
    this.api.saveStoreInfo(this.info()).subscribe({
      next: (info) => {
        this.form.reset(info);
        this.saving.set(false);
        this.notify.success('บันทึกข้อมูลร้านแล้ว');
      },
      error: () => this.saving.set(false),
    });
  }
}
