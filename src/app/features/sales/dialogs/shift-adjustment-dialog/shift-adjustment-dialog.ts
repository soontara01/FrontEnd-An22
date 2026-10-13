import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import {
  ADJUSTMENT_REASON_LABEL,
  AdjustmentReason,
  Shift,
  ShiftAdjustment,
  ShiftAdjustmentPayload,
  adjustedVariance,
  round2,
  shiftAdjustmentError,
} from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';

export interface ShiftAdjustmentDialogData {
  shift: Shift;
  /** Adjustments already made (the preview adds the new one on top) */
  adjustments: readonly ShiftAdjustment[];
}

/**
 * Admin correction of a closed shift's count (S8): a + / − amount on one counted method with a
 * reason. Recorded separately — the counts and the original Z report never change.
 */
@Component({
  selector: 'app-shift-adjustment-dialog',
  imports: [DecimalPipe, MatDialogModule, MatButtonToggleModule, AutofocusDirective, MATERIAL],
  template: `
    <h2 mat-dialog-title>รายการปรับปรุง · กะ {{ data.shift.shiftNo }}</h2>
    <mat-dialog-content>
      <p class="text-muted small">
        ยอดนับและใบสรุปปิดกะเดิมไม่เปลี่ยน — รายการนี้แก้ไข / ลบไม่ได้ ถ้าผิดให้เพิ่มรายการกลับ
      </p>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>ช่องทาง (ที่นับตอนปิดกะ)</mat-label>
        <mat-select [value]="methodId()" (selectionChange)="methodId.set($event.value)">
          @for (c of counted; track c.methodId) {
            <mat-option [value]="c.methodId">{{ c.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-button-toggle-group
        class="sign"
        aria-label="เพิ่มหรือลด"
        [value]="sign()"
        (change)="sign.set($event.value)"
      >
        <mat-button-toggle [value]="1">+ เพิ่มยอดนับ (เช่น พบเงิน)</mat-button-toggle>
        <mat-button-toggle [value]="-1">− ลดยอดนับ</mat-button-toggle>
      </mat-button-toggle-group>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>จำนวนเงิน</mat-label>
        <input
          matInput
          appAutofocus
          type="number"
          min="0"
          step="0.25"
          [value]="amount() || ''"
          (input)="amount.set($any($event.target).value)"
        />
        <span matTextSuffix>บาท</span>
      </mat-form-field>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>สาเหตุ</mat-label>
        <mat-select [value]="reasonCode()" (selectionChange)="reasonCode.set($event.value)">
          @for (r of reasons; track r[0]) {
            <mat-option [value]="r[0]">{{ r[1] }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="w-full">
        <mat-label>{{ reasonCode() === 'other' ? 'อธิบาย (จำเป็น)' : 'รายละเอียด' }}</mat-label>
        <input
          matInput
          maxlength="200"
          [value]="reason()"
          (input)="reason.set($any($event.target).value)"
        />
      </mat-form-field>

      @if (preview(); as p) {
        <p>
          ส่วนต่าง{{ p.name }}: {{ p.before | number: '1.2-2' }} →
          <strong>{{ p.after | number: '1.2-2' }}</strong>
        </p>
      }
      @if (problem(); as message) {
        <div class="problem">{{ message }}</div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button type="button" [disabled]="!!problem()" (click)="save()">
        <mat-icon>save</mat-icon>
        บันทึกรายการปรับปรุง
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .sign {
      margin: 0 0 16px;
    }
    .problem {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShiftAdjustmentDialog {
  protected readonly data = inject<ShiftAdjustmentDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<ShiftAdjustmentDialog, ShiftAdjustmentPayload>>(MatDialogRef);

  protected readonly counted = this.data.shift.counts.filter((c) => c.counted !== null);
  protected readonly reasons = Object.entries(ADJUSTMENT_REASON_LABEL) as [
    AdjustmentReason,
    string,
  ][];
  protected readonly methodId = signal<number | null>(this.counted[0]?.methodId ?? null);
  protected readonly sign = signal<1 | -1>(1);
  protected readonly amount = signal(0);
  protected readonly reasonCode = signal<AdjustmentReason>('count_error');
  protected readonly reason = signal('');

  private readonly payload = computed<ShiftAdjustmentPayload>(() => ({
    methodId: this.methodId() ?? 0,
    amount: round2(this.sign() * (Number(this.amount()) || 0)),
    reasonCode: this.reasonCode(),
    reason: this.reason().trim(),
  }));
  /** Same rule as the server; only admins open this dialog. */
  protected readonly problem = computed(() =>
    shiftAdjustmentError(this.data.shift, this.payload(), true),
  );
  /** The method's variance before / after this adjustment (on top of earlier ones). */
  protected readonly preview = computed(() => {
    const count = this.counted.find((c) => c.methodId === this.methodId());
    if (!count) return null;
    const before = adjustedVariance(count, this.data.adjustments);
    const after = adjustedVariance(count, [...this.data.adjustments, this.payload()]);
    return { name: count.name, before, after };
  });

  protected save(): void {
    if (this.problem()) return;
    this.dialogRef.close(this.payload());
  }
}
