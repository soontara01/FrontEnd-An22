import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { Observable, filter, switchMap } from 'rxjs';
import {
  BILLING_INVOICE_STATUS_LABEL,
  BillingInvoice,
  PLANS,
  PlanId,
  PlatformCompanyDetail,
  SUBSCRIPTION_STATUS_LABEL,
  SUSPEND_REASON_LABEL,
  isInvoiced,
  passwordError,
  payInvoiceError,
  purgeError,
  todayIso,
  planOf,
  reactivateCompanyError,
  suspendCompanyError,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { PlatformApi } from '../../data/platform-api.service';

/**
 * One company for the SaaS operator (E36): package, suspend / turn back on, invoices (mark paid),
 * the owner's password. Same rules as the server (`platform.model.ts`).
 */
@Component({
  selector: 'app-company-detail',
  imports: [
    CurrencyPipe,
    RouterLink,
    MatTableModule,
    PageHeader,
    LoadingSpinner,
    ThaiDatePipe,
    MATERIAL,
  ],
  templateUrl: './company-detail.html',
  styleUrl: './company-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CompanyDetail {
  private readonly api = inject(PlatformApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);

  /** Route param (withComponentInputBinding) */
  readonly id = input.required<string>();

  protected readonly plans = PLANS;
  protected readonly invoiceColumns = [
    'invoiceNo',
    'period',
    'amount',
    'dueDate',
    'status',
    'actions',
  ];
  protected readonly busy = signal(false);
  protected readonly planId = signal<PlanId | null>(null);
  protected readonly note = signal('');
  protected readonly password = signal('');
  protected readonly passwordTouched = signal(false);

  protected readonly data = rxResource({
    params: () => Number(this.id()),
    stream: ({ params }) => this.api.company(params),
  });
  private readonly overridden = signal<PlatformCompanyDetail | null>(null);
  protected readonly company = computed(
    () => this.overridden() ?? (this.data.hasValue() ? this.data.value() : null),
  );
  protected readonly selectedPlan = computed(() => this.planId() ?? this.company()?.planId ?? null);
  protected readonly suspendProblem = computed(() => {
    const c = this.company();
    return c ? suspendCompanyError(c, this.note()) : null;
  });
  protected readonly reactivateProblem = computed(() => {
    const c = this.company();
    return c ? reactivateCompanyError(c) : null;
  });
  protected readonly passwordProblem = computed(() => passwordError(this.password()));
  protected readonly purgeProblem = computed(() => {
    const c = this.company();
    return c ? purgeError(c.deletion, todayIso()) : null;
  });

  protected statusText(c: PlatformCompanyDetail): string {
    if (c.deletedAt) return 'ลบข้อมูลแล้ว';
    if (!c.active && c.suspendedReason) return `ระงับ: ${SUSPEND_REASON_LABEL[c.suspendedReason]}`;
    return SUBSCRIPTION_STATUS_LABEL[c.status];
  }

  protected invoiced(c: PlatformCompanyDetail): boolean {
    return isInvoiced(c.subscription);
  }

  protected planName(id: PlanId): string {
    return planOf(id).name;
  }

  protected invoiceStatus(i: BillingInvoice): string {
    return BILLING_INVOICE_STATUS_LABEL[i.status];
  }

  protected canPay(i: BillingInvoice): boolean {
    return !payInvoiceError(i);
  }

  protected savePlan(): void {
    const c = this.company();
    const planId = this.selectedPlan();
    if (!c || !planId || planId === c.planId) return;
    this.run(this.api.changePlan(c.id, planId), `เปลี่ยนเป็นแพ็กเกจ ${planOf(planId).name} แล้ว`);
  }

  protected suspend(): void {
    const c = this.company();
    if (!c || this.suspendProblem()) return;
    this.confirmThen(
      `ระงับบริษัท ${c.code}`,
      'ผู้ใช้ทุกคนของบริษัทจะเข้าระบบไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง',
      () => this.api.suspend(c.id, this.note()),
    );
  }

  protected reactivate(): void {
    const c = this.company();
    if (!c || this.reactivateProblem()) return;
    this.run(this.api.reactivate(c.id), `เปิดใช้งาน ${c.code} แล้ว`);
  }

  protected pay(invoice: BillingInvoice): void {
    this.confirmThen(
      `รับชำระ ${invoice.invoiceNo}`,
      `ยืนยันว่าได้รับเงิน ฿${invoice.amount.toLocaleString('th-TH')} แล้ว`,
      () => this.api.payInvoice(invoice.id),
    );
  }

  protected purge(): void {
    const c = this.company();
    if (!c || this.purgeProblem()) return;
    this.confirmThen(
      `ลบข้อมูลบริษัท ${c.code} ถาวร`,
      'ข้อมูลทั้งหมดของบริษัทจะถูกลบและกู้คืนไม่ได้ รหัสบริษัทจะใช้ซ้ำไม่ได้',
      () => this.api.purge(c.id),
    );
  }

  protected setOwnerPassword(): void {
    const c = this.company();
    this.passwordTouched.set(true);
    if (!c || this.passwordProblem() || this.busy()) return;
    this.busy.set(true);
    this.api.setOwnerPassword(c.id, this.password()).subscribe({
      next: () => {
        this.busy.set(false);
        this.password.set('');
        this.passwordTouched.set(false);
        this.notify.success('ตั้งรหัสผ่านใหม่ให้เจ้าของบริษัทแล้ว — แจ้งรหัสนี้ให้เจ้าของ');
      },
      error: () => this.busy.set(false),
    });
  }

  private confirmThen(
    title: string,
    message: string,
    action: () => Observable<PlatformCompanyDetail>,
  ): void {
    openConfirm(this.dialog, { title, message, confirmText: 'ยืนยัน' })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.busy.set(true);
          return action();
        }),
      )
      .subscribe({
        next: (detail) => this.done(detail, 'บันทึกแล้ว'),
        error: () => this.busy.set(false),
      });
  }

  private run(request$: Observable<PlatformCompanyDetail>, message: string): void {
    this.busy.set(true);
    request$.subscribe({
      next: (detail) => this.done(detail, message),
      error: () => this.busy.set(false),
    });
  }

  private done(detail: PlatformCompanyDetail, message: string): void {
    this.overridden.set(detail);
    this.planId.set(null);
    this.note.set('');
    this.busy.set(false);
    this.notify.success(message);
  }
}
