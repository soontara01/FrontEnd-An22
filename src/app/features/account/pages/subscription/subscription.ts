import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { filter, switchMap } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import {
  BILLING_INVOICE_STATUS_LABEL,
  BillingInvoice,
  GRACE_DAYS,
  LIMIT_LABEL,
  LimitKind,
  PLANS,
  Plan,
  SUBSCRIPTION_STATUS_BADGE,
  SUBSCRIPTION_STATUS_LABEL,
  SubscriptionStatus,
  isInvoiced,
  overLimits,
  planOf,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { SubscriptionService } from '@core/services/subscription.service';
import { AdminOnlyNote } from '@shared/components/admin-only-note/admin-only-note';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';

/**
 * Package of the company (E34): the three packages with their limits, what the company uses, and
 * — for the owner — changing package (a downgrade only stops adding more).
 */
@Component({
  selector: 'app-subscription',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    MatProgressBarModule,
    MatTableModule,
    AdminOnlyNote,
    LoadingSpinner,
    ThaiDatePipe,
    MATERIAL,
  ],
  templateUrl: './subscription.html',
  styleUrl: './subscription.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Subscription {
  protected readonly subscription = inject(SubscriptionService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);
  protected readonly isOwner = inject(AuthService).isOwner;

  protected readonly plans = PLANS;
  protected readonly kinds = Object.keys(LIMIT_LABEL) as LimitKind[];
  protected readonly saving = signal(false);
  protected readonly graceDays = GRACE_DAYS;
  protected readonly invoiceColumns = [
    'invoiceNo',
    'period',
    'plan',
    'amount',
    'dueDate',
    'status',
  ];
  protected readonly statusText = computed(() => {
    const status = this.info()?.status;
    return status ? SUBSCRIPTION_STATUS_LABEL[status] : '';
  });
  protected readonly statusBadge = computed(() => {
    const status = this.info()?.status;
    return status ? SUBSCRIPTION_STATUS_BADGE[status] : '';
  });
  protected readonly info = this.subscription.info;
  protected readonly current = this.subscription.plan;
  /** What a downgrade left over the package ('' = nothing) */
  protected readonly overText = computed(() => {
    const info = this.info();
    if (!info) return '';
    return overLimits(this.current(), info.usage)
      .map((k) => LIMIT_LABEL[k].noun)
      .join(', ');
  });

  constructor() {
    this.subscription.load(true);
  }

  /** The seed DEMO is never invoiced (C3-4): no "next invoice" line. */
  protected readonly invoiced = computed(() => {
    const info = this.info();
    return !!info && isInvoiced(info.subscription);
  });

  protected statusIs(status: SubscriptionStatus): boolean {
    return this.info()?.status === status;
  }

  protected planName(invoice: BillingInvoice): string {
    return planOf(invoice.planId).name;
  }

  protected invoiceStatus(invoice: BillingInvoice): string {
    return BILLING_INVOICE_STATUS_LABEL[invoice.status];
  }

  protected label(kind: LimitKind): string {
    return LIMIT_LABEL[kind].noun;
  }

  protected limitText(plan: Plan, kind: LimitKind): string {
    const limit = plan.limits[kind];
    return limit === null ? 'ไม่จำกัด' : `${limit} ${LIMIT_LABEL[kind].unit}`;
  }

  protected usageText(kind: LimitKind): string {
    const used = this.info()?.usage[kind] ?? 0;
    const limit = this.current().limits[kind];
    return limit === null ? `${used}` : `${used} / ${limit}`;
  }

  /** Share of the limit used, 0–100 (unlimited = 0). */
  protected usagePercent(kind: LimitKind): number {
    const limit = this.current().limits[kind];
    if (!limit) return 0;
    return Math.min(100, ((this.info()?.usage[kind] ?? 0) / limit) * 100);
  }

  /** Kinds a package would leave over its limit, for the confirm message. */
  protected wouldBeOver(plan: Plan): string {
    const info = this.info();
    if (!info) return '';
    return overLimits(plan, info.usage)
      .map((k) => LIMIT_LABEL[k].noun)
      .join(', ');
  }

  protected choose(plan: Plan): void {
    const over = this.wouldBeOver(plan);
    openConfirm(this.dialog, {
      title: `เปลี่ยนเป็นแพ็กเกจ ${plan.name}`,
      message:
        `ค่าบริการ ฿${plan.monthlyPrice.toLocaleString('th-TH')} / เดือน (รวม VAT)` +
        (over ? ` — ตอนนี้ใช้${over}เกินแพ็กเกจนี้: ของเดิมใช้ต่อได้ แต่เพิ่มใหม่ไม่ได้` : ''),
      confirmText: 'เปลี่ยนแพ็กเกจ',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.saving.set(true);
          return this.subscription.changePlan(plan.id);
        }),
      )
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notify.success(`เปลี่ยนเป็นแพ็กเกจ ${plan.name} แล้ว`);
        },
        error: () => this.saving.set(false),
      });
  }
}
