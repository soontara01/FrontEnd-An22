import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import type { MfaChange } from '@core/models';
import { isTotpCode, normalizeTotpCode } from '@core/models/totp.model';
import { NotificationService } from '@core/services/notification.service';
import { MfaSetupPanel } from '@shared/components/mfa-setup/mfa-setup';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { SettingsApi } from '../data/settings-api.service';

const totpValidator = (c: { value: string }) =>
  c.value && !isTotpCode(c.value) ? { format: true } : null;

/**
 * Moving one's own Microsoft Authenticator to a new phone (E58): password + a code of the phone in
 * use, then scan the new QR and type the new phone's code. The old phone works until the end; a
 * wrong entry keeps the dialog open (the snackbar says why). Closes with `true` once moved.
 */
@Component({
  selector: 'app-mfa-change-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MfaSetupPanel, AutofocusDirective, MATERIAL],
  template: `
    <h2 mat-dialog-title>เปลี่ยนเครื่อง Microsoft Authenticator</h2>
    <mat-dialog-content>
      @if (change(); as ch) {
        <p class="lead">สแกน QR นี้ด้วยแอปบนเครื่องใหม่ แล้วพิมพ์รหัส 6 หลักจากเครื่องใหม่</p>
        <app-mfa-setup [setup]="ch.setup" />
        <mat-form-field appearance="outline" class="field">
          <mat-label>รหัส 6 หลักจากเครื่องใหม่</mat-label>
          <input
            matInput
            appAutofocus
            [formControl]="newCode"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="7"
            (keydown.enter)="confirm()"
          />
          @if (newCode.touched && newCode.invalid) {
            <mat-error>รหัสต้องเป็นตัวเลข 6 หลัก</mat-error>
          }
        </mat-form-field>
      } @else {
        <form [formGroup]="start" (ngSubmit)="begin()" id="mfa-change-start">
          <p class="lead">
            ยืนยันตัวตนด้วยรหัสผ่านและรหัส 6 หลักจากเครื่องที่ใช้อยู่ — ทำมือถือหาย?
            ให้ผู้ดูแลระบบล้างให้แทน
          </p>
          <mat-form-field appearance="outline" class="field">
            <mat-label>รหัสผ่าน</mat-label>
            <input
              matInput
              appAutofocus
              type="password"
              autocomplete="current-password"
              formControlName="password"
            />
            @if (start.controls.password.hasError('required')) {
              <mat-error>กรุณากรอกรหัสผ่าน</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" class="field">
            <mat-label>รหัส 6 หลักจากเครื่องที่ใช้อยู่</mat-label>
            <input
              matInput
              formControlName="code"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="7"
            />
            @if (start.controls.code.hasError('required')) {
              <mat-error>กรุณากรอกรหัส 6 หลักจากแอป</mat-error>
            } @else if (start.controls.code.hasError('format')) {
              <mat-error>รหัสต้องเป็นตัวเลข 6 หลัก</mat-error>
            }
          </mat-form-field>
        </form>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      @if (change()) {
        <button mat-flat-button [disabled]="saving()" (click)="confirm()">ยืนยันเครื่องใหม่</button>
      } @else {
        <button mat-flat-button type="submit" form="mfa-change-start" [disabled]="saving()">
          ถัดไป
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .field {
      width: 100%;
    }
    .lead {
      margin: 0 0 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MfaChangeDialog {
  private readonly api = inject(SettingsApi);
  private readonly notify = inject(NotificationService);
  private readonly dialogRef = inject<MatDialogRef<MfaChangeDialog, boolean>>(MatDialogRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly change = signal<MfaChange | null>(null);
  protected readonly saving = signal(false);
  protected readonly start = this.fb.group({
    password: ['', Validators.required],
    code: ['', [Validators.required, totpValidator]],
  });
  protected readonly newCode = this.fb.control('', [Validators.required, totpValidator]);

  protected begin(): void {
    if (this.start.invalid) {
      this.start.markAllAsTouched();
      return;
    }
    if (this.saving()) return;
    this.saving.set(true);
    const { password, code } = this.start.getRawValue();
    this.api.mfaChange(password, normalizeTotpCode(code)).subscribe({
      next: (change) => {
        this.saving.set(false);
        this.change.set(change);
      },
      error: () => {
        this.saving.set(false);
        this.start.controls.code.reset();
      },
    });
  }

  protected confirm(): void {
    const change = this.change();
    if (this.newCode.invalid) {
      this.newCode.markAsTouched();
      return;
    }
    if (!change || this.saving()) return;
    this.saving.set(true);
    this.api.mfaChangeConfirm(change.change, normalizeTotpCode(this.newCode.value)).subscribe({
      next: () => {
        this.notify.success(
          'เปลี่ยนเครื่อง Microsoft Authenticator แล้ว — เครื่องเดิมใช้ไม่ได้อีก',
        );
        this.dialogRef.close(true);
      },
      error: () => {
        this.saving.set(false);
        this.newCode.reset();
      },
    });
  }
}
