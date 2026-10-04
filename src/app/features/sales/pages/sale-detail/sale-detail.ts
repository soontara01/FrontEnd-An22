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
  viewChildren,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '@core/auth/auth.service';
import { Router, RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';
import {
  CreditNote,
  InvoicePaper,
  currentInvoice,
  SALE_STATUS_BADGE,
  SALE_STATUS_LABEL,
  Sale,
  SaleLine,
  creditedQty,
  round2,
  saleDay,
  todayIso,
  vatBreakdown,
  voidError,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { CreditNoteReceipt } from '@shared/components/receipt/credit-note-receipt';
import { TaxInvoiceDocument } from '@shared/components/tax-invoice/tax-invoice-document';
import { TaxInvoiceSlip } from '@shared/components/tax-invoice/tax-invoice-slip';
import { Receipt } from '@shared/components/receipt/receipt';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { printElement } from '@shared/utils/print-element';
import { SalesStore } from '../../data/sales.store';
import { VoidDialog } from '../../dialogs/void-dialog/void-dialog';

/**
 * One bill (`/sales/:id`): lines with cost / profit, payments, receipt copy, same-day void and
 * credit notes for later days and the full tax invoice (`?printCn=<id>` / `?printInv=1` print a
 * just-issued one).
 */
@Component({
  selector: 'app-sale-detail',
  imports: [
    DecimalPipe,
    RouterLink,
    PageHeader,
    LoadingSpinner,
    Receipt,
    CreditNoteReceipt,
    TaxInvoiceDocument,
    TaxInvoiceSlip,
    MatButtonToggleModule,
    ThaiDatePipe,
    MATERIAL,
  ],
  templateUrl: './sale-detail.html',
  styleUrl: './sale-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SaleDetail {
  protected readonly store = inject(SalesStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);

  /** Route param (withComponentInputBinding). */
  readonly id = input.required<string>();
  /** Query param: credit note to print right away */
  readonly printCn = input<string>();
  /** Query param: print the full tax invoice (original) right away */
  readonly printInv = input<string>();

  private readonly receipt = viewChild('receipt', { read: ElementRef<HTMLElement> });
  private readonly noteSlips = viewChildren('noteSlip', { read: ElementRef<HTMLElement> });
  private readonly invOriginal = viewChild('invOriginal', { read: ElementRef<HTMLElement> });
  private readonly invCopy = viewChild('invCopy', { read: ElementRef<HTMLElement> });

  protected readonly sale = rxResource({
    params: () => Number(this.id()),
    stream: ({ params }) => this.store.get(params),
  });
  protected readonly notes = rxResource({
    params: () => Number(this.id()),
    stream: ({ params }) => this.store.creditNotesOf(params),
  });
  protected readonly creditNotes = computed<CreditNote[]>(() =>
    this.notes.hasValue() ? this.notes.value() : [],
  );
  protected readonly isAdmin = computed(() => this.auth.user()?.role === 'admin');
  /** Credit notes are for paid POS bills from the day after the sale, with units left. */
  protected readonly canCredit = computed(() => {
    if (!this.sale.hasValue() || !this.isPos()) return false;
    const s = this.sale.value();
    return (
      s.status === 'paid' &&
      saleDay(s) !== todayIso() &&
      s.lines.some((l, i) => l.qty > creditedQty(this.creditNotes(), i))
    );
  });
  /** Every full tax invoice of the bill (cancelled ones first, the valid one last). */
  protected readonly invoices = rxResource({
    params: () => Number(this.id()),
    stream: ({ params }) => this.store.taxInvoicesOf(params),
  });
  protected readonly taxInvoice = computed(() =>
    currentInvoice(this.invoices.hasValue() ? this.invoices.value() : []),
  );
  /** Earlier invoices cancelled and replaced (history). */
  protected readonly replacedInvoices = computed(() =>
    (this.invoices.hasValue() ? this.invoices.value() : []).filter((i) => i !== this.taxInvoice()),
  );
  /** Wrong buyer details: admins cancel the valid invoice and issue a corrected one. */
  protected readonly canReissue = computed(
    () =>
      this.isAdmin() &&
      this.sale.hasValue() &&
      this.sale.value().status === 'paid' &&
      !!this.taxInvoice() &&
      !this.taxInvoice()?.cancelledAt,
  );
  /** Full tax invoice can be issued: VAT store, paid POS bill, none yet. */
  protected readonly canInvoice = computed(
    () =>
      !!this.store.storeInfo()?.vatRegistered &&
      this.isPos() &&
      this.sale.hasValue() &&
      this.sale.value().status === 'paid' &&
      !this.sale.value().taxInvoiceNo,
  );
  private printed = false;
  private invoicePrinted = false;
  /** Paper for printing the full tax invoice here (null = the store's default). */
  private readonly paperChoice = signal<InvoicePaper | null>(null);
  protected readonly paper = computed<InvoicePaper>(
    () => this.paperChoice() ?? this.store.storeInfo()?.taxInvoicePaper ?? 'A4',
  );

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
    // Print the original of a tax invoice just issued by the tax-invoice page (once).
    effect(() => {
      const el = this.invOriginal()?.nativeElement;
      if (this.invoicePrinted || !this.printInv() || !el) return;
      this.invoicePrinted = true;
      setTimeout(() => printElement(el, this.paper() === '80mm' ? 'fit' : 'A4'));
    });
    // Print a credit note just issued by the credit-note page (once).
    effect(() => {
      const id = Number(this.printCn());
      const index = this.creditNotes().findIndex((n) => n.id === id);
      const slip = this.noteSlips()[index];
      if (this.printed || index < 0 || !slip) return;
      this.printed = true;
      setTimeout(() => printElement(slip.nativeElement));
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

  protected returnedQty(index: number): number {
    return creditedQty(this.creditNotes(), index);
  }

  protected printNote(index: number): void {
    const slip = this.noteSlips()[index];
    if (slip) printElement(slip.nativeElement);
  }

  protected setPaper(paper: InvoicePaper): void {
    this.paperChoice.set(paper);
  }

  protected printInvoice(copy: boolean): void {
    const el = (copy ? this.invCopy() : this.invOriginal())?.nativeElement;
    if (el) printElement(el, this.paper() === '80mm' ? 'fit' : 'A4');
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
        this.invoices.reload();
        this.notify.success(`${voided.orderNo}: ยกเลิกบิลแล้ว สินค้ากลับเข้าคลัง`);
      });
  }
}
