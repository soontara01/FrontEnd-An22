import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import { Product, SkuPrice, SkuPricePayload } from '@core/models';

/** HTTP calls for the pricing feature (provided in pricing.routes.ts). */
@Injectable()
export class PricingApi {
  private readonly api = inject(ApiService);

  products(): Observable<Product[]> {
    return this.api.get<Product[]>('products');
  }

  prices(productId?: number): Observable<SkuPrice[]> {
    return this.api.get<SkuPrice[]>('prices', productId ? { productId } : undefined);
  }

  create(payload: SkuPricePayload): Observable<SkuPrice> {
    return this.api.post<SkuPrice>('prices', payload);
  }

  update(id: number, payload: SkuPricePayload): Observable<SkuPrice> {
    return this.api.put<SkuPrice>(`prices/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.api.delete(`prices/${id}`);
  }
}
