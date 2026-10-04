import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Sale } from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';

/** Asks why a bill is voided. Closes with the reason, or nothing when cancelled. */
@Component({
  selector: 'app-void-dialog',
  imports: [MatDialogModule, AutofocusDirective, MATERIAL],
  template: `
    <h2 mat-dialog-title>ยกเลิกบิล {{ sale.orderNo }}</h2>
    <mat-dialog-content>
      <p>
        สินค้าจะกลับเข้าคลังที่ต้นทุนเดิม และ Serial กลับเป็นคงคลัง — ต้องคืนเงินลูกค้า
        {{ sale.total.toLocaleString('en-US', { minimumFractionDigits: 2 }) }} บาท เอง
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
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ไม่ยกเลิก</button>
      <button mat-flat-button [disabled]="!reason().trim()" [mat-dialog-close]="reason().trim()">
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoidDialog {
  protected readonly sale = inject<Sale>(MAT_DIALOG_DATA);
  protected readonly quickReasons = ['ลูกค้าเปลี่ยนใจ', 'คีย์รายการผิด', 'ชำระเงินไม่สำเร็จ'];
  protected readonly reason = signal('');
}
