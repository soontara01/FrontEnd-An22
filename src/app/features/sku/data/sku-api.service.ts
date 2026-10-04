import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import { Category, Product, ProductPayload, Supplier } from '@core/models';

/** HTTP calls for the SKU master (provided in sku.routes.ts). Same `products` resource as Inventory. */
@Injectable()
export class SkuApi {
  private readonly api = inject(ApiService);

  list(): Observable<Product[]> {
    return this.api.get<Product[]>('products');
  }

  /** Category master (leaf categories are selectable for a SKU). */
  categories(): Observable<Category[]> {
    return this.api.get<Category[]>('categories');
  }

  /** Supplier master (for SKU ↔ supplier links). */
  suppliers(): Observable<Supplier[]> {
    return this.api.get<Supplier[]>('suppliers');
  }

  get(id: number): Observable<Product> {
    return this.api.get<Product>(`products/${id}`);
  }

  create(payload: ProductPayload): Observable<Product> {
    return this.api.post<Product>('products', payload);
  }

  update(id: number, payload: ProductPayload): Observable<Product> {
    return this.api.put<Product>(`products/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.api.delete(`products/${id}`);
  }
}
