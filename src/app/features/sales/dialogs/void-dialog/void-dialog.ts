import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Sale, VoidPayload } from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';

export interface VoidDialogData {
  sale: Sale;
  /** Non-admins need an admin's login typed here (P3); the server checks it. */
  needsApproval: boolean;
}

/** Asks why a bill is voided (+ an admin's login for non-admins). Closes with the payload, or nothing. */
@Component({
  selector: 'app-void-dialog',
  imports: [MatDialogModule, AutofocusDirective, MATERIAL],
  template: `
    <h2 mat-dialog-title>ยกเลิกบิล {{ data.sale.orderNo }}</h2>
    <mat-dialog-content>
      <p>
        สินค้าจะกลับเข้าคลังที่ต้นทุนเดิม และ Serial กลับเป็นคงคลัง — ต้องคืนเงินลูกค้า
        {{ data.sale.total.toLocaleString('en-US', { minimumFractionDigits: 2 }) }} บาท เอง
      </p>
      <div class="quick">
        @for (r of quickReasons; track r) {
          <button mat-stroked-button type="button" (click)="reason.set(r)">{{ r }}</button>
        }
      </div>
      <mat-form-field appearance="outline" class="w-full">
        <mat-label>เหตุผล (จำเป็น)</mat-label>
        <textarea
          matInput
          appAutofocus
          rows="2"
          [value]="reason()"
          (input)="reason.set($any($event.target).value)"
        ></textarea>
      </mat-form-field>
      @if (data.needsApproval) {
        <p class="warn">ยกเลิกบิลต้องให้ผู้ดูแลระบบอนุมัติที่เครื่องนี้</p>
        <div class="approval">
          <mat-form-field appearance="outline">
            <mat-label>ชื่อผู้ใช้ผู้ดูแลระบบ</mat-label>
            <input
              matInput
              autocomplete="off"
              [value]="username()"
              (input)="username.set($any($event.target).value)"
            />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>รหัสผ่าน</mat-label>
            <input
              matInput
              type="password"
              autocomplete="off"
              [value]="password()"
              (input)="password.set($any($event.target).value)"
            />
          </mat-form-field>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ไม่ยกเลิก</button>
      <button mat-flat-button [disabled]="!payload()" [mat-dialog-close]="payload()">
        <mat-icon>cancel</mat-icon>
        ยืนยันยกเลิกบิล
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .quick {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }
    .approval {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .warn {
      color: var(--mat-sys-error);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoidDialog {
  protected readonly data = inject<VoidDialogData>(MAT_DIALOG_DATA);
  protected readonly quickReasons = ['ลูกค้าเปลี่ยนใจ', 'คีย์รายการผิด', 'ชำระเงินไม่สำเร็จ'];
  protected readonly reason = signal('');
  protected readonly username = signal('');
  protected readonly password = signal('');

  /** What the dialog closes with; null while something required is missing. */
  protected readonly payload = computed<VoidPayload | null>(() => {
    const reason = this.reason().trim();
    if (!reason) return null;
    if (!this.data.needsApproval) return { reason };
    const username = this.username().trim();
    if (!username || !this.password()) return null;
    return { reason, approval: { username, password: this.password() } };
  });
}
