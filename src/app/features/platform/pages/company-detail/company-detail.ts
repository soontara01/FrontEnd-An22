import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { Observable, filter, switchMap } from 'rxjs';
import {
  BILLING_INVOICE_STATUS_LABEL,
  BillingInvoice,
  PLANS,
  PlanId,
  PlatformCompanyDetail,
  SetupLink,
  SUBSCRIPTION_STATUS_LABEL,
  SUSPEND_REASON_LABEL,
  isInvoiced,
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
import { SetupLinkCard } from '../../components/setup-link-card/setup-link-card';
import { PlatformApi } from '../../data/platform-api.service';

/**
 * One company for the SaaS operator (E36): package, suspend / turn back on, invoices (mark paid),
 * the owner's setup link (E59 — the platform never types a password), clearing a user's
 * Authenticator (E58). Same rules as the server (`platform.model.ts`).
 */
@Component({
  selector: 'app-company-detail',
  imports: [
    CurrencyPipe,
    RouterLink,
    MatTableModule,
    PageHeader,
    LoadingSpinner,
    SetupLinkCard,
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
  private readonly router = inject(Router);

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
  /** The owner's newest setup link (E59), shown once on this page */
  protected readonly setupLink = signal<SetupLink | null>(null);
  /** E58: whose Authenticator to clear — empty = the owner */
  protected readonly mfaUsername = signal('');
  protected readonly mfaTarget = computed(
    () => this.mfaUsername().trim() || this.company()?.owner?.username || '',
  );

  protected readonly data = rxResource({
    params: () => Number(this.id()),
    stream: ({ params }) => this.api.company(params),
  });
  private readonly overridden = signal<PlatformCompanyDetail | null>(null);
  protected readonly company = computed(
    () => this.overridden() ?? (this.data.hasValue() ? this.data.value() : null),
  );
  constructor() {
    // Unknown company (the snackbar says so): back to the list, not a spinner forever (V2-P-08).
    effect(() => {
      if (this.data.error()) void this.router.navigate(['/platform/companies']);
    });
  }

  protected readonly selectedPlan = computed(() => this.planId() ?? this.company()?.planId ?? null);
  protected readonly suspendProblem = computed(() => {
    const c = this.company();
    return c ? suspendCompanyError(c, this.note()) : null;
  });
  protected readonly reactivateProblem = computed(() => {
    const c = this.company();
    return c ? reactivateCompanyError(c) : null;
  });
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

  protected issueSetupLink(): void {
    const c = this.company();
    if (!c?.owner || this.busy()) return;
    openConfirm(this.dialog, {
      title: 'ออกลิงก์ตั้งรหัสผ่าน',
      message: `ออกลิงก์ใหม่ให้ ${c.owner.name} (${c.owner.username})? ลิงก์ที่ออกไปก่อนหน้าและยังไม่ได้ใช้จะใช้ไม่ได้ — ยืนยันตัวตนเจ้าของก่อนส่ง`,
      confirmText: 'ออกลิงก์',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.busy.set(true);
          return this.api.ownerSetupLink(c.id);
        }),
      )
      .subscribe({
        next: (link) => {
          this.busy.set(false);
          this.setupLink.set(link);
          this.notify.success('ออกลิงก์แล้ว — คัดลอกส่งให้เจ้าของ');
        },
        error: () => this.busy.set(false),
      });
  }

  protected resetMfa(): void {
    const c = this.company();
    const username = this.mfaTarget();
    if (!c || !username || this.busy()) return;
    openConfirm(this.dialog, {
      title: 'ล้าง Microsoft Authenticator',
      message: `ล้าง Authenticator ของ ${username} (${c.code})? ครั้งถัดไปที่เข้าสู่ระบบจะต้องสแกน QR ใหม่`,
      confirmText: 'ล้าง',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.busy.set(true);
          return this.api.resetUserMfa(c.id, username);
        }),
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.mfaUsername.set('');
          this.notify.success(
            `ล้าง Authenticator ของ ${username} แล้ว — สแกน QR ใหม่ตอนเข้าสู่ระบบ`,
          );
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
