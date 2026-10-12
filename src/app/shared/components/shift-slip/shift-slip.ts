import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  SHIFT_APPROVAL_LABEL,
  Shift,
  ShiftCount,
  ShiftSummary,
  StoreInfo,
  VARIANCE_REASON_LABEL,
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

  protected readonly approvalLabel = SHIFT_APPROVAL_LABEL;
  /** Closed by someone else than its cashier (an admin closing on their behalf, S1) */
  protected readonly closedOnBehalf = computed(() => {
    const s = this.shift();
    return !!s.closedBy && s.closedBy !== s.cashier;
  });
  protected readonly totalVariance = computed(() =>
    this.shift().counts.reduce((sum, c) => sum + variance(c), 0),
  );

  protected diff(count: ShiftCount): number {
    return variance(count);
  }

  protected reasonText(count: ShiftCount): string {
    if (!count.reasonCode) return '';
    const label = VARIANCE_REASON_LABEL[count.reasonCode];
    return count.reason ? `${label}: ${count.reason}` : label;
  }
}
