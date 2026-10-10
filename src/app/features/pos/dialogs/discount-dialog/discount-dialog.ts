import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ManualDiscount, manualDiscountBaht, manualDiscountValueError, round2 } from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';

export interface DiscountDialogData {
  /** e.g. the line's name or 'ส่วนลดท้ายบิล' */
  title: string;
  /** Amount the discount is taken on (after promotions; bill: after line manual discounts) */
  base: number;
  current: ManualDiscount | null;
  /** The bill's reason (one per bill) */
  reason: string;
  /** Staff ceiling (% of a line after promotions) */
  maxPercent: number;
  isAdmin: boolean;
}

export interface DiscountDialogResult {
  /** null = remove the discount */
  discount: ManualDiscount | null;
  reason: string;
}

/**
 * Manual discount (ส่วนลดพิเศษ) on a cart line or the whole bill: percent or baht with a live
 * preview, and the bill's reason. The ceiling / reason rule itself is `manualDiscountError()`.
 */
@Component({
  selector: 'app-discount-dialog',
  imports: [DecimalPipe, MatDialogModule, MatButtonToggleModule, AutofocusDirective, MATERIAL],
  templateUrl: './discount-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .kind {
      margin: 4px 0 16px;
    }
    .preview {
      display: flex;
      justify-content: space-between;
      font: var(--mat-sys-body-medium);
      margin-bottom: 12px;
    }
    .quick {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .problem {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class DiscountDialog {
  protected readonly data = inject<DiscountDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<DiscountDialog, DiscountDialogResult>>(MatDialogRef);

  protected readonly quickReasons = [
    'ลูกค้าประจำ',
    'สินค้าโชว์/กล่องชำรุด',
    'ต่อรองราคา',
    'ปัดเศษ',
  ];
  protected readonly kind = signal<ManualDiscount['kind']>(this.data.current?.kind ?? 'percent');
  protected readonly value = signal<number>(this.data.current?.value ?? 0);
  protected readonly reason = signal(this.data.reason);

  private readonly discount = computed<ManualDiscount>(() => ({
    kind: this.kind(),
    value: round2(Number(this.value()) || 0),
  }));
  protected readonly baht = computed(() =>
    manualDiscountValueError(this.discount())
      ? 0
      : manualDiscountBaht(this.discount(), this.data.base),
  );
  protected readonly left = computed(() => round2(this.data.base - this.baht()));
  protected readonly overCeiling = computed(
    () => !this.data.isAdmin && this.baht() > round2((this.data.base * this.data.maxPercent) / 100),
  );
  protected readonly problem = computed(() => {
    const valueProblem = manualDiscountValueError(this.discount());
    if (valueProblem) return valueProblem;
    if (!this.reason().trim()) return 'กรุณาระบุเหตุผลส่วนลดพิเศษ';
    if (this.overCeiling()) {
      return `เกินเพดาน ${this.data.maxPercent}% ที่พนักงานให้ได้ — ให้ผู้ดูแลระบบทำรายการ`;
    }
    return null;
  });

  protected setValue(raw: string): void {
    this.value.set(Number(raw));
  }

  protected save(): void {
    if (this.problem()) return;
    this.dialogRef.close({ discount: this.discount(), reason: this.reason().trim() });
  }

  protected removeDiscount(): void {
    this.dialogRef.close({ discount: null, reason: this.reason().trim() });
  }
}
