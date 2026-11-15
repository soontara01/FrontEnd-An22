import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import {
  HEAD_OFFICE_BRANCH_NO,
  PLANS,
  PlanId,
  SignupPayload,
  TRIAL_DAYS,
  signupError,
} from '@core/models';
import type { MfaSetup } from '@core/models/auth.model';
import { environment } from '@env/environment';
import { MfaCodeStep } from '@shared/components/mfa-setup/mfa-code-step';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';

/**
 * Signing a new company up (E37): company, first branch, owner and package → a `TRIAL_DAYS` trial,
 * then the owner sets up Microsoft Authenticator (QR + first code, E57) and is logged in. Same rule
 * as the server (`signupError()`); a taken code is the server's.
 */
@Component({
  selector: 'app-signup',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatRadioModule,
    AutofocusDirective,
    MfaCodeStep,
    MATERIAL,
  ],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Signup {
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);

  protected readonly plans = PLANS;
  protected readonly trialDays = TRIAL_DAYS;
  protected readonly submitting = signal(false);
  protected readonly touched = signal(false);
  protected readonly hidePassword = signal(true);
  /** After the company is created: the owner's Authenticator setup (E57) */
  protected readonly setup = signal<MfaSetup | null>(null);
  protected readonly demoSecret = signal<string | null>(null);
  private readonly codeStep = viewChild(MfaCodeStep);

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
    password: [''],
    planId: ['starter' as PlanId],
  });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  private readonly payload = computed<SignupPayload>(() => {
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
      owner: { name: v.ownerName, username: v.username, email: v.email, password: v.password },
      planId: v.planId,
    };
  });
  protected readonly problem = computed(() => signupError(this.payload()));

  protected submit(): void {
    this.touched.set(true);
    if (this.problem() || this.submitting()) return;
    this.submitting.set(true);
    this.auth.signup(this.payload()).subscribe({
      next: (challenge) => {
        this.submitting.set(false);
        // The company exists now: from here only the code step (a new signup = a new code).
        this.setup.set(challenge.mfa === 'setup' ? challenge.setup : null);
        if (environment.useMock) {
          this.demoSecret.set((challenge as { demoSecret?: string }).demoSecret ?? null);
        }
      },
      error: () => this.submitting.set(false),
    });
  }

  protected submitCode(code: string): void {
    this.submitting.set(true);
    this.auth.verifyMfa(code).subscribe({
      // Full page reload into the main app (SPA per menu); one branch → chosen automatically
      next: () => this.document.location.assign('/'),
      error: () => {
        this.submitting.set(false);
        this.codeStep()?.reset();
      },
    });
  }

  /** Leaving the code step: the company is created — the owner logs in later (QR again). */
  protected toLogin(): void {
    this.document.location.assign('/auth/login');
  }

  protected account(): string {
    const v = this.form.getRawValue();
    return `${v.companyCode.trim().toUpperCase()}:${v.username.trim().toLowerCase()}`;
  }
}
