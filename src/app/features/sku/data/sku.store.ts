import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, forkJoin, tap } from 'rxjs';
import {
  Category,
  Product,
  ProductPayload,
  Supplier,
  allBarcodes,
  categoryPath,
  isLeaf,
  isService,
} from '@core/models';
import { SkuApi } from './sku-api.service';

const uniqueSorted = (values: string[]): string[] =>
  [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'th'),
  );

/** Leaf categories grouped under their parent path, for `mat-optgroup`. */
export interface CategoryGroup {
  label: string;
  options: Category[];
}

/** Signals-based state for the SKU master (provided in sku.routes.ts). */
@Injectable()
export class SkuStore {
  private readonly api = inject(SkuApi);

  private readonly _skus = signal<Product[]>([]);
  private readonly _categories = signal<Category[]>([]);
  private readonly _suppliers = signal<Supplier[]>([]);
  private readonly _loading = signal(false);
  private loaded = false;

  readonly skus = this._skus.asReadonly();
  readonly categories = this._categories.asReadonly();
  readonly suppliers = this._suppliers.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly count = computed(() => this._skus().length);
  readonly serialCount = computed(() => this._skus().filter((s) => s.serialControl).length);
  readonly serviceCount = computed(() => this._skus().filter((s) => isService(s)).length);
  /** SKUs that cannot be sold right now (ห้ามขาย / เลิกจำหน่าย). */
  readonly notSellableCount = computed(
    () =>
      this._skus().filter((s) => s.saleStatus === 'no_sale' || s.saleStatus === 'discontinued')
        .length,
  );

  /** Leaf categories (SKUs may only use these), grouped by parent path. */
  readonly leafGroups = computed<CategoryGroup[]>(() => {
    const all = this._categories();
    const groups = new Map<string, Category[]>();
    for (const c of all.filter((x) => isLeaf(all, x.id))) {
      const label = categoryPath(all, c.parentId) || 'ไม่มีหมวดแม่';
      groups.set(label, [...(groups.get(label) ?? []), c]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'th'))
      .map(([label, options]) => ({
        label,
        options: options.sort((a, b) => a.code.localeCompare(b.code)),
      }));
  });

  readonly units = computed(() =>
    uniqueSorted([
      'ชิ้น',
      'เครื่อง',
      'อัน',
      'เส้น',
      'กล่อง',
      'แพ็ค',
      'ลัง',
      'ครั้ง',
      ...this._skus().flatMap((s) => [s.unit, ...s.packUnits.map((u) => u.unit)]),
    ]),
  );

  /** Loads SKUs + categories + suppliers once; pass `force` to refresh from the server. */
  load(force = false): void {
    if (this.loaded && !force) return;
    this._loading.set(true);
    forkJoin({
      skus: this.api.list(),
      categories: this.api.categories(),
      suppliers: this.api.suppliers(),
    })
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe(({ skus, categories, suppliers }) => {
        this._skus.set(skus);
        this._categories.set(categories);
        this._suppliers.set(suppliers);
        this.loaded = true;
      });
  }

  getById(id: number): Observable<Product> {
    return this.api.get(id);
  }

  /** True when another SKU already uses this code (case-insensitive). */
  isDuplicateCode(code: string, exceptId?: number): boolean {
    const upper = code.trim().toUpperCase();
    return this._skus().some((s) => s.id !== exceptId && s.sku.toUpperCase() === upper);
  }

  /** SKU code that already uses this barcode (base or pack), or undefined. */
  barcodeOwner(barcode: string, exceptId?: number): string | undefined {
    if (!barcode) return undefined;
    return this._skus().find((s) => s.id !== exceptId && allBarcodes(s).includes(barcode))?.sku;
  }

  supplierName(id: number): string {
    return this._suppliers().find((s) => s.id === id)?.name ?? `#${id}`;
  }

  /** Active leaf category usable for a SKU. */
  isSelectableCategory(id: number | null): boolean {
    const c = this._categories().find((x) => x.id === id);
    return !!c && c.active && isLeaf(this._categories(), c.id);
  }

  create(payload: ProductPayload): Observable<Product> {
    return this.api.create(payload).pipe(tap((sku) => this._skus.update((list) => [...list, sku])));
  }

  update(id: number, payload: ProductPayload): Observable<Product> {
    return this.api
      .update(id, payload)
      .pipe(tap((sku) => this._skus.update((list) => list.map((s) => (s.id === id ? sku : s)))));
  }

  remove(id: number): Observable<void> {
    return this.api
      .remove(id)
      .pipe(tap(() => this._skus.update((list) => list.filter((s) => s.id !== id))));
  }
}
