import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  ADJUSTMENT_REASON_LABEL,
  SHIFT_APPROVAL_LABEL,
  Shift,
  ShiftAdjustment,
  ShiftCount,
  ShiftSummary,
  StoreInfo,
  VARIANCE_REASON_LABEL,
  adjustedVariance,
  variance,
} from '@core/models';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';

/**
 * 80 mm shift report (Z report) of a closed shift (stateless; print it with `printElement()`):
 * sales / voids / refunds, then per payment method the expected amount, the count, the variance
 * with its reason, the deposit and the float left, approval and signature lines.
 */
@Component({
  selector: 'app-shift-slip',
  imports: [DecimalPipe, ThaiDatePipe],
  templateUrl: './shift-slip.html',
  styleUrl: './shift-slip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShiftSlip {
  readonly shift = input.required<Shift>();
  readonly summary = input.required<ShiftSummary>();
  readonly store = input<StoreInfo | null>(null);
  /** Reprint: marks the slip as a copy */
  readonly copy = input(false);
  /**
   * Corrections made after closing (S8), printed in their own section on a copy; the counts
   * above stay as counted at close.
   */
  readonly adjustments = input<readonly ShiftAdjustment[]>([]);

  protected readonly approvalLabel = SHIFT_APPROVAL_LABEL;
  /** Closed by someone else than its cashier (an admin closing on their behalf, S1) */
  protected readonly closedOnBehalf = computed(() => {
    const s = this.shift();
    return !!s.closedBy && s.closedBy !== s.cashier;
  });
  protected readonly totalVariance = computed(() =>
    this.shift().counts.reduce((sum, c) => sum + variance(c), 0),
  );

  /** Counted methods that got adjustments, with their variance after them. */
  protected readonly adjustedLines = computed(() =>
    this.shift()
      .counts.filter((c) => this.adjustments().some((a) => a.methodId === c.methodId))
      .map((c) => ({
        name: c.name,
        before: variance(c),
        after: adjustedVariance(c, this.adjustments()),
      })),
  );

  protected diff(count: ShiftCount): number {
    return variance(count);
  }

  protected adjustmentReason(a: ShiftAdjustment): string {
    const label = ADJUSTMENT_REASON_LABEL[a.reasonCode];
    return a.reason ? `${label}: ${a.reason}` : label;
  }

  protected reasonText(count: ShiftCount): string {
    if (!count.reasonCode) return '';
    const label = VARIANCE_REASON_LABEL[count.reasonCode];
    return count.reason ? `${label}: ${count.reason}` : label;
  }
}
