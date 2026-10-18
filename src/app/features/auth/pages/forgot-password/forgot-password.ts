import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '@core/http/api.service';
import { AuthService } from '@core/auth/auth.service';
import { FORGOT_PASSWORD_ANSWER } from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';

/**
 * An owner asks for a password reset link (E41). The answer is the same whatever was typed;
 * staff have no e-mail reset — an admin sets their new password (E10).
 */
@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, AutofocusDirective, MATERIAL],
  template: `
    <mat-card class="card" appearance="outlined">
      <mat-card-header>
        <mat-card-title>ลืมรหัสผ่าน (เจ้าของบริษัท)</mat-card-title>
        <mat-card-subtitle>พนักงาน: ให้ผู้ดูแลระบบของบริษัทตั้งรหัสผ่านใหม่ให้</mat-card-subtitle>
      </mat-card-header>
      @if (sent()) {
        <mat-card-content>
          <p role="status">{{ answer }}</p>
        </mat-card-content>
        <mat-card-actions>
          <a mat-flat-button routerLink="/auth/login">กลับไปหน้าเข้าสู่ระบบ</a>
        </mat-card-actions>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-card-content>
            <mat-form-field appearance="outline">
              <mat-label>รหัสบริษัท</mat-label>
              <input matInput formControlName="companyCode" autocapitalize="characters" />
              @if (form.controls.companyCode.hasError('required')) {
                <mat-error>กรุณากรอกรหัสบริษัท</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>อีเมลของเจ้าของบริษัท</mat-label>
              <input
                matInput
                appAutofocus
                type="email"
                formControlName="email"
                autocomplete="email"
              />
              @if (form.controls.email.hasError('required')) {
                <mat-error>กรุณากรอกอีเมล</mat-error>
              }
            </mat-form-field>
          </mat-card-content>
          <mat-card-actions>
            <button mat-flat-button type="submit" [disabled]="submitting()">
              ส่งลิงก์ตั้งรหัสผ่าน
            </button>
            <a mat-button routerLink="/auth/login">ยกเลิก</a>
          </mat-card-actions>
        </form>
      }
    </mat-card>
  `,
  styles: `
    .card {
      width: min(400px, 100%);
    }
    mat-card-content {
      display: flex;
      flex-direction: column;
      padding-top: 16px;
    }
    mat-card-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      button,
      a {
        width: 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ForgotPassword {
  private readonly api = inject(ApiService);
  protected readonly answer = FORGOT_PASSWORD_ANSWER;
  protected readonly sent = signal(false);
  protected readonly submitting = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    companyCode: [inject(AuthService).companyCode(), Validators.required],
    email: ['', Validators.required],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.api.post('auth/forgot-password', this.form.getRawValue()).subscribe({
      next: () => this.sent.set(true),
      error: () => this.submitting.set(false),
    });
  }
}
