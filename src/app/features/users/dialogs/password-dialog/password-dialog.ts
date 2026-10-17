import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { User, passwordError } from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { UsersStore } from '../../data/users.store';

/**
 * An admin sets a new password for a user (D4 section 14: staff have no e-mail to reset with).
 * Saves itself; stays open with the typed value when the server refuses.
 */
@Component({
  selector: 'app-password-dialog',
  imports: [MatDialogModule, AutofocusDirective, MATERIAL],
  template: `
    <h2 mat-dialog-title>ตั้งรหัสผ่านใหม่</h2>
    <mat-dialog-content>
      <p class="who">{{ user.name }} ({{ user.username }})</p>
      <mat-form-field appearance="outline" class="field">
        <mat-label>รหัสผ่านใหม่</mat-label>
        <input
          matInput
          appAutofocus
          type="password"
          autocomplete="new-password"
          [value]="password()"
          (input)="password.set($any($event.target).value)"
          (keydown.enter)="save()"
        />
        @if (touched() && problem(); as p) {
          <mat-hint class="field-error">{{ p }}</mat-hint>
        } @else {
          <mat-hint>อย่างน้อย 4 ตัว — แจ้งรหัสนี้ให้ผู้ใช้</mat-hint>
        }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button [disabled]="saving()" (click)="save()">บันทึก</button>
    </mat-dialog-actions>
  `,
  styles: `
    .who {
      margin-top: 0;
    }
    .field {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordDialog {
  protected readonly user = inject<User>(MAT_DIALOG_DATA);
  private readonly store = inject(UsersStore);
  private readonly notify = inject(NotificationService);
  private readonly dialogRef = inject<MatDialogRef<PasswordDialog>>(MatDialogRef);

  protected readonly password = signal('');
  protected readonly touched = signal(false);
  protected readonly saving = signal(false);
  protected readonly problem = computed(() => passwordError(this.password()));

  protected save(): void {
    this.touched.set(true);
    if (this.problem() || this.saving()) return;
    this.saving.set(true);
    this.store.setPassword(this.user.id, this.password()).subscribe({
      next: () => {
        this.notify.success('ตั้งรหัสผ่านใหม่เรียบร้อย');
        this.dialogRef.close();
      },
      error: () => this.saving.set(false),
    });
  }
}
