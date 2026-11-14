import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { isMfaChallenge, type MfaSetup } from '@core/models/auth.model';
import { isTotpCode, normalizeTotpCode } from '@core/models/totp.model';
import { environment } from '@env/environment';
import { MfaSetupPanel } from '@shared/components/mfa-setup/mfa-setup';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';

/**
 * Login by company code + username + password (D4). The device remembers the company code, so
 * after the first login it shows as text with "เปลี่ยน" instead of a field.
 *
 * Two-step (E55): `/auth/login-mfa` (route data `mfa: true`) always asks the Microsoft
 * Authenticator code after the password; `/auth/login` asks it only when the user has it or the
 * company requires it — the server decides, this page follows its answer (`verify` / `setup`).
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AutofocusDirective, MfaSetupPanel, MATERIAL],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Login {
  protected readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);

  /** Seed logins are hinted (and prefilled) only on the mock — never on a real backend (C3-2). */
  protected readonly demo = environment.useMock;
  /** `?expired=1`: the session ended on the server (401) — said here, not in a snackbar (C3-6). */
  readonly expired = input<string>();
  /** Route data of `/auth/login-mfa` (E55) */
  readonly mfa = input(false);
  protected readonly hidePassword = signal(true);
  protected readonly submitting = signal(false);
  /** Show the company code field: nothing remembered yet, or "เปลี่ยน" pressed. */
  protected readonly editCompany = signal(!this.auth.companyCode());
  /** Password step, or the Authenticator code the server asked for (E55). */
  protected readonly step = signal<'password' | 'verify' | 'setup'>('password');
  protected readonly setup = signal<MfaSetup | null>(null);
  protected readonly title = computed(() =>
    this.mfa() ? 'เข้าสู่ระบบด้วย Microsoft Authenticator' : 'เข้าสู่ระบบ',
  );

  protected readonly form = inject(NonNullableFormBuilder).group({
    companyCode: [this.auth.companyCode(), Validators.required],
    username: [this.demo ? 'admin' : '', Validators.required],
    password: ['', Validators.required],
  });
  /** A group, so the form's `(ngSubmit)` fires (Enter / the button). */
  protected readonly codeForm = inject(NonNullableFormBuilder).group({
    code: [
      '',
      [
        Validators.required,
        (c: { value: string }) => (c.value && !isTotpCode(c.value) ? { format: true } : null),
      ],
    ],
  });
  protected readonly code = this.codeForm.controls.code;

  protected changeCompany(): void {
    this.form.controls.companyCode.setValue('');
    this.editCompany.set(true);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.editCompany.update((edit) => edit || this.form.controls.companyCode.invalid);
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const credentials = { ...this.form.getRawValue(), ...(this.mfa() && { mfa: true }) };
    this.auth.login(credentials).subscribe({
      next: (result) => {
        if (!isMfaChallenge(result)) {
          // Full page reload into the main app (SPA per menu)
          this.document.location.assign('/');
          return;
        }
        this.submitting.set(false);
        this.code.reset();
        this.setup.set(result.mfa === 'setup' ? result.setup : null);
        this.step.set(result.mfa);
      },
      error: () => this.submitting.set(false),
    });
  }

  protected submitCode(): void {
    if (this.code.invalid) {
      this.code.markAsTouched();
      return;
    }
    this.submitting.set(true);
    this.auth.verifyMfa(normalizeTotpCode(this.code.value)).subscribe({
      next: () => this.document.location.assign('/'),
      error: () => {
        this.submitting.set(false);
        this.code.reset();
      },
    });
  }

  /** Back to the password (a new login; the waiting one simply expires). */
  protected back(): void {
    this.step.set('password');
    this.setup.set(null);
    this.form.controls.password.reset();
  }
}
