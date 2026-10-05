import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import {
  PAYMENT_TYPE_ICON,
  PaymentInput,
  PaymentMethod,
  Sale,
  TaxInvoiceBuyer,
  allowsChange,
  buyerIdShort,
  cashDueFor,
  paymentError,
  paymentSummary,
  round2,
} from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { PosStore } from '../../data/pos.store';

/** Closing result after a successful sale. */
export interface PaymentResult {
  sale: Sale;
  /** Print the receipt now */
  print: boolean;
}

/**
 * Takes payment for the current bill (split tenders, cash change / rounding via
 * `paymentSummary()` / `paymentError()`), submits it and shows the result.
 * Closes with the saved Sale (+ whether to print), or nothing when cancelled.
 */
@Component({
  selector: 'app-payment-dialog',
  imports: [MatDialogModule, CurrencyPipe, DecimalPipe, AutofocusDirective, MATERIAL],
  templateUrl: './payment-dialog.html',
  styleUrl: './payment-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentDialog {
  protected readonly store = inject(PosStore);
  private readonly dialogRef = inject<MatDialogRef<PaymentDialog, PaymentResult>>(MatDialogRef);

  protected readonly icon = PAYMENT_TYPE_ICON;
  protected readonly total = this.store.cart().total;
  protected readonly lines = signal<PaymentInput[]>([]);
  protected readonly saving = signal(false);
  protected readonly done = signal<Sale | null>(null);

  protected readonly summary = computed(() =>
    paymentSummary(this.total, this.lines(), this.store.methods()),
  );
  protected readonly problem = computed(() =>
    paymentError(this.total, this.lines(), this.store.methods()),
  );
  protected readonly hasCash = computed(() =>
    this.lines().some((l) => this.isCash(this.method(l))),
  );
  /** Banknote shortcuts for the cash line: exact, then the next 100 / 500 / 1,000. */
  protected readonly quickCash = computed(() => {
    const due = this.summary().cashDue;
    if (!due) return [];
    const notes = [100, 500, 1000].map((n) => Math.ceil(due / n) * n);
    return [...new Set([due, ...notes])];
  });

  protected method(line: PaymentInput): PaymentMethod | undefined {
    return this.store.methods().find((m) => m.id === line.methodId);
  }

  /** Tax ID, or 'Passport AB1234567' for a foreign buyer. */
  protected buyerId(buyer: TaxInvoiceBuyer): string {
    return buyerIdShort(buyer);
  }

  protected isCash(method: PaymentMethod | undefined): boolean {
    return !!method && allowsChange(method);
  }

  /** Adds a tender line pre-filled with what is still to pay (one cash line at most). */
  protected addLine(method: PaymentMethod): void {
    const s = this.summary();
    if (this.isCash(method)) {
      if (this.hasCash()) return;
      this.lines.update((lines) => [
        ...lines,
        {
          methodId: method.id,
          amount: cashDueFor(s.remaining, method),
          reference: '',
          installmentMonths: null,
        },
      ]);
      return;
    }
    const cashPaid = this.hasCash() ? Math.min(s.tendered, s.remaining) : 0;
    const amount = round2(Math.max(s.remaining - cashPaid, 0));
    this.lines.update((lines) => [
      ...lines,
      {
        methodId: method.id,
        amount,
        reference: '',
        installmentMonths:
          method.type === 'installment' ? (method.installmentMonths[0] ?? null) : null,
      },
    ]);
  }

  protected update(index: number, patch: Partial<PaymentInput>): void {
    this.lines.update((lines) => lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  protected setAmount(index: number, value: string): void {
    const amount = Number(value);
    this.update(index, { amount: Number.isFinite(amount) ? round2(amount) : 0 });
  }

  protected setCash(amount: number): void {
    const index = this.lines().findIndex((l) => this.isCash(this.method(l)));
    if (index >= 0) this.update(index, { amount });
  }

  protected removeLine(index: number): void {
    this.lines.update((lines) => lines.filter((_, i) => i !== index));
  }

  protected confirm(): void {
    if (this.problem() || this.saving()) return;
    this.saving.set(true);
    this.store.checkout(this.lines()).subscribe({
      next: (sale) => {
        this.saving.set(false);
        this.done.set(sale);
        this.dialogRef.disableClose = false;
      },
      // The error interceptor shows the server message; the cart has been reloaded.
      error: () => this.dialogRef.close(),
    });
  }

  /** Closes after a successful sale; the POS page prints the receipt when asked. */
  protected finish(print: boolean): void {
    const sale = this.done();
    this.dialogRef.close(sale ? { sale, print } : undefined);
  }
}
