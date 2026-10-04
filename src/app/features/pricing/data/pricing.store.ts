import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, forkJoin, tap } from 'rxjs';
import {
  Product,
  SkuPrice,
  SkuPricePayload,
  addDaysIso,
  effectivePrice,
  isDiscontinued,
  effectiveCost,
  marginPercent,
  priceStatus,
  todayIso,
} from '@core/models';
import { PricingApi } from './pricing-api.service';

/** A current price ending within this many days counts as "expiring soon". */
export const EXPIRING_DAYS = 30;

/** One SKU's pricing summary as of today. */
export interface PriceRow {
  product: Product;
  /** Period in effect today (undefined = "ยังไม่กำหนดราคา") */
  current?: SkuPrice;
  /** Earliest period that starts after today */
  next?: SkuPrice;
  periodCount: number;
  /** Gross margin % of the current price (net of VAT) against cost */
  margin: number | null;
  expiringSoon: boolean;
}

/** Signals-based state for the pricing feature (provided in pricing.routes.ts). */
@Injectable()
export class PricingStore {
  private readonly api = inject(PricingApi);

  /** Fixed for the page load so all rows agree on "today". */
  readonly today = todayIso();

  private readonly _products = signal<Product[]>([]);
  private readonly _prices = signal<SkuPrice[]>([]);
  private readonly _loading = signal(false);
  private loaded = false;

  readonly products = this._products.asReadonly();
  readonly prices = this._prices.asReadonly();
  readonly loading = this._loading.asReadonly();

  /** Active SKUs with their price summary (derived locally from `prices`). */
  readonly rows = computed<PriceRow[]>(() => {
    const byProduct = new Map<number, SkuPrice[]>();
    for (const price of this._prices()) {
      byProduct.set(price.productId, [...(byProduct.get(price.productId) ?? []), price]);
    }
    const expiryLimit = addDaysIso(this.today, EXPIRING_DAYS);
    return this._products()
      .filter((p) => !isDiscontinued(p))
      .map((product) => {
        const own = byProduct.get(product.id) ?? [];
        const current = effectivePrice(own, this.today);
        const next = own
          .filter((p) => priceStatus(p, this.today) === 'scheduled')
          .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
        return {
          product,
          current,
          next,
          periodCount: own.length,
          margin: marginPercent(current?.price, effectiveCost(product), product.vatType),
          expiringSoon: !!current?.endDate && current.endDate <= expiryLimit,
        };
      });
  });

  readonly withPriceCount = computed(() => this.rows().filter((r) => r.current).length);
  readonly noPriceCount = computed(() => this.rows().filter((r) => !r.current).length);
  readonly scheduledCount = computed(() => this.rows().filter((r) => r.next).length);
  readonly expiringCount = computed(() => this.rows().filter((r) => r.expiringSoon).length);

  /** Loads SKUs + all price periods once; pass `force` to refresh. */
  load(force = false): void {
    if (this.loaded && !force) return;
    this._loading.set(true);
    forkJoin({ products: this.api.products(), prices: this.api.prices() })
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe(({ products, prices }) => {
        this._products.set(products);
        this._prices.set(prices);
        this.loaded = true;
      });
  }

  /** Periods of one SKU, newest start date first. */
  pricesFor(productId: number): SkuPrice[] {
    return this._prices()
      .filter((p) => p.productId === productId)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  create(payload: SkuPricePayload): Observable<SkuPrice> {
    return this.api
      .create(payload)
      .pipe(tap((price) => this._prices.update((list) => [...list, price])));
  }

  update(id: number, payload: SkuPricePayload): Observable<SkuPrice> {
    return this.api
      .update(id, payload)
      .pipe(
        tap((price) => this._prices.update((list) => list.map((p) => (p.id === id ? price : p)))),
      );
  }

  remove(id: number): Observable<void> {
    return this.api
      .remove(id)
      .pipe(tap(() => this._prices.update((list) => list.filter((p) => p.id !== id))));
  }
}
