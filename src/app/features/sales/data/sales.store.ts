import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import {
  CreditNote,
  CreditNotePayload,
  PaymentMethod,
  Promotion,
  Sale,
  SaleStatus,
  StoreInfo,
  TaxInvoice,
  TaxInvoiceBuyer,
  toIsoDate,
} from '@core/models';
import { SalesApi } from './sales-api.service';

/**
 * Sales feature state (provided in sales.routes.ts). Bill lists are date-range queries owned by
 * the pages (rxResource); the store caches the lookups shared by the pages (receipt header,
 * promotions, payment methods) and wraps the write calls.
 */
@Injectable()
export class SalesStore {
  private readonly api = inject(SalesApi);

  private readonly _storeInfo = signal<StoreInfo | null>(null);
  private readonly _promotions = signal<Promotion[]>([]);
  private readonly _methods = signal<PaymentMethod[]>([]);
  private lookupsLoaded = false;

  readonly storeInfo = this._storeInfo.asReadonly();
  /** Every promotion (credit notes re-check free goods against them) */
  readonly promotions = this._promotions.asReadonly();
  readonly methods = this._methods.asReadonly();
  readonly promotionNames = computed<ReadonlyMap<number, string>>(
    () => new Map(this._promotions().map((p) => [p.id, `${p.code} ${p.name}`])),
  );

  list(from: string | null, to: string | null): Observable<Sale[]> {
    return this.api.list(from, to);
  }

  get(id: number): Observable<Sale> {
    return this.api.get(id);
  }

  /** A bill with its credit notes. */
  withCreditNotes(id: number): Observable<{ sale: Sale; notes: CreditNote[] }> {
    return forkJoin({ sale: this.api.get(id), notes: this.api.creditNotesOf(id) });
  }

  creditNotesOf(saleId: number): Observable<CreditNote[]> {
    return this.api.creditNotesOf(saleId);
  }

  creditNotes(from: string | null, to: string | null): Observable<CreditNote[]> {
    return this.api.creditNotes(from, to);
  }

  /** Receipt header, promotions and payment methods, loaded once per page load. */
  loadLookups(): void {
    if (this.lookupsLoaded) return;
    this.lookupsLoaded = true;
    this.api.storeInfo().subscribe((info) => this._storeInfo.set(info));
    this.api.promotions().subscribe((list) => this._promotions.set(list));
    this.api.paymentMethods().subscribe((list) => this._methods.set(list));
  }

  void(id: number, reason: string): Observable<Sale> {
    return this.api.void(id, reason);
  }

  createCreditNote(saleId: number, payload: CreditNotePayload): Observable<CreditNote> {
    return this.api.createCreditNote(saleId, payload);
  }

  /** Everything the monthly sales tax report needs ('YYYY-MM'). */
  taxReportData(month: string) {
    const from = `${month}-01`;
    // Last day of the month (a real server would reject 2026-02-31).
    const [y, m] = month.split('-').map(Number);
    const to = toIsoDate(new Date(y, m, 0));
    return forkJoin({
      sales: this.api.list(from, to),
      invoices: this.api.taxInvoices(from, to),
      notes: this.api.creditNotes(from, to),
    });
  }

  taxInvoiceOf(saleId: number): Observable<TaxInvoice | null> {
    return this.api.taxInvoiceOf(saleId);
  }

  issueTaxInvoice(saleId: number, buyer: TaxInvoiceBuyer): Observable<TaxInvoice> {
    return this.api.issueTaxInvoice(saleId, buyer);
  }

  buyerByTaxId(taxId: string): Observable<TaxInvoiceBuyer | null> {
    return this.api.buyerByTaxId(taxId);
  }

  /** Orders from before the POS only (pending → paid / cancelled). */
  setStatus(id: number, status: SaleStatus): Observable<Sale> {
    return this.api.setStatus(id, status);
  }
}
