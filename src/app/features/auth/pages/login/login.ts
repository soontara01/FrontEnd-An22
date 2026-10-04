import { ChangeDetectionStrategy, Component, DOCUMENT, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '@core/auth/auth.service';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, AutofocusDirective, MATERIAL],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Login {
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);

  protected readonly hidePassword = signal(true);
  protected readonly submitting = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    username: ['admin', Validators.required],
    password: ['', Validators.required],
  });

  protected submit(): void {
    if (this.form.invalid) {
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
