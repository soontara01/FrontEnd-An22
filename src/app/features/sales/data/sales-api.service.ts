import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
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

  storeInfo(): Observable<StoreInfo> {
    return this.api.get<StoreInfo>('settings/store');
  }

  promotions(): Observable<Promotion[]> {
    return this.api.get<Promotion[]>('promotions');
  }

  paymentMethods(): Observable<PaymentMethod[]> {
    return this.api.get<PaymentMethod[]>('payment-methods');
  }
}

function rangeParams(from: string | null, to: string | null): Record<string, string> {
  const params: Record<string, string> = {};
  if (from) params['from'] = from;
  if (to) params['to'] = to;
  return params;
}
