import { ChangeDetectionStrategy, Component, DOCUMENT, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';

/**
 * Login by company code + username + password (D4). The device remembers the company code, so
 * after the first login it shows as text with "เปลี่ยน" instead of a field.
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AutofocusDirective, MATERIAL],
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
      // Full page reload into the main app (SPA per menu)
      next: () => this.document.location.assign('/'),
      error: () => this.submitting.set(false),
    });
  }
}
