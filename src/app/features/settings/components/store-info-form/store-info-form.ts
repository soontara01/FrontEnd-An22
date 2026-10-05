import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { StoreInfo, STORE_INFO_DEFAULTS, normalizeStoreInfo, storeInfoError } from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { Receipt } from '@shared/components/receipt/receipt';
import { MATERIAL } from '@shared/material';
import { SettingsApi } from '../../data/settings-api.service';
import { SAMPLE_SALE } from './sample-sale';

/** Store details printed on POS receipts, with a live receipt preview. Admins only may edit. */
@Component({
  selector: 'app-store-info-form',
  imports: [ReactiveFormsModule, MatButtonToggleModule, Receipt, MATERIAL],
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
    posId: '',
    receiptFooter: '',
    taxInvoicePaper: STORE_INFO_DEFAULTS.taxInvoicePaper,
    exchangeDays: STORE_INFO_DEFAULTS.exchangeDays,
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  protected readonly info = computed(() =>
    normalizeStoreInfo({ ...STORE_INFO_DEFAULTS, ...this.value() } as StoreInfo),
  );
  protected readonly problem = computed(() => storeInfoError(this.info()));

  constructor() {
    this.api.storeInfo().subscribe((info) => {
      this.form.reset(info);
      this.loaded.set(true);
      if (!this.editable()) this.form.disable();
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
