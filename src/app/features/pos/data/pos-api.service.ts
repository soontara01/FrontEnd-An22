import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import {
  Category,
  PaymentMethod,
  Product,
  Promotion,
  Sale,
  SalePayload,
  SerialNumber,
  StoreInfo,
  TaxInvoice,
  TaxInvoiceBuyer,
} from '@core/models';

/** HTTP calls for the POS feature (provided in pos.routes.ts). */
@Injectable()
export class PosApi {
  private readonly api = inject(ApiService);

  products(): Observable<Product[]> {
    return this.api.get<Product[]>('products');
  }

  promotions(): Observable<Promotion[]> {
    return this.api.get<Promotion[]>('promotions');
  }

  categories(): Observable<Category[]> {
    return this.api.get<Category[]>('categories');
  }

  paymentMethods(): Observable<PaymentMethod[]> {
    return this.api.get<PaymentMethod[]>('payment-methods');
  }

  serials(productId: number): Observable<SerialNumber[]> {
    return this.api.get<SerialNumber[]>(`products/${productId}/serials`);
  }

  storeInfo(): Observable<StoreInfo> {
    return this.api.get<StoreInfo>('settings/store');
  }

  taxInvoiceOf(saleId: number): Observable<TaxInvoice | null> {
    return this.api.get<TaxInvoice | null>(`sales/${saleId}/tax-invoice`);
  }

  /** Buyer details last used with this tax ID (null = never). */
  buyerByTaxId(taxId: string): Observable<TaxInvoiceBuyer | null> {
    return this.api.get<TaxInvoiceBuyer | null>('tax-invoices/buyer', { taxId });
  }

  checkout(payload: SalePayload): Observable<Sale> {
    return this.api.post<Sale>('sales', payload);
  }
}
