import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import { Category, Product, Promotion, PromotionPayload } from '@core/models';

/** HTTP calls for the promotions feature (provided in promotions.routes.ts). */
@Injectable()
export class PromotionsApi {
  private readonly api = inject(ApiService);

  list(): Observable<Promotion[]> {
    return this.api.get<Promotion[]>('promotions');
  }

  get(id: number): Observable<Promotion> {
    return this.api.get<Promotion>(`promotions/${id}`);
  }

  create(payload: PromotionPayload): Observable<Promotion> {
    return this.api.post<Promotion>('promotions', payload);
  }

  update(id: number, payload: PromotionPayload): Observable<Promotion> {
    return this.api.put<Promotion>(`promotions/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.api.delete(`promotions/${id}`);
  }

  products(): Observable<Product[]> {
    return this.api.get<Product[]>('products');
  }

  categories(): Observable<Category[]> {
    return this.api.get<Category[]>('categories');
  }
}
