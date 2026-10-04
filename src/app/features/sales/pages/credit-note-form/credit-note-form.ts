import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import {
  CreditNote,
  CreditNoteLineInput,
  CreditNotePayload,
  PAYMENT_TYPE_ICON,
  PaymentInput,
  RefundOption,
  Sale,
  creditNoteError,
  draftCreditNote,
  refundOptions,
  remainingQty,
  round2,
  todayIso,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { SalesStore } from '../../data/sales.store';

interface Row {
  index: number;
  remaining: number;
  qty: number;
  restock: boolean;
}

/**
 * Credit note for a bill of an earlier day (`/sales/:id/credit-note`, admins only): pick the
 * returned units, see the refund priced by `draftCreditNote()` (free goods kept are deducted)
 * and split the refund over cash / the bill's own methods (`refundOptions()`).
 */
@Component({
  selector: 'app-credit-note-form',
  imports: [
    DecimalPipe,
    RouterLink,
    MatCheckboxModule,
    PageHeader,
    LoadingSpinner,
    ThaiDatePipe,
    MATERIAL,
  ],
  templateUrl: './credit-note-form.html',
  styleUrl: './credit-note-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CreditNoteForm {
  protected readonly store = inject(SalesStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  /** Route param (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly icon = PAYMENT_TYPE_ICON;
  protected readonly quickReasons = ['สินค้าชำรุด', 'ลูกค้าคืนสินค้า', 'เปลี่ยนสินค้า'];
  protected readonly isAdmin = computed(() => this.auth.user()?.role === 'admin');

  protected readonly data = rxResource({
    params: () => Number(this.id()),
    stream: ({ params }) => this.store.withCreditNotes(params),
  });

  protected readonly rows = signal<Row[]>([]);
  protected readonly refunds = signal<PaymentInput[]>([]);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);

  private readonly sale = computed<Sale | null>(() =>
    this.data.hasValue() ? this.data.value().sale : null,
  );
  private readonly notes = computed<CreditNote[]>(() =>
    this.data.hasValue() ? this.data.value().notes : [],
  );
  private readonly inputs = computed<CreditNoteLineInput[]>(() =>
    this.rows().map((r) => ({ saleLineIndex: r.index, qty: r.qty, restock: r.restock })),
  );
  protected readonly draft = computed(() => {
    const sale = this.sale();
    return sale
      ? draftCreditNote(sale, this.notes(), this.inputs(), this.store.promotions())
      : null;
  });
  protected readonly options = computed<RefundOption[]>(() => {
    const sale = this.sale();
    return sale ? refundOptions(sale, this.notes(), this.store.methods()) : [];
  });
  private readonly payload = computed<CreditNotePayload>(() => ({
    lines: this.inputs().filter((i) => i.qty > 0),
    refunds: this.refunds(),
    reason: this.reason().trim(),
    expectedTotal: this.draft()?.total ?? 0,
  }));
  protected readonly problem = computed(() => {
    const sale = this.sale();
    if (!sale) return null;
    if (!this.isAdmin()) return 'เฉพาะผู้ดูแลระบบ (admin) ออกใบลดหนี้ได้';
    return creditNoteError(sale, this.notes(), this.payload(), {
      promotions: this.store.promotions(),
      methods: this.store.methods(),
      today: todayIso(),
    });
  });
  protected readonly refunded = computed(() =>
    round2(this.refunds().reduce((n, r) => n + r.amount, 0)),
  );

  constructor() {
    this.store.loadLookups();
    effect(() => {
      const sale = this.sale();
      if (!sale) return;
      const notes = this.notes();
      this.rows.set(
        sale.lines.map((l, index) => ({
          index,
          remaining: remainingQty(sale, notes, index),
          qty: 0,
          restock: l.itemType !== 'service',
        })),
      );
    });
    // A new refund total re-splits the refund: the bill's own methods first, the rest in cash.
    effect(() => {
      const total = this.draft()?.total ?? 0;
      const options = this.options();
      untracked(() => this.refunds.set(autoRefunds(total, options)));
    });
    effect(() => {
      if (this.data.error()) void this.router.navigate(['/sales']);
    });
  }

  protected line(row: Row) {
    return this.sale()!.lines[row.index];
  }

  protected setQty(row: Row, value: string | number): void {
    const qty = Math.max(0, Math.min(row.remaining, Math.floor(Number(value) || 0)));
    this.rows.update((rows) => rows.map((r) => (r.index === row.index ? { ...r, qty } : r)));
  }

  protected setRestock(row: Row, restock: boolean): void {
    this.rows.update((rows) => rows.map((r) => (r.index === row.index ? { ...r, restock } : r)));
  }

  /** Ticks every remaining unit (whole bill back). */
  protected returnAll(): void {
    this.rows.update((rows) => rows.map((r) => ({ ...r, qty: r.remaining })));
  }

  protected optionOf(refund: PaymentInput): RefundOption | undefined {
    return this.options().find((o) => o.method.id === refund.methodId);
  }

  protected setRefund(index: number, patch: Partial<PaymentInput>): void {
    this.refunds.update((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  protected setRefundAmount(index: number, value: string): void {
    const amount = Number(value);
    this.setRefund(index, { amount: Number.isFinite(amount) ? round2(amount) : 0 });
  }

  protected addRefund(option: RefundOption): void {
    if (this.refunds().some((r) => r.methodId === option.method.id)) return;
    const left = round2((this.draft()?.total ?? 0) - this.refunded());
    const amount = Math.max(0, option.max === null ? left : Math.min(left, option.max));
    this.refunds.update((list) => [
      ...list,
      { methodId: option.method.id, amount, reference: '', installmentMonths: null },
    ]);
  }

  protected removeRefund(index: number): void {
    this.refunds.update((list) => list.filter((_, i) => i !== index));
  }

  protected save(): void {
    const sale = this.sale();
    if (!sale || this.problem() || this.saving()) return;
    this.saving.set(true);
    this.store.createCreditNote(sale.id, this.payload()).subscribe({
      next: (note) => {
        this.notify.success(`ออกใบลดหนี้ ${note.cnNo} แล้ว`);
        void this.router.navigate(['/sales', sale.id], { queryParams: { printCn: note.id } });
      },
      error: () => {
        this.saving.set(false);
        this.data.reload();
      },
    });
  }
}

/** Bill's own (capped) methods first, then cash for the rest. */
function autoRefunds(total: number, options: readonly RefundOption[]): PaymentInput[] {
  const result: PaymentInput[] = [];
  let left = total;
  for (const o of [...options].sort((a, b) => Number(a.max === null) - Number(b.max === null))) {
    if (left <= 0) break;
    const amount = round2(o.max === null ? left : Math.min(left, o.max));
    if (amount <= 0) continue;
    result.push({ methodId: o.method.id, amount, reference: '', installmentMonths: null });
    left = round2(left - amount);
  }
  return result;
}
