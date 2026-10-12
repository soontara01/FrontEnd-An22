import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import {
  CashMovement,
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
  SerialNumber,
  Shift,
  ShiftSummary,
  StoreInfo,
  VarianceReportRow,
  TaxInvoice,
  TaxInvoiceBuyer,
} from '@core/models';

/** HTTP calls for the sales feature (provided in sales.routes.ts). */
@Injectable()
export class SalesApi {
  private readonly api = inject(ApiService);

  /** Bills sold within a local-date range (null = open end), newest first. */
  list(from: string | null, to: string | null): Observable<Sale[]> {
    return this.api.get<Sale[]>('sales', rangeParams(from, to));
  }

  get(id: number): Observable<Sale> {
    return this.api.get<Sale>(`sales/${id}`);
  }

  void(id: number, reason: string): Observable<Sale> {
    return this.api.post<Sale>(`sales/${id}/void`, { reason });
  }

  setStatus(id: number, status: SaleStatus): Observable<Sale> {
    return this.api.put<Sale>(`sales/${id}/status`, { status });
  }

  creditNotesOf(saleId: number): Observable<CreditNote[]> {
    return this.api.get<CreditNote[]>(`sales/${saleId}/credit-notes`);
  }

  createCreditNote(saleId: number, payload: CreditNotePayload): Observable<CreditNote> {
    return this.api.post<CreditNote>(`sales/${saleId}/credit-notes`, payload);
  }

  /** Credit notes issued within a local-date range, newest first. */
  creditNotes(from: string | null, to: string | null): Observable<CreditNote[]> {
    return this.api.get<CreditNote[]>('credit-notes', rangeParams(from, to));
  }

  /** Full tax invoices issued within a local-date range, oldest first. */
  taxInvoices(from: string | null, to: string | null): Observable<TaxInvoice[]> {
    return this.api.get<TaxInvoice[]>('tax-invoices', rangeParams(from, to));
  }

  /** The bill's full tax invoice, or null when none was issued. */
  taxInvoiceOf(saleId: number): Observable<TaxInvoice | null> {
    return this.api.get<TaxInvoice | null>(`sales/${saleId}/tax-invoice`);
  }

  /** Every full tax invoice of the bill, oldest first (cancelled ones, then the valid one). */
  taxInvoicesOf(saleId: number): Observable<TaxInvoice[]> {
    return this.api.get<TaxInvoice[]>(`sales/${saleId}/tax-invoices`);
  }

  /** Cancels the valid invoice and issues a new one with corrected buyer details. */
  reissueTaxInvoice(
    saleId: number,
    buyer: TaxInvoiceBuyer,
    reason: string,
  ): Observable<TaxInvoice> {
    return this.api.post<TaxInvoice>(`sales/${saleId}/tax-invoice/reissue`, { buyer, reason });
  }

  issueTaxInvoice(saleId: number, buyer: TaxInvoiceBuyer): Observable<TaxInvoice> {
    return this.api.post<TaxInvoice>(`sales/${saleId}/tax-invoice`, { buyer });
  }

  /** Buyer details last used with this tax ID (null = never). */
  buyerByTaxId(taxId: string): Observable<TaxInvoiceBuyer | null> {
    return this.api.get<TaxInvoiceBuyer | null>('tax-invoices/buyer', { taxId });
  }

  exchangesOf(saleId: number): Observable<Exchange[]> {
    return this.api.get<Exchange[]>(`sales/${saleId}/exchanges`);
  }

  createExchange(saleId: number, payload: ExchangePayload): Observable<Exchange> {
    return this.api.post<Exchange>(`sales/${saleId}/exchanges`, payload);
  }

  product(id: number): Observable<Product> {
    return this.api.get<Product>(`products/${id}`);
  }

  /** Serials of a SKU (the exchange form offers the in-stock ones). */
  serialsOf(productId: number): Observable<SerialNumber[]> {
    return this.api.get<SerialNumber[]>(`products/${productId}/serials`);
  }

  storeInfo(): Observable<StoreInfo> {
    return this.api.get<StoreInfo>('settings/store');
  }

  posTerminals(): Observable<PosTerminal[]> {
    return this.api.get<PosTerminal[]>('pos-terminals');
  }

  promotions(): Observable<Promotion[]> {
    return this.api.get<Promotion[]>('promotions');
  }

  paymentMethods(): Observable<PaymentMethod[]> {
    return this.api.get<PaymentMethod[]>('payment-methods');
  }

  /** POS shifts opened within a local-date range (null = open end), newest first. */
  shifts(from: string | null, to: string | null): Observable<Shift[]> {
    return this.api.get<Shift[]>('shifts', rangeParams(from, to));
  }

  shift(id: number): Observable<Shift> {
    return this.api.get<Shift>(`shifts/${id}`);
  }

  /** X / Z report; per-method lines only for admins while the shift is open. */
  shiftSummary(id: number): Observable<ShiftSummary> {
    return this.api.get<ShiftSummary>(`shifts/${id}/summary`);
  }

  cashMovements(shiftId: number): Observable<CashMovement[]> {
    return this.api.get<CashMovement[]>(`shifts/${shiftId}/movements`);
  }

  approveShift(id: number): Observable<Shift> {
    return this.api.post<Shift>(`shifts/${id}/approve`, {});
  }

  /** Variance per cashier over shifts opened within the range. */
  varianceReport(from: string | null, to: string | null): Observable<VarianceReportRow[]> {
    return this.api.get<VarianceReportRow[]>('shifts/variance-report', rangeParams(from, to));
  }

  /** Bills sold or voided in a shift, newest first. */
  salesOfShift(shiftId: number): Observable<Sale[]> {
    return this.api.get<Sale[]>('sales', { shiftId: String(shiftId) });
  }
}

function rangeParams(from: string | null, to: string | null): Record<string, string> {
  const params: Record<string, string> = {};
  if (from) params['from'] = from;
  if (to) params['to'] = to;
  return params;
}
