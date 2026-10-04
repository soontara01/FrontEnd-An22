import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';
import {
  SALE_STATUS_BADGE,
  SALE_STATUS_LABEL,
  Sale,
  SaleLine,
  round2,
  todayIso,
  vatBreakdown,
  voidError,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { Receipt } from '@shared/components/receipt/receipt';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { printElement } from '@shared/utils/print-element';
import { SalesStore } from '../../data/sales.store';
import { VoidDialog } from '../../dialogs/void-dialog/void-dialog';

/** One bill (`/sales/:id`): lines with cost / profit, payments, receipt copy and same-day void. */
@Component({
  selector: 'app-sale-detail',
  imports: [DecimalPipe, RouterLink, PageHeader, LoadingSpinner, Receipt, ThaiDatePipe, MATERIAL],
  templateUrl: './sale-detail.html',
  styleUrl: './sale-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SaleDetail {
  protected readonly store = inject(SalesStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  /** Route param (withComponentInputBinding). */
  readonly id = input.required<string>();

  private readonly receipt = viewChild('receipt', { read: ElementRef<HTMLElement> });

  protected readonly sale = rxResource({
    params: () => Number(this.id()),
    stream: ({ params }) => this.store.get(params),
  });

  /** Why the bill cannot be voided (a reason is asked later, so pass a placeholder). */
  protected readonly voidBlocker = computed(() =>
    this.sale.hasValue() ? voidError(this.sale.value(), '-', todayIso()) : null,
  );
  protected readonly isPos = computed(
    () => this.sale.hasValue() && !!this.sale.value().lines.length,
  );
  protected readonly cogs = computed(() =>
    this.sale.hasValue() ? round2(this.sale.value().lines.reduce((n, l) => n + l.cogs, 0)) : 0,
  );
  protected readonly profit = computed(() => {
    if (!this.sale.hasValue()) return 0;
    const s = this.sale.value();
    return round2(s.total - s.vat - this.cogs());
  });

  constructor() {
    this.store.loadLookups();
    effect(() => {
      if (this.sale.error()) void this.router.navigate(['/sales']);
    });
  }

  protected statusText(sale: Sale): string {
    return SALE_STATUS_LABEL[sale.status];
  }

  protected statusBadge(sale: Sale): string {
    return SALE_STATUS_BADGE[sale.status];
  }

  protected promotionNames(ids: readonly number[]): string[] {
    const names = this.store.promotionNames();
    return ids.map((id) => names.get(id) ?? `โปร #${id}`);
  }

  /** Gross profit of a line: amount net of VAT − cost. */
  protected lineProfit(line: SaleLine): number {
    return round2(vatBreakdown(line.amount, line.vatType).net - line.cogs);
  }

  protected printCopy(): void {
    const el = this.receipt()?.nativeElement;
    if (el) printElement(el);
  }

  protected voidSale(sale: Sale): void {
    this.dialog
      .open<VoidDialog, Sale, string>(VoidDialog, { data: sale, width: '480px', maxWidth: '95vw' })
      .afterClosed()
      .pipe(
        filter((reason): reason is string => !!reason),
        switchMap((reason) => this.store.void(sale.id, reason)),
      )
      .subscribe((voided) => {
        this.sale.set(voided);
        this.notify.success(`${voided.orderNo}: ยกเลิกบิลแล้ว สินค้ากลับเข้าคลัง`);
      });
  }
}
