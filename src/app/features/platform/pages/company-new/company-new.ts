import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { RouterLink } from '@angular/router';
import {
  HEAD_OFFICE_BRANCH_NO,
  MAX_TRIAL_DAYS,
  NewCompanyPayload,
  NewCompanyResult,
  PLANS,
  PlanId,
  TRIAL_DAYS,
  newCompanyError,
} from '@core/models';
import { PageHeader } from '@shared/components/page-header/page-header';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { SetupLinkCard } from '../../components/setup-link-card/setup-link-card';
import { PlatformApi } from '../../data/platform-api.service';

/**
 * A new company, created by the platform (E59 — nobody signs up by themselves): company, first
 * branch, owner (no password), package and trial days. Then the owner's setup link to pass on.
 * Same rule as the server (`newCompanyError()`); a taken code is the server's.
 */
@Component({
  selector: 'app-company-new',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatRadioModule,
    AutofocusDirective,
    PageHeader,
    SetupLinkCard,
    MATERIAL,
  ],
  templateUrl: './company-new.html',
  styleUrl: './company-new.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CompanyNew {
  private readonly api = inject(PlatformApi);

  protected readonly plans = PLANS;
  protected readonly maxTrialDays = MAX_TRIAL_DAYS;
  protected readonly submitting = signal(false);
  protected readonly touched = signal(false);
  /** The company once created, with the owner's setup link (shown once) */
  protected readonly created = signal<NewCompanyResult | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    companyCode: [''],
    companyName: [''],
    taxId: [''],
    vatRegistered: [true],
    branchCode: ['HQ'],
    branchName: ['สำนักงานใหญ่'],
    branchNo: [HEAD_OFFICE_BRANCH_NO],
    address: [''],
    phone: [''],
    ownerName: [''],
    username: [''],
    email: [''],
    planId: ['starter' as PlanId],
    // Typed as text: an empty field must not become a silent 0 (= no trial).
    trialDays: [String(TRIAL_DAYS)],
  });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  private readonly trialText = computed(() => {
    this.value();
    return this.form.getRawValue().trialDays.trim();
  });
  private readonly payload = computed<NewCompanyPayload>(() => {
    this.value();
    const v = this.form.getRawValue();
    return {
      companyCode: v.companyCode,
      companyName: v.companyName,
      taxId: v.taxId,
      vatRegistered: v.vatRegistered,
      branch: {
        code: v.branchCode,
        name: v.branchName,
        branchNo: v.branchNo,
        address: v.address,
        phone: v.phone,
      },
      owner: { name: v.ownerName, username: v.username, email: v.email },
      planId: v.planId,
      trialDays: this.trialText() === '' ? Number.NaN : Number(this.trialText()),
    };
  });
  protected readonly problem = computed(() =>
    this.trialText() === '' ? 'กรุณากรอกจำนวนวันทดลองใช้' : newCompanyError(this.payload()),
  );
  protected readonly noTrial = computed(() => this.payload().trialDays === 0);

  protected submit(): void {
    this.touched.set(true);
    if (this.problem() || this.submitting()) return;
    this.submitting.set(true);
    this.api.createCompany(this.payload()).subscribe({
      next: (result) => {
        this.submitting.set(false);
        this.created.set(result);
      },
      error: () => this.submitting.set(false),
    });
  }
}
