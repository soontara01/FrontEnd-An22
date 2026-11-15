import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { isMfaChallenge, type MfaSetup } from '@core/models/auth.model';
import { environment } from '@env/environment';
import { MfaCodeStep } from '@shared/components/mfa-setup/mfa-code-step';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';

/**
 * Login by company code + username + password (D4). The device remembers the company code, so
 * after the first login it shows as text with "เปลี่ยน" instead of a field.
 *
 * Always two steps (E57): the password, then the Microsoft Authenticator code — the QR to set it
 * up on the first login (`setup`).
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AutofocusDirective, MfaCodeStep, MATERIAL],
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
  protected readonly hidePassword = signal(true);
  protected readonly submitting = signal(false);
  /** Show the company code field: nothing remembered yet, or "เปลี่ยน" pressed. */
  protected readonly editCompany = signal(!this.auth.companyCode());
  /** The password step, or the Authenticator code the server asked for. */
  protected readonly step = signal<'password' | 'code'>('password');
  protected readonly setup = signal<MfaSetup | null>(null);
  /** Mock only: the secret it sends along, to show the current code */
  protected readonly demoSecret = signal<string | null>(null);
  private readonly codeStep = viewChild(MfaCodeStep);

  protected readonly form = inject(NonNullableFormBuilder).group({
    companyCode: [this.auth.companyCode(), Validators.required],
    username: [this.demo ? 'admin' : '', Validators.required],
    password: ['', Validators.required],
  });

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
    this.auth.login(this.form.getRawValue()).subscribe({
      next: (result) => {
        this.submitting.set(false);
        if (!isMfaChallenge(result)) {
          this.enter();
          return;
        }
        this.setup.set(result.mfa === 'setup' ? result.setup : null);
        this.demoSecret.set(
          this.demo ? ((result as { demoSecret?: string }).demoSecret ?? null) : null,
        );
        this.step.set('code');
      },
      error: () => this.submitting.set(false),
    });
  }

  protected submitCode(code: string): void {
    this.submitting.set(true);
    this.auth.verifyMfa(code).subscribe({
      next: () => this.enter(),
      error: () => {
        this.submitting.set(false);
        this.codeStep()?.reset();
      },
    });
  }

  /** Back to the password (a new login; the waiting one simply expires). */
  protected back(): void {
    this.step.set('password');
    this.setup.set(null);
    this.form.controls.password.reset();
  }

  protected account(): string {
    return `${this.auth.companyCode() || this.form.controls.companyCode.value.toUpperCase()}:${this.form.controls.username.value.trim().toLowerCase()}`;
  }

  /** Full page reload into the main app (SPA per menu). */
  private enter(): void {
    this.document.location.assign('/');
  }
}
