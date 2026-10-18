import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import {
  BRANCH_DEFAULTS,
  Branch,
  COMPANY_INFO_DEFAULTS,
  branchDetailsError,
  companyInfoError,
  normalizeBranch,
  normalizeCompanyInfo,
  storeInfoOf,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { Receipt } from '@shared/components/receipt/receipt';
import { TaxInvoiceDocument } from '@shared/components/tax-invoice/tax-invoice-document';
import { TaxInvoiceSlip } from '@shared/components/tax-invoice/tax-invoice-slip';
import { MATERIAL } from '@shared/material';
import { httpErrorShown } from '@core/http/http-error-shown';
import { SettingsApi } from '../../data/settings-api.service';
import { SAMPLE_INVOICE, SAMPLE_SALE } from './sample-sale';

/**
 * What documents print, in two parts (E11): the company (seller, VAT, shared rules incl. shifts —
 * company admins edit) and this branch (business-place name, address, phone, receipt footer —
 * the branch's admins edit), with a live preview of the receipt or the full tax invoice.
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
  /** A company admin may change the company part (E6) */
  readonly companyEditable = input(false);
  /** An admin of this branch may change its details */
  readonly branchEditable = input(false);

  private readonly api = inject(SettingsApi);
  private readonly notify = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly sample = SAMPLE_SALE;
  protected readonly sampleInvoice = SAMPLE_INVOICE;
  protected readonly companyLoaded = signal(false);
  protected readonly branchLoaded = signal(false);
  protected readonly savingCompany = signal(false);
  protected readonly savingBranch = signal(false);
  /** Code / number / status of this branch (edited in ข้อมูลหลัก → สาขา) */
  protected readonly branch = signal<Branch | null>(null);

  protected readonly company = this.fb.group({
    name: '',
    vatRegistered: true,
    taxId: '',
    taxInvoicePaper: COMPANY_INFO_DEFAULTS.taxInvoicePaper,
    exchangeDays: COMPANY_INFO_DEFAULTS.exchangeDays,
    manualDiscountMaxPercent: COMPANY_INFO_DEFAULTS.manualDiscountMaxPercent,
    requireShift: COMPANY_INFO_DEFAULTS.requireShift,
    shiftVarianceLimit: COMPANY_INFO_DEFAULTS.shiftVarianceLimit,
    shiftMaxHours: COMPANY_INFO_DEFAULTS.shiftMaxHours,
    staffSeeCost: COMPANY_INFO_DEFAULTS.staffSeeCost,
  });

  protected readonly details = this.fb.group({
    name: '',
    address: '',
    phone: '',
    receiptFooter: BRANCH_DEFAULTS.receiptFooter,
  });

  private readonly companyValue = toSignal(this.company.valueChanges, {
    initialValue: this.company.value,
  });
  private readonly detailsValue = toSignal(this.details.valueChanges, {
    initialValue: this.details.value,
  });
  protected readonly companyInfo = computed(() =>
    normalizeCompanyInfo({ ...COMPANY_INFO_DEFAULTS, ...this.companyValue() }),
  );
  protected readonly branchDetails = computed(() =>
    normalizeBranch({ ...BRANCH_DEFAULTS, name: '', ...this.detailsValue() }),
  );
  protected readonly companyProblem = computed(() => companyInfoError(this.companyInfo()));
  protected readonly branchProblem = computed(() => branchDetailsError(this.branchDetails()));
  /** What the documents of this branch print */
  protected readonly info = computed(() =>
    storeInfoOf(this.companyInfo(), {
      ...this.branchDetails(),
      branchNo: this.branch()?.branchNo ?? '00000',
    }),
  );

  protected readonly previewPick = signal<'receipt' | 'invoice'>('receipt');
  /** A store without VAT registration issues no full tax invoice → receipt only */
  protected readonly preview = computed(() =>
    this.info().vatRegistered ? this.previewPick() : 'receipt',
  );
  protected readonly paperLabel = computed(() =>
    this.info().taxInvoicePaper === 'A4' ? 'A4' : '80 มม.',
  );

  constructor() {
    this.api.companyInfo().subscribe({
      next: (info) => {
        this.company.reset(info);
        this.companyLoaded.set(true);
        if (!this.companyEditable()) this.company.disable();
      },
      error: httpErrorShown,
    });
    this.api.branch().subscribe({
      next: (branch) => this.setBranch(branch),
      error: httpErrorShown,
    });
  }

  protected saveCompany(): void {
    if (this.companyProblem() || this.savingCompany() || !this.companyEditable()) return;
    this.savingCompany.set(true);
    this.api.saveCompanyInfo(this.companyInfo()).subscribe({
      next: (info) => {
        this.company.reset(info);
        this.savingCompany.set(false);
        this.notify.success('บันทึกข้อมูลบริษัทแล้ว');
      },
      error: () => this.savingCompany.set(false),
    });
  }

  protected saveBranch(): void {
    if (this.branchProblem() || this.savingBranch() || !this.branchEditable()) return;
    this.savingBranch.set(true);
    this.api.saveBranch(this.branchDetails()).subscribe({
      next: (branch) => {
        this.setBranch(branch);
        this.savingBranch.set(false);
        this.notify.success('บันทึกข้อมูลสาขาแล้ว');
      },
      error: () => this.savingBranch.set(false),
    });
  }

  private setBranch(branch: Branch): void {
    this.branch.set(branch);
    this.details.reset(branch);
    this.branchLoaded.set(true);
    if (!this.branchEditable()) this.details.disable();
  }
}
