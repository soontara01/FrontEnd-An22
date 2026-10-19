import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Sale, VoidPayload } from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { SalesStore } from '../../data/sales.store';

export interface VoidDialogData {
  sale: Sale;
  /** Non-admins need an admin's login typed here (P3); the server checks it. */
  needsApproval: boolean;
}

/**
 * Asks why a bill is voided (+ an admin's login for non-admins) and voids it. Closes with the voided
 * sale; when the server refuses (e.g. a wrong approval) it stays open with what was typed and says
 * why. Open it with the route's injector — it uses the feature-scoped `SalesStore`.
 */
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
          <button mat-stroked-button type="button" (click)="setReason(r)">{{ r }}</button>
        }
      </div>
      <mat-form-field appearance="outline" class="w-full">
        <mat-label>เหตุผล (จำเป็น)</mat-label>
        <textarea
          matInput
          appAutofocus
          rows="2"
          [value]="reason()"
          (input)="setReason($any($event.target).value)"
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
              (input)="setUsername($any($event.target).value)"
            />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>รหัสผ่าน</mat-label>
            <input
              matInput
              type="password"
              autocomplete="off"
              [value]="password()"
              (input)="setPassword($any($event.target).value)"
            />
          </mat-form-field>
        </div>
      }
      @if (serverError()) {
        <p class="warn">{{ serverError() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ไม่ยกเลิก</button>
      <button mat-flat-button [disabled]="!payload() || saving()" (click)="save()">
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
  private readonly store = inject(SalesStore);
  private readonly dialogRef = inject<MatDialogRef<VoidDialog, Sale>>(MatDialogRef);
  protected readonly quickReasons = ['ลูกค้าเปลี่ยนใจ', 'คีย์รายการผิด', 'ชำระเงินไม่สำเร็จ'];
  protected readonly reason = signal('');
  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly saving = signal(false);
  /** Why the server refused the last try; cleared as soon as anything is changed. */
  protected readonly serverError = signal('');

  /** What the dialog closes with; null while something required is missing. */
  protected readonly payload = computed<VoidPayload | null>(() => {
    const reason = this.reason().trim();
    if (!reason) return null;
    if (!this.data.needsApproval) return { reason };
    const username = this.username().trim();
    if (!username || !this.password()) return null;
    return { reason, approval: { username, password: this.password() } };
  });

  protected setReason(value: string): void {
    this.reason.set(value);
    this.serverError.set('');
  }

  protected setUsername(value: string): void {
    this.username.set(value);
    this.serverError.set('');
  }

  protected setPassword(value: string): void {
    this.password.set(value);
    this.serverError.set('');
  }

  protected save(): void {
    const payload = this.payload();
    if (!payload || this.saving()) return;
    this.saving.set(true);
    this.store.void(this.data.sale.id, payload).subscribe({
      next: (sale) => this.dialogRef.close(sale),
      error: (err: unknown) => {
        this.saving.set(false);
        const message = err instanceof HttpErrorResponse ? err.error?.message : null;
        this.serverError.set(message ?? 'ยกเลิกบิลไม่สำเร็จ');
      },
    });
  }
}
