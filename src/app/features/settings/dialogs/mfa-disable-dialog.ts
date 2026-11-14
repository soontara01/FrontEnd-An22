import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { NotificationService } from '@core/services/notification.service';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { SettingsApi } from '../data/settings-api.service';

/** Turning one's own Microsoft Authenticator off (E55) — the password typed again. */
@Component({
  selector: 'app-mfa-disable-dialog',
  imports: [MatDialogModule, AutofocusDirective, MATERIAL],
  template: `
    <h2 mat-dialog-title>ปิด Microsoft Authenticator</h2>
    <mat-dialog-content>
      <p>หลังปิด การเข้าสู่ระบบที่ /auth/login ใช้รหัสผ่านอย่างเดียว · ยืนยันด้วยรหัสผ่านของคุณ</p>
      <mat-form-field appearance="outline" class="field">
        <mat-label>รหัสผ่าน</mat-label>
        <input
          matInput
          appAutofocus
          type="password"
          autocomplete="current-password"
          [value]="password()"
          (input)="password.set($any($event.target).value)"
          (keydown.enter)="save()"
        />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button [disabled]="!password() || saving()" (click)="save()">ปิดใช้</button>
    </mat-dialog-actions>
  `,
  styles: `
    .field {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MfaDisableDialog {
  private readonly api = inject(SettingsApi);
  private readonly notify = inject(NotificationService);
  private readonly dialogRef = inject<MatDialogRef<MfaDisableDialog, boolean>>(MatDialogRef);

  protected readonly password = signal('');
  protected readonly saving = signal(false);

  protected save(): void {
    if (!this.password() || this.saving()) return;
    this.saving.set(true);
    this.api.mfaDisable(this.password()).subscribe({
      next: () => {
        this.notify.success('ปิด Microsoft Authenticator แล้ว');
        this.dialogRef.close(true);
      },
      error: () => this.saving.set(false),
    });
  }
}
