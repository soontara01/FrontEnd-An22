import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import {
  Category,
  CategoryPayload,
  PaymentMethod,
  PaymentMethodPayload,
  Supplier,
  SupplierPayload,
} from '@core/models';

/** HTTP calls for master data (provided in master-data.routes.ts). */
@Injectable()
export class MasterDataApi {
  private readonly api = inject(ApiService);

  categories(): Observable<Category[]> {
    return this.api.get<Category[]>('categories');
  }

  createCategory(payload: CategoryPayload): Observable<Category> {
    return this.api.post<Category>('categories', payload);
  }

  updateCategory(id: number, payload: CategoryPayload): Observable<Category> {
    return this.api.put<Category>(`categories/${id}`, payload);
  }

  removeCategory(id: number): Observable<void> {
    return this.api.delete(`categories/${id}`);
  }

  suppliers(): Observable<Supplier[]> {
    return this.api.get<Supplier[]>('suppliers');
  }

  supplier(id: number): Observable<Supplier> {
    return this.api.get<Supplier>(`suppliers/${id}`);
  }

  createSupplier(payload: SupplierPayload): Observable<Supplier> {
    return this.api.post<Supplier>('suppliers', payload);
  }

  updateSupplier(id: number, payload: SupplierPayload): Observable<Supplier> {
    return this.api.put<Supplier>(`suppliers/${id}`, payload);
  }

  removeSupplier(id: number): Observable<void> {
    return this.api.delete(`suppliers/${id}`);
  }

  paymentMethods(): Observable<PaymentMethod[]> {
    return this.api.get<PaymentMethod[]>('payment-methods');
  }

  createPaymentMethod(payload: PaymentMethodPayload): Observable<PaymentMethod> {
    return this.api.post<PaymentMethod>('payment-methods', payload);
  }

  updatePaymentMethod(id: number, payload: PaymentMethodPayload): Observable<PaymentMethod> {
    return this.api.put<PaymentMethod>(`payment-methods/${id}`, payload);
  }

  /** Saves the POS button order; returns every method sorted. */
  reorderPaymentMethods(ids: number[]): Observable<PaymentMethod[]> {
    return this.api.put<PaymentMethod[]>('payment-methods/order', { ids });
  }

  removePaymentMethod(id: number): Observable<void> {
    return this.api.delete(`payment-methods/${id}`);
  }
}
