import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import type { MfaSetup } from '@core/models';
import { isTotpCode, normalizeTotpCode } from '@core/models/totp.model';
import { NotificationService } from '@core/services/notification.service';
import { MfaSetupPanel } from '@shared/components/mfa-setup/mfa-setup';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { SettingsApi } from '../data/settings-api.service';

/**
 * Turning one's own Microsoft Authenticator on (E55): scan, then the first code confirms it.
 * Closes with `true` once it is on; stays open with a wrong code.
 */
@Component({
  selector: 'app-mfa-setup-dialog',
  imports: [MatDialogModule, ReactiveFormsModule, MfaSetupPanel, AutofocusDirective, MATERIAL],
  template: `
    <h2 mat-dialog-title>เปิดใช้ Microsoft Authenticator</h2>
    <mat-dialog-content>
      @if (setup(); as s) {
        <app-mfa-setup [setup]="s" />
        <mat-form-field appearance="outline" class="field">
          <mat-label>รหัส 6 หลัก</mat-label>
          <input
            matInput
            appAutofocus
            [formControl]="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="7"
            (keydown.enter)="confirm()"
          />
          @if (code.touched && code.invalid) {
            <mat-error>รหัสต้องเป็นตัวเลข 6 หลัก</mat-error>
          }
        </mat-form-field>
      } @else {
        <mat-spinner diameter="32" />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button [disabled]="!setup() || saving()" (click)="confirm()">ยืนยัน</button>
    </mat-dialog-actions>
  `,
  styles: `
    .field {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MfaSetupDialog {
  private readonly api = inject(SettingsApi);
  private readonly notify = inject(NotificationService);
  private readonly dialogRef = inject<MatDialogRef<MfaSetupDialog, boolean>>(MatDialogRef);

  protected readonly setup = signal<MfaSetup | null>(null);
  protected readonly saving = signal(false);
  protected readonly code = inject(NonNullableFormBuilder).control('', [
    Validators.required,
    (c) => (isTotpCode(c.value) ? null : { format: true }),
  ]);

  constructor() {
    this.api.mfaSetup().subscribe({
      next: (setup) => this.setup.set(setup),
      // The snackbar already said why (errorInterceptor).
      error: () => this.dialogRef.close(false),
    });
  }

  protected confirm(): void {
    if (this.code.invalid) {
      this.code.markAsTouched();
      return;
    }
    if (this.saving()) return;
    this.saving.set(true);
    this.api.mfaConfirm(normalizeTotpCode(this.code.value)).subscribe({
      next: () => {
        this.notify.success('เปิดใช้ Microsoft Authenticator แล้ว');
        this.dialogRef.close(true);
      },
      error: () => {
        this.saving.set(false);
        this.code.reset();
      },
    });
  }
}
