import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { isMfaChallenge, type MfaSetup } from '@core/models/auth.model';
import { PLATFORM_MFA_ACCOUNT } from '@core/models/mfa.model';
import { isTotpCode, normalizeTotpCode } from '@core/models/totp.model';
import { MfaSetupPanel } from '@shared/components/mfa-setup/mfa-setup';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { environment } from '@env/environment';
import { MATERIAL } from '@shared/material';
import { PlatformAuth } from '../../data/platform-auth.service';

/**
 * Login of the SaaS operator (E36): no company code — platform admins belong to no company.
 * Always two steps (E56): password, then the Microsoft Authenticator code (set up on first login).
 */
@Component({
  selector: 'app-platform-login',
  imports: [ReactiveFormsModule, AutofocusDirective, MfaSetupPanel, MATERIAL],
  template: `
    <main class="page">
      <mat-card class="card" appearance="outlined">
        <mat-card-header>
          <mat-card-title>ผู้ให้บริการระบบ</mat-card-title>
          <mat-card-subtitle>
            สำหรับผู้ดูแลแพลตฟอร์มเท่านั้น · ใช้ Microsoft Authenticator
            @if (demo) {
              (ทดลอง: platform / platform)
            }
          </mat-card-subtitle>
        </mat-card-header>
        @if (step() === 'password') {
          <form [formGroup]="form" (ngSubmit)="submit()">
            <mat-card-content>
              @if (expired()) {
                <p class="expired" role="alert">เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่</p>
              }
              <mat-form-field appearance="outline">
                <mat-label>ชื่อผู้ใช้</mat-label>
                <input matInput appAutofocus formControlName="username" autocomplete="username" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>รหัสผ่าน</mat-label>
                <input
                  matInput
                  type="password"
                  formControlName="password"
                  autocomplete="current-password"
                />
              </mat-form-field>
            </mat-card-content>
            <mat-card-actions>
              <button mat-flat-button type="submit" [disabled]="submitting()">เข้าสู่ระบบ</button>
            </mat-card-actions>
          </form>
        } @else {
          <form [formGroup]="codeForm" (ngSubmit)="submitCode()">
            <mat-card-content>
              @if (setup(); as s) {
                <p class="lead">
                  ผู้ดูแลแพลตฟอร์มต้องใช้ Microsoft Authenticator — ตั้งค่าให้บัญชี
                  <strong>{{ form.controls.username.value }}</strong>
                </p>
                <app-mfa-setup [setup]="s" />
              } @else {
                <p class="lead">
                  เปิดแอป <strong>Microsoft Authenticator</strong> แล้วพิมพ์รหัส 6 หลักของบัญชี
                  <strong>AN22 · {{ account }}:{{ form.controls.username.value }}</strong>
                </p>
              }
              <mat-form-field appearance="outline">
                <mat-label>รหัส 6 หลัก</mat-label>
                <input
                  matInput
                  appAutofocus
                  formControlName="code"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  maxlength="7"
                />
                @if (codeForm.controls.code.hasError('required')) {
                  <mat-error>กรุณากรอกรหัส 6 หลักจากแอป</mat-error>
                } @else if (codeForm.controls.code.hasError('format')) {
                  <mat-error>รหัสต้องเป็นตัวเลข 6 หลัก</mat-error>
                }
                <mat-hint>รหัสเปลี่ยนทุก 30 วินาที</mat-hint>
              </mat-form-field>
            </mat-card-content>
            <mat-card-actions class="code-actions">
              <button mat-flat-button type="submit" [disabled]="submitting()">
                {{ setup() ? 'ยืนยันและเข้าสู่ระบบ' : 'ยืนยัน' }}
              </button>
              <button mat-button type="button" (click)="back()">กลับ</button>
            </mat-card-actions>
          </form>
        }
      </mat-card>
    </main>
  `,
  styles: `
    .page {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 16px;
      background: var(--mat-sys-surface-container);
    }
    .card {
      width: min(400px, 100%);
    }
    mat-card-content {
      display: flex;
      flex-direction: column;
      padding-top: 16px;
    }
    mat-card-actions button {
      width: 100%;
    }
    .code-actions {
      flex-direction: column;
      gap: 8px;
    }
    .lead {
      margin: 0 0 16px;
    }
    .expired {
      margin: 0 0 16px;
      color: var(--mat-sys-error);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PlatformLogin {
  private readonly auth = inject(PlatformAuth);
  private readonly router = inject(Router);
  /** The seed login is hinted only on the mock (C3-2). */
  protected readonly demo = environment.useMock;
  protected readonly account = PLATFORM_MFA_ACCOUNT;
  /** `?expired=1`: the platform session ended (401, C3-6). */
  readonly expired = input<string>();
  protected readonly submitting = signal(false);
  protected readonly step = signal<'password' | 'code'>('password');
  protected readonly setup = signal<MfaSetup | null>(null);

  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly form = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });
  protected readonly codeForm = this.fb.group({
    code: [
      '',
      [
        Validators.required,
        (c: { value: string }) => (c.value && !isTotpCode(c.value) ? { format: true } : null),
      ],
    ],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { username, password } = this.form.getRawValue();
    this.auth.login(username, password).subscribe({
      next: (result) => {
        this.submitting.set(false);
        if (!isMfaChallenge(result)) {
          this.enter();
          return;
        }
        this.codeForm.reset();
        this.setup.set(result.mfa === 'setup' ? result.setup : null);
        this.step.set('code');
      },
      error: () => this.submitting.set(false),
    });
  }

  protected submitCode(): void {
    if (this.codeForm.invalid) {
      this.codeForm.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.auth.verifyMfa(normalizeTotpCode(this.codeForm.controls.code.value)).subscribe({
      next: () => this.enter(),
      error: () => {
        this.submitting.set(false);
        this.codeForm.reset();
      },
    });
  }

  protected back(): void {
    this.step.set('password');
    this.setup.set(null);
    this.form.controls.password.reset();
  }

  private enter(): void {
    void this.router.navigateByUrl('/platform/companies');
  }
}
