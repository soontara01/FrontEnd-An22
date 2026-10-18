import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import {
  TRANSFER_STATUS_BADGE,
  TRANSFER_STATUS_LABEL,
  Transfer,
  TransferReceivePayload,
  cancelTransferError,
  receiveTransferError,
  round2,
  shortQty,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { printElement } from '@shared/utils/print-element';
import { TransferDocument } from '../../components/transfer-document';
import { TransfersStore } from '../../data/transfers.store';

interface ReceiveRow {
  productId: number;
  receivedQty: number;
  receivedSerials: string[];
}

/**
 * One transfer (`/transfers/:id`): its lines, receiving at the destination (once, shortfall with a
 * reason — E27 / E28), cancelling at the source by an admin (E29) and the A4 slip (E31).
 */
@Component({
  selector: 'app-transfer-detail',
  imports: [
    DecimalPipe,
    MatCheckboxModule,
    RouterLink,
    PageHeader,
    LoadingSpinner,
    ThaiDatePipe,
    TransferDocument,
    MATERIAL,
  ],
  templateUrl: './transfer-detail.html',
  styleUrl: '../transfers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class TransferDetail {
  protected readonly store = inject(TransfersStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);
  private readonly slip = viewChild('slip', { read: ElementRef<HTMLElement> });

  /** Route param (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly data = rxResource({
    params: () => Number(this.id()),
    stream: ({ params }) => this.store.get(params),
  });
  /** Costs only for who may see cost (E14 → E43; the server sends `unitCost: null` otherwise) */
  protected readonly showCost = this.auth.canSeeCost;
  protected readonly company = computed(() => this.auth.company()?.name ?? '');
  private readonly here = computed(() => this.auth.currentBranch()?.id ?? null);

  protected readonly canReceive = computed(() => {
    const t = this.data.hasValue() ? this.data.value() : null;
    return !!t && t.status === 'in_transit' && t.toBranchId === this.here();
  });
  protected readonly canCancel = computed(() => {
    const t = this.data.hasValue() ? this.data.value() : null;
    return (
      !!t && t.status === 'in_transit' && t.fromBranchId === this.here() && this.auth.isAdmin()
    );
  });

  protected readonly rows = signal<ReceiveRow[]>([]);
  protected readonly shortReason = signal('');
  protected readonly cancelling = signal(false);
  protected readonly cancelReason = signal('');
  protected readonly busy = signal(false);

  private readonly payload = computed<TransferReceivePayload>(() => ({
    lines: this.rows(),
    shortReason: this.shortReason(),
  }));
  protected readonly receiveProblem = computed(() =>
    this.data.hasValue()
      ? receiveTransferError(this.data.value(), this.payload(), this.here())
      : null,
  );
  protected readonly isShort = computed(() => {
    if (!this.data.hasValue()) return false;
    return this.data
      .value()
      .lines.some(
        (l) => (this.rows().find((r) => r.productId === l.productId)?.receivedQty ?? l.qty) < l.qty,
      );
  });
  protected readonly cancelProblem = computed(() =>
    this.data.hasValue()
      ? cancelTransferError(
          this.data.value(),
          this.here(),
          this.auth.isAdmin(),
          this.cancelReason(),
        )
      : null,
  );

  constructor() {
    this.store.loadBranches();
    effect(() => {
      if (this.data.error()) void this.router.navigate(['/transfers']);
    });
    // Receiving starts from "everything arrived".
    effect(() => {
      if (!this.data.hasValue()) return;
      this.rows.set(
        this.data.value().lines.map((l) => ({
          productId: l.productId,
          receivedQty: l.qty,
          receivedSerials: [...l.serials],
        })),
      );
    });
  }

  protected statusText(t: Transfer): string {
    return TRANSFER_STATUS_LABEL[t.status];
  }

  protected statusBadge(t: Transfer): string {
    return TRANSFER_STATUS_BADGE[t.status];
  }

  protected short(line: Transfer['lines'][number]): number {
    return shortQty(line);
  }

  protected value(line: Transfer['lines'][number]): number {
    return round2(line.qty * line.unitCost);
  }

  protected row(productId: number): ReceiveRow | undefined {
    return this.rows().find((r) => r.productId === productId);
  }

  protected setQty(productId: number, value: string): void {
    const qty = Number(value);
    this.rows.update((rows) =>
      rows.map((r) => (r.productId === productId ? { ...r, receivedQty: qty } : r)),
    );
  }

  protected toggleSerial(productId: number, serial: string, on: boolean): void {
    this.rows.update((rows) =>
      rows.map((r) => {
        if (r.productId !== productId) return r;
        const set = new Set(r.receivedSerials);
        if (on) set.add(serial);
        else set.delete(serial);
        return { ...r, receivedSerials: [...set], receivedQty: set.size };
      }),
    );
  }

  protected receive(t: Transfer): void {
    if (this.receiveProblem() || this.busy()) return;
    this.busy.set(true);
    this.store.receive(t.id, this.payload()).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.data.set(updated);
        this.notify.success(`รับของตามใบโอน ${updated.transferNo} แล้ว`);
      },
      error: () => this.busy.set(false),
    });
  }

  protected cancel(t: Transfer): void {
    if (this.cancelProblem() || this.busy()) return;
    this.busy.set(true);
    this.store.cancel(t.id, this.cancelReason().trim()).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.cancelling.set(false);
        this.data.set(updated);
        this.notify.success(`ยกเลิกใบโอน ${updated.transferNo} แล้ว — ของกลับเข้าสาขานี้`);
      },
      error: () => this.busy.set(false),
    });
  }

  protected print(): void {
    const el = this.slip()?.nativeElement;
    if (el) printElement(el, 'A4');
  }
}
