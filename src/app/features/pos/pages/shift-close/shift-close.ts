import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  CountCheckResult,
  DenominationCount,
  ShiftClosePayload,
  ShiftCountInput,
  ShiftSummary,
  VARIANCE_REASON_LABEL,
  VarianceReason,
  closeShiftError,
  countInputsError,
  denominationTotal,
  round2,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { ShiftSlip } from '@shared/components/shift-slip/shift-slip';
import { MATERIAL } from '@shared/material';
import { printElement } from '@shared/utils/print-element';
import { DenominationCounter } from '../../components/denomination-counter/denomination-counter';
import { PosStore } from '../../data/pos.store';

type Step = 'count' | 'review' | 'done';

/**
 * Closing the POS shift (docs/shift-plan.md S1–S5): blind count of every method on the checklist
 * (cash per banknote / coin) → the server reveals expected amounts and variances
 * (`count-check`) → one recount allowed (first count kept), a reason per variance, deposit and
 * float left, admin approval at the terminal or pending → close → Z report (80 mm).
 */
@Component({
  selector: 'app-shift-close',
  imports: [
    DecimalPipe,
    RouterLink,
    LoadingSpinner,
    PageHeader,
    ShiftSlip,
    DenominationCounter,
    MATERIAL,
  ],
  templateUrl: './shift-close.html',
  styleUrl: './shift-close.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ShiftClose {
  protected readonly store = inject(PosStore);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);
  private readonly slip = viewChild('slip', { read: ElementRef<HTMLElement> });

  protected readonly reasons = Object.entries(VARIANCE_REASON_LABEL) as [VarianceReason, string][];
  protected readonly step = signal<Step>('count');
  protected readonly busy = signal(false);
  protected readonly summary = signal<ShiftSummary | null>(null);
  protected readonly zSummary = signal<ShiftSummary | null>(null);
  protected readonly check = signal<CountCheckResult | null>(null);

  /** Blind count per method id */
  protected readonly counted = signal<Record<number, number | null>>({});
  protected readonly confirmed = signal<Record<number, boolean>>({});
  protected readonly useCounter = signal(true);
  protected readonly cashCounts = signal<DenominationCount[]>([]);
  /** Counts of the first check, kept when the cashier recounts (once) */
  protected readonly firstCounts = signal<Record<number, number | null> | null>(null);
  protected readonly reasonCode = signal<Record<number, VarianceReason | null>>({});
  protected readonly reasonText = signal<Record<number, string>>({});
  protected readonly deposit = signal(0);
  protected readonly note = signal('');
  protected readonly approveNow = signal(false);
  protected readonly approverName = signal('');
  protected readonly approverPassword = signal('');

  protected readonly checklist = computed(() => this.summary()?.checklist ?? []);
  private readonly drawerId = computed(
    () => this.checklist().find((c) => c.type === 'cash')?.methodId ?? null,
  );
  protected readonly cashCounted = computed(() =>
    this.useCounter()
      ? denominationTotal(this.cashCounts())
      : this.counted()[this.drawerId() ?? -1],
  );

  private readonly inputs = computed<ShiftCountInput[]>(() =>
    this.checklist().map((item) => {
      const isDrawer = item.methodId === this.drawerId();
      const counted =
        item.closeCheck !== 'count'
          ? null
          : isDrawer
            ? (this.cashCounted() ?? null)
            : (this.counted()[item.methodId] ?? null);
      return {
        methodId: item.methodId,
        counted,
        firstCount: this.firstCounts()?.[item.methodId] ?? null,
        confirmed: !!this.confirmed()[item.methodId],
        reasonCode: this.reasonCode()[item.methodId] ?? null,
        reason: (this.reasonText()[item.methodId] ?? '').trim(),
      };
    }),
  );
  protected readonly countProblem = computed(() =>
    countInputsError(this.checklist(), this.inputs()),
  );

  private readonly payload = computed<ShiftClosePayload>(() => ({
    counts: this.inputs(),
    cashDenominations: this.useCounter() ? this.cashCounts() : [],
    depositAmount: Number(this.deposit()) || 0,
    note: this.note().trim(),
    approval: this.approveNow()
      ? { username: this.approverName().trim(), password: this.approverPassword() }
      : null,
  }));
  protected readonly floatLeft = computed(() =>
    round2((this.cashCounted() ?? 0) - this.payload().depositAmount),
  );
  /** Approval needed and the closer cannot approve (admins closing approve themselves) */
  protected readonly needsApprover = computed(
    () => !!this.check()?.needsApproval && !this.store.isAdmin(),
  );
  protected readonly closeProblem = computed(() => {
    const shift = this.store.shift();
    const check = this.check();
    if (!shift || !check) return null;
    const problem = closeShiftError(shift, this.payload(), check.lines, {
      user: this.store.userName(),
      isAdmin: this.store.isAdmin(),
    });
    if (problem) return problem;
    if (this.approveNow() && (!this.approverName().trim() || !this.approverPassword())) {
      return 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านของผู้ดูแลระบบที่อนุมัติ';
    }
    return null;
  });

  constructor() {
    // Opened directly (reload): load the POS data, including this terminal's open shift.
    if (!this.store.shiftLoaded()) this.store.load();
    effect(() => {
      const shift = this.store.shift();
      if (!shift || this.summary() || this.step() === 'done') return;
      this.store.shiftSummary(shift.id).subscribe((s) => this.summary.set(s));
    });
  }

  protected setCounted(methodId: number, raw: string): void {
    const value = raw === '' ? null : Number(raw);
    this.counted.update((all) => ({ ...all, [methodId]: value }));
  }

  protected setConfirmed(methodId: number, value: boolean): void {
    this.confirmed.update((all) => ({ ...all, [methodId]: value }));
  }

  protected setReasonCode(methodId: number, code: VarianceReason | null): void {
    this.reasonCode.update((all) => ({ ...all, [methodId]: code }));
  }

  protected setReasonText(methodId: number, text: string): void {
    this.reasonText.update((all) => ({ ...all, [methodId]: text }));
  }

  /** Sends the blind count; the server answers with the expected amounts and variances. */
  protected runCheck(): void {
    if (this.countProblem() || this.busy()) return;
    this.busy.set(true);
    this.store.countCheck(this.inputs()).subscribe({
      next: (check) => {
        this.check.set(check);
        const shift = this.store.shift();
        // Default: deposit everything above the float the shift started with.
        const keep = shift?.openingFloat ?? 0;
        this.deposit.set(Math.max(0, round2((this.cashCounted() ?? 0) - keep)));
        this.step.set('review');
        this.busy.set(false);
      },
      error: () => this.busy.set(false),
    });
  }

  /** One recount (S2): the first counts are kept and printed on the Z report. */
  protected recount(): void {
    const first: Record<number, number | null> = {};
    for (const input of this.inputs()) first[input.methodId] = input.counted;
    this.firstCounts.set(first);
    this.counted.set({});
    this.cashCounts.set([]);
    this.check.set(null);
    this.step.set('count');
  }

  protected close(): void {
    if (this.closeProblem() || this.busy()) return;
    this.busy.set(true);
    this.store.closeShift(this.payload()).subscribe({
      next: (closed) => {
        this.notify.success(`ปิดกะ ${closed.shiftNo} แล้ว`);
        this.step.set('done');
        this.busy.set(false);
        this.store.shiftSummary(closed.id).subscribe((s) => this.zSummary.set(s));
      },
      error: () => this.busy.set(false),
    });
  }

  protected print(): void {
    const el = this.slip()?.nativeElement;
    if (el) printElement(el);
  }

  protected backToPos(): void {
    void this.router.navigate(['/pos']);
  }
}
