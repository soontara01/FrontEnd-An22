import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { User } from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { UsersStore } from '../../data/users.store';

/**
 * The owner hands ownership over (E33), confirming with their own password; they stay an admin of
 * every branch. The page reloads afterwards, since the caller's own rights changed.
 */
@Component({
  selector: 'app-owner-transfer-dialog',
  imports: [MatDialogModule, AutofocusDirective, MATERIAL],
  template: `
    <h2 mat-dialog-title>โอนความเป็นเจ้าของบริษัท</h2>
    <mat-dialog-content>
      <p>
        โอนให้ <strong>{{ user.name }}</strong> ({{ user.username }} · {{ user.email }}) —
        ผู้รับโอนจะดูแลแพ็กเกจ การเก็บเงิน export และการลบข้อมูลบริษัท
        ส่วนคุณจะเป็นผู้ดูแลระบบทุกสาขา
      </p>
      <mat-form-field appearance="outline" class="field">
        <mat-label>รหัสผ่านของคุณ (ยืนยัน)</mat-label>
        <input
          matInput
          appAutofocus
          type="password"
          autocomplete="current-password"
          [value]="password()"
          (input)="password.set($any($event.target).value)"
          (keydown.enter)="save()"
        />
        @if (touched() && problem(); as p) {
          <mat-hint class="field-error">{{ p }}</mat-hint>
        }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button [disabled]="saving()" (click)="save()">โอนความเป็นเจ้าของ</button>
    </mat-dialog-actions>
  `,
  styles: `
    .field {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnerTransferDialog {
  protected readonly user = inject<User>(MAT_DIALOG_DATA);
  private readonly store = inject(UsersStore);
  private readonly document = inject(DOCUMENT);

  protected readonly password = signal('');
  protected readonly touched = signal(false);
  protected readonly saving = signal(false);
  protected readonly problem = computed(() => (this.password() ? null : 'กรุณากรอกรหัสผ่าน'));

  protected save(): void {
    this.touched.set(true);
    if (this.problem() || this.saving()) return;
    this.saving.set(true);
    this.store.transferOwner(this.user.id, this.password()).subscribe({
      next: () => this.document.location.reload(),
      error: () => this.saving.set(false),
    });
  }
}
