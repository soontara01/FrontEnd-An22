import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, forkJoin, tap } from 'rxjs';
import {
  Category,
  Product,
  Promotion,
  PromotionPayload,
  PromotionStatus,
  canSell,
  categoryPath,
  discountLabel,
  isDiscontinued,
  promotionStatus,
  todayIso,
} from '@core/models';
import { PromotionsApi } from './promotions-api.service';

export interface PromotionRow {
  promotion: Promotion;
  status: PromotionStatus;
  condition: string;
  reward: string;
}

export interface CategoryOption {
  id: number;
  label: string;
  active: boolean;
}

/** Signals-based state for the promotions feature (provided in promotions.routes.ts). */
@Injectable()
export class PromotionsStore {
  private readonly api = inject(PromotionsApi);

  /** Fixed for the page load so every row agrees on "today". */
  readonly today = todayIso();

  private readonly _promotions = signal<Promotion[]>([]);
  private readonly _products = signal<Product[]>([]);
  private readonly _categories = signal<Category[]>([]);
  private readonly _loading = signal(false);
  private loaded = false;

  readonly promotions = this._promotions.asReadonly();
  readonly products = this._products.asReadonly();
  readonly categories = this._categories.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly rows = computed<PromotionRow[]>(() =>
    this._promotions().map((promotion) => ({
      promotion,
      status: promotionStatus(promotion, this.today),
      condition: this.conditionText(promotion),
      reward: this.rewardText(promotion),
    })),
  );

  readonly countByStatus = computed(() => {
    const counts: Record<PromotionStatus, number> = {
      active: 0,
      scheduled: 0,
      expired: 0,
      disabled: 0,
    };
    for (const row of this.rows()) counts[row.status]++;
    return counts;
  });

  /** SKUs that can be qualifying items (not discontinued), by code. */
  readonly scopeOptions = computed(() =>
    this._products()
      .filter((p) => !isDiscontinued(p))
      .sort((a, b) => a.sku.localeCompare(b.sku)),
  );

  /** SKUs that can be given away (sellable), by code. */
  readonly freeOptions = computed(() => this.scopeOptions().filter((p) => canSell(p)));

  /** Every category (any level) with its full path; a parent covers all SKUs below it. */
  readonly categoryOptions = computed<CategoryOption[]>(() => {
    const all = this._categories();
    return all
      .map((c) => ({ id: c.id, label: categoryPath(all, c.id), active: c.active }))
      .sort((a, b) => a.label.localeCompare(b.label, 'th'));
  });

  /** Loads promotions + SKUs + categories once; pass `force` to refresh. */
  load(force = false): void {
    if (this.loaded && !force) return;
    this._loading.set(true);
    forkJoin({
      promotions: this.api.list(),
      products: this.api.products(),
      categories: this.api.categories(),
    })
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe(({ promotions, products, categories }) => {
        this._promotions.set(promotions);
        this._products.set(products);
        this._categories.set(categories);
        this.loaded = true;
      });
  }

  getById(id: number): Observable<Promotion> {
    return this.api.get(id);
  }

  product(id: number): Product | undefined {
    return this._products().find((p) => p.id === id);
  }

  productLabel(id: number): string {
    const p = this.product(id);
    return p ? `${p.sku} ${p.shortName || p.name}` : `SKU #${id}`;
  }

  categoryLabel(id: number): string {
    return categoryPath(this._categories(), id) || `หมวด #${id}`;
  }

  /** e.g. 'NB-001, หมวด เมาส์และคีย์บอร์ด · ตั้งแต่ 2 ชิ้น' */
  conditionText(p: Promotion): string {
    const money = (n: number) => `฿${n.toLocaleString('en-US')}`;
    if (p.type === 'bill_discount') return `ยอดบิลตั้งแต่ ${money(p.minAmount)}`;
    const scope = p.scope.all
      ? 'สินค้าทุกรายการ'
      : [
          ...p.scope.productIds.map((id) => this.product(id)?.sku ?? `#${id}`),
          ...p.scope.categoryIds.map((id) => `หมวด ${this.categoryName(id)}`),
        ].join(', ');
    if (p.type === 'item_discount') {
      return p.minQty > 1 ? `${scope} · ตั้งแต่ ${p.minQty} ชิ้น` : scope;
    }
    const buy = p.minQty > 0 ? `ซื้อ ${p.minQty} ชิ้น` : `ซื้อครบ ${money(p.minAmount)}`;
    return `${buy} จาก ${scope}`;
  }

  /** e.g. 'ลด 10%' / 'แถม SKU-1 ×1, SV-SETUP ×1 (ทวีคูณ, สูงสุด 5 ชุด)' */
  rewardText(p: Promotion): string {
    if (p.discount) {
      return `${discountLabel(p.discount)}${p.type === 'item_discount' ? ' / ชิ้น' : ''}`;
    }
    if (!p.freeGoods) return '-';
    const items = p.freeGoods.items
      .map((i) => `${this.product(i.productId)?.sku ?? `#${i.productId}`} ×${i.qty}`)
      .join(', ');
    const extra = [
      p.freeGoods.repeat ? 'ทวีคูณ' : '',
      p.freeGoods.maxSets ? `สูงสุด ${p.freeGoods.maxSets} ชุด` : '',
    ].filter(Boolean);
    return `แถม ${items}${extra.length ? ` (${extra.join(', ')})` : ''}`;
  }

  create(payload: PromotionPayload): Observable<Promotion> {
    return this.api
      .create(payload)
      .pipe(tap((p) => this._promotions.update((list) => [...list, p])));
  }

  update(id: number, payload: PromotionPayload): Observable<Promotion> {
    return this.api
      .update(id, payload)
      .pipe(tap((p) => this._promotions.update((list) => list.map((x) => (x.id === id ? p : x)))));
  }

  remove(id: number): Observable<void> {
    return this.api
      .remove(id)
      .pipe(tap(() => this._promotions.update((list) => list.filter((x) => x.id !== id))));
  }

  private categoryName(id: number): string {
    return this._categories().find((c) => c.id === id)?.name ?? `#${id}`;
  }
}
