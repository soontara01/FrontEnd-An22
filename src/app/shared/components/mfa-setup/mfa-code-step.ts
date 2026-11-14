import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { MfaSetup } from '@core/models/auth.model';
import { isTotpCode, normalizeTotpCode, totpCode, totpStep } from '@core/models/totp.model';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { MfaSetupPanel } from './mfa-setup';

/**
 * The Authenticator step of a login (E55 / E56 / E57) inside a login card: the QR the first time
 * (`setup`), then the 6-digit code field. The page sends `code` to its own verify call and calls
 * `reset()` after a wrong one.
 */
@Component({
  selector: 'app-mfa-code-step',
  imports: [ReactiveFormsModule, MfaSetupPanel, AutofocusDirective, MATERIAL],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-card-content>
        @if (setup(); as s) {
          <p class="lead">
            ทุกการเข้าสู่ระบบต้องใช้ Microsoft Authenticator — ตั้งค่าให้บัญชี
            <strong>{{ username() }}</strong>
          </p>
          <app-mfa-setup [setup]="s" />
        } @else {
          <p class="lead">
            เปิดแอป <strong>Microsoft Authenticator</strong> บนมือถือ แล้วพิมพ์รหัส 6 หลักของบัญชี
            <strong>AN22 · {{ account() }}</strong>
          </p>
        }
        @if (demoCode(); as code) {
          <p class="demo">
            ทดลอง (mock): รหัสตอนนี้ <strong>{{ code }}</strong>
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
            spellcheck="false"
          />
          <mat-icon matPrefix>pin</mat-icon>
          @if (form.controls.code.hasError('required')) {
            <mat-error>กรุณากรอกรหัส 6 หลักจากแอป</mat-error>
          } @else if (form.controls.code.hasError('format')) {
            <mat-error>รหัสต้องเป็นตัวเลข 6 หลัก</mat-error>
          }
          <mat-hint>รหัสเปลี่ยนทุก 30 วินาที</mat-hint>
        </mat-form-field>
      </mat-card-content>

      <mat-card-actions>
        <button mat-flat-button type="submit" [disabled]="submitting()">
          @if (submitting()) {
            <mat-spinner diameter="20" />
          } @else {
            {{ setup() ? 'ยืนยันและเข้าสู่ระบบ' : 'ยืนยัน' }}
          }
        </button>
        <button mat-button type="button" (click)="back.emit()">กลับ</button>
        @if (!setup()) {
          <p class="note">ทำมือถือหาย? {{ lostPhone() }}</p>
        }
      </mat-card-actions>
    </form>
  `,
  styles: `
    mat-card-content {
      display: flex;
      flex-direction: column;
      padding-top: 16px;
    }
    mat-card-actions {
      flex-direction: column;
      gap: 8px;
      button {
        width: 100%;
      }
    }
    .lead {
      margin: 0 0 16px;
    }
    .demo {
      margin: 0 0 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    .note {
      margin: 0;
      padding: 0 8px 8px;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MfaCodeStep {
  /** First login: the QR + secret; null = the code only */
  readonly setup = input<MfaSetup | null>(null);
  /** The account as the app lists it, e.g. `DEMO:nok` / `PLATFORM:platform` */
  readonly account = input.required<string>();
  readonly username = input.required<string>();
  readonly submitting = input(false);
  /** Mock only: the secret, to show the current code (no phone on the dev server) */
  readonly demoSecret = input<string | null>(null);
  readonly lostPhone = input('ติดต่อผู้ดูแลระบบของบริษัทให้ล้าง Authenticator ให้');
  readonly code = output<string>();
  readonly back = output<void>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    code: [
      '',
      [
        Validators.required,
        (c: { value: string }) => (c.value && !isTotpCode(c.value) ? { format: true } : null),
      ],
    ],
  });

  /** Ticks every second so the demo code follows the 30-second steps. */
  private readonly now = signal(Date.now());
  protected readonly demoCode = computed(() => {
    const secret = this.demoSecret();
    return secret ? totpCode(secret, totpStep(this.now())) : null;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** After a wrong code: empty field, ready for the next one. */
  reset(): void {
    this.form.reset();
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.code.emit(normalizeTotpCode(this.form.controls.code.value));
  }
}
