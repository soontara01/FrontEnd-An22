import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin, map, of } from 'rxjs';
import {
  CreditNote,
  CreditNotePayload,
  Exchange,
  ExchangePayload,
  PaymentMethod,
  PosTerminal,
  Product,
  Promotion,
  Sale,
  SaleStatus,
  VoidPayload,
  Shift,
  ShiftAdjustment,
  ShiftAdjustmentPayload,
  StoreInfo,
  TaxInvoice,
  TaxInvoiceBuyer,
  terminalLabel,
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
  private readonly _terminals = signal<PosTerminal[]>([]);
  private lookupsLoaded = false;

  readonly storeInfo = this._storeInfo.asReadonly();
  /** Every promotion (credit notes re-check free goods against them) */
  readonly promotions = this._promotions.asReadonly();
  readonly methods = this._methods.asReadonly();
  /** POS terminal registry, by number */
  readonly terminals = computed(() => [...this._terminals()].sort((a, b) => a.id - b.id));
  readonly promotionNames = computed<ReadonlyMap<number, string>>(
    () => new Map(this._promotions().map((p) => [p.id, `${p.code} ${p.name}`])),
  );

  list(from: string | null, to: string | null): Observable<Sale[]> {
    return this.api.list(from, to);
  }

  get(id: number): Observable<Sale> {
    return this.api.get(id);
  }

  creditNotesOf(saleId: number): Observable<CreditNote[]> {
    return this.api.creditNotesOf(saleId);
  }

  creditNotes(from: string | null, to: string | null): Observable<CreditNote[]> {
    return this.api.creditNotes(from, to);
  }

  /** Bills sold or voided in a shift, newest first (bill list `?shift=`). */
  salesOfShift(shiftId: number): Observable<Sale[]> {
    return this.api.salesOfShift(shiftId);
  }

  creditNotesOfShift(shiftId: number): Observable<CreditNote[]> {
    return this.api.creditNotesOfShift(shiftId);
  }

  shift(id: number): Observable<Shift> {
    return this.api.shift(id);
  }

  /** A bill with its credit notes and exchanges (credit-note and exchange forms). */
  withReturnsAndExchanges(
    id: number,
  ): Observable<{ sale: Sale; notes: CreditNote[]; exchanges: Exchange[] }> {
    return forkJoin({
      sale: this.api.get(id),
      notes: this.api.creditNotesOf(id),
      exchanges: this.api.exchangesOf(id),
    });
  }

  exchangesOf(saleId: number): Observable<Exchange[]> {
    return this.api.exchangesOf(saleId);
  }

  createExchange(saleId: number, payload: ExchangePayload): Observable<Exchange> {
    return this.api.createExchange(saleId, payload);
  }

  /** In-stock serials of a SKU, for picking the replacement unit. */
  inStockSerials(productId: number): Observable<string[]> {
    return this.api
      .serialsOf(productId)
      .pipe(map((list) => list.filter((s) => s.status === 'in_stock').map((s) => s.serial)));
  }

  /** Current stock of some SKUs (the exchange form checks replacements are in stock). */
  productsOf(ids: readonly number[]): Observable<Product[]> {
    return ids.length ? forkJoin(ids.map((id) => this.api.product(id))) : of([]);
  }

  /** Receipt header, promotions and payment methods, loaded once per page load. */
  loadLookups(): void {
    if (this.lookupsLoaded) return;
    this.lookupsLoaded = true;
    // A failed lookup is tried again on the next call (the snackbar is already shown).
    const retry = () => (this.lookupsLoaded = false);
    this.api.storeInfo().subscribe({ next: (info) => this._storeInfo.set(info), error: retry });
    this.api.promotions().subscribe({ next: (list) => this._promotions.set(list), error: retry });
    this.api.paymentMethods().subscribe({ next: (list) => this._methods.set(list), error: retry });
    this.api.posTerminals().subscribe({ next: (list) => this._terminals.set(list), error: retry });
  }

  /** 'เครื่อง 2 · แคชเชียร์หน้าร้าน'; '-' when unknown (bills from before the registry). */
  terminalLabel(id: number | null | undefined): string {
    return id ? terminalLabel(id, this._terminals()) : '-';
  }

  void(id: number, payload: VoidPayload): Observable<Sale> {
    return this.api.void(id, payload);
  }

  /** Shifts opened within the range + the variance per cashier over them. */
  shiftList(from: string | null, to: string | null) {
    return forkJoin({
      shifts: this.api.shifts(from, to),
      report: this.api.varianceReport(from, to),
    });
  }

  /**
   * One shift with its X / Z summary, cash movements, no-sale drawer openings (S7), adjustments
   * after closing (S8) and bills.
   */
  shiftDetail(id: number) {
    return forkJoin({
      shift: this.api.shift(id),
      summary: this.api.shiftSummary(id),
      movements: this.api.cashMovements(id),
      drawerOpens: this.api.drawerOpens(id),
      adjustments: this.api.adjustments(id),
      sales: this.api.salesOfShift(id),
    });
  }

  /** Admin correction of a closed shift's count (S8); the counts themselves never change. */
  addAdjustment(shiftId: number, payload: ShiftAdjustmentPayload): Observable<ShiftAdjustment> {
    return this.api.addAdjustment(shiftId, payload);
  }

  approveShift(id: number): Observable<Shift> {
    return this.api.approveShift(id);
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

  taxInvoicesOf(saleId: number): Observable<TaxInvoice[]> {
    return this.api.taxInvoicesOf(saleId);
  }

  reissueTaxInvoice(
    saleId: number,
    buyer: TaxInvoiceBuyer,
    reason: string,
  ): Observable<TaxInvoice> {
    return this.api.reissueTaxInvoice(saleId, buyer, reason);
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
