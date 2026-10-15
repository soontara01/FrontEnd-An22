import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import {
  ADJUSTMENT_REASON_LABEL,
  SALE_STATUS_BADGE,
  SALE_STATUS_LABEL,
  SHIFT_STATUS_LABEL,
  Sale,
  ShiftAdjustment,
  ShiftAdjustmentPayload,
  adjustedVariance,
  variance,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { ShiftSlip } from '@shared/components/shift-slip/shift-slip';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { printElement } from '@shared/utils/print-element';
import { SalesStore } from '../../data/sales.store';
import {
  ShiftAdjustmentDialog,
  ShiftAdjustmentDialogData,
} from '../../dialogs/shift-adjustment-dialog/shift-adjustment-dialog';

/**
 * One POS shift (`/sales/shifts/:id`): the Z report of a closed shift (reprint as a copy) or the
 * running totals of an open one, admin approval of a pending variance, cash movements and the
 * bills sold / voided in it.
 */
@Component({
  selector: 'app-shift-detail',
  imports: [DecimalPipe, RouterLink, PageHeader, LoadingSpinner, ShiftSlip, ThaiDatePipe, MATERIAL],
  templateUrl: './shift-detail.html',
  styleUrl: './shift-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ShiftDetail {
  protected readonly store = inject(SalesStore);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);
  private readonly slip = viewChild('slip', { read: ElementRef<HTMLElement> });

  /** Route param (withComponentInputBinding). */
  readonly id = input<string>();

  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly data = rxResource({
    params: () => Number(this.id()),
    stream: ({ params }) => this.store.shiftDetail(params),
  });
  protected readonly canApprove = computed(
    () =>
      this.isAdmin() &&
      this.data.hasValue() &&
      this.data.value().shift.approvalStatus === 'pending',
  );

  /** Admins may add adjustments to a closed shift that has counted methods (S8). */
  protected readonly canAdjust = computed(
    () =>
      this.isAdmin() &&
      this.data.hasValue() &&
      this.data.value().shift.status === 'closed' &&
      this.data.value().shift.counts.some((c) => c.counted !== null),
  );
  /** Counted methods that got adjustments: variance before → after them. */
  protected readonly adjustedLines = computed(() => {
    if (!this.data.hasValue()) return [];
    const { shift, adjustments } = this.data.value();
    return shift.counts
      .filter((c) => adjustments.some((a) => a.methodId === c.methodId))
      .map((c) => ({
        name: c.name,
        before: variance(c),
        after: adjustedVariance(c, adjustments),
      }));
  });

  constructor() {
    this.store.loadLookups();
  }

  protected statusText(): string {
    return this.data.hasValue() ? SHIFT_STATUS_LABEL[this.data.value().shift.status] : '';
  }

  protected saleStatus(sale: Sale): string {
    return SALE_STATUS_LABEL[sale.status];
  }

  protected saleBadge(sale: Sale): string {
    return SALE_STATUS_BADGE[sale.status];
  }

  /** The bill was voided in this shift (its money went out of this drawer). */
  protected voidedHere(sale: Sale): boolean {
    return this.data.hasValue() && sale.voidShiftId === this.data.value().shift.id;
  }

  protected soldHere(sale: Sale): boolean {
    return this.data.hasValue() && sale.shiftId === this.data.value().shift.id;
  }

  protected approve(): void {
    if (!this.data.hasValue()) return;
    const shift = this.data.value().shift;
    openConfirm(this.dialog, {
      title: 'อนุมัติส่วนต่าง',
      message: `อนุมัติส่วนต่างของกะ ${shift.shiftNo} (${shift.cashier}) ใช่หรือไม่?`,
      confirmText: 'อนุมัติ',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.approveShift(shift.id)),
      )
      .subscribe(() => {
        this.notify.success(`อนุมัติส่วนต่างกะ ${shift.shiftNo} แล้ว`);
        this.data.reload();
      });
  }

  /** Admin correction of a closed shift's count (S8). */
  protected addAdjustment(): void {
    if (!this.data.hasValue()) return;
    const { shift, adjustments } = this.data.value();
    this.dialog
      .open<ShiftAdjustmentDialog, ShiftAdjustmentDialogData, ShiftAdjustmentPayload>(
        ShiftAdjustmentDialog,
        { data: { shift, adjustments }, width: '480px', maxWidth: '95vw', autoFocus: false },
      )
      .afterClosed()
      .pipe(
        filter((payload): payload is ShiftAdjustmentPayload => !!payload),
        switchMap((payload) => this.store.addAdjustment(shift.id, payload)),
      )
      .subscribe((a) => {
        this.notify.success(`บันทึกรายการปรับปรุง ${a.name} แล้ว`);
        this.data.reload();
      });
  }

  protected adjustmentReason(a: ShiftAdjustment): string {
    const label = ADJUSTMENT_REASON_LABEL[a.reasonCode];
    return a.reason ? `${label}: ${a.reason}` : label;
  }

  protected print(): void {
    const el = this.slip()?.nativeElement;
    if (el) printElement(el);
  }
}
