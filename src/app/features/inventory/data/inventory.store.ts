import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, forkJoin, map, tap } from 'rxjs';
import {
  Product,
  SerialNumber,
  SerialRemoveStatus,
  SkuSupplier,
  StockCardResult,
  Supplier,
  isDiscontinued,
  mainSupplier,
  orderMultiple,
  costValue,
  stockLevel,
  suggestReorderQty,
} from '@core/models';
import { InventoryApi } from './inventory-api.service';

/** One SKU that should be reordered now. */
export interface ReorderLine {
  product: Product;
  /** Main supplier link (undefined = no supplier linked) */
  link?: SkuSupplier;
  /** Suggested quantity in base units */
  qty: number;
  /** e.g. '2 กล่อง' when the SKU has packs */
  packHint: string;
  /** Purchase cost per base unit (supplier cost, else SKU cost), excl. VAT */
  unitCost: number;
  amount: number;
}

/** Reorder lines of one main supplier (supplier undefined = not linked). */
export interface ReorderGroup {
  supplier?: Supplier;
  lines: ReorderLine[];
  total: number;
  maxLeadTime: number;
}

/**
 * Signals-based state for the inventory feature (provided in inventory.routes.ts).
 * Data comes from the SKU master (`products`); only active SKUs are shown here.
 */
@Injectable()
export class InventoryStore {
  private readonly api = inject(InventoryApi);

  private readonly _products = signal<Product[]>([]);
  private readonly _suppliers = signal<Supplier[]>([]);
  private readonly _loading = signal(false);
  private loaded = false;

  /** Everything except discontinued SKUs (those are hidden from stock management). */
  readonly products = computed(() => this._products().filter((p) => !isDiscontinued(p)));
  /** Every SKU incl. discontinued (for import validation messages). */
  readonly allProducts = this._products.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly totalItems = computed(() => this.products().length);
  readonly lowStockCount = computed(
    () => this.products().filter((p) => stockLevel(p) === 'low').length,
  );
  readonly outOfStockCount = computed(
    () => this.products().filter((p) => stockLevel(p) === 'out').length,
  );
  /** Inventory value at actual cost (moving average / serial costs). */
  readonly costValue = computed(() => this.products().reduce((sum, p) => sum + costValue(p), 0));
  /** Inventory value at today's sale price; SKUs without a price count as 0. */
  readonly saleValue = computed(() =>
    this.products().reduce((sum, p) => sum + (p.currentPrice ?? 0) * p.stock, 0),
  );

  /** SKUs at/below their reorder point with a suggested quantity (purchasable only). */
  readonly reorderLines = computed<ReorderLine[]>(() =>
    this.products()
      .map((product) => {
        const qty = suggestReorderQty(product);
        const link = mainSupplier(product);
        const unitCost = link?.cost ?? product.cost;
        const multiple = orderMultiple(product);
        const pack = product.packUnits.find((u) => u.factor === multiple);
        return {
          product,
          link,
          qty,
          packHint: pack ? `${qty / multiple} ${pack.unit}` : '',
          unitCost,
          amount: qty * unitCost,
        };
      })
      .filter((line) => line.qty > 0),
  );

  readonly reorderCount = computed(() => this.reorderLines().length);

  /** Reorder lines grouped by main supplier; unlinked SKUs last. */
  readonly reorderGroups = computed<ReorderGroup[]>(() => {
    const groups = new Map<number | null, ReorderLine[]>();
    for (const line of this.reorderLines()) {
      const key = line.link?.supplierId ?? null;
      groups.set(key, [...(groups.get(key) ?? []), line]);
    }
    return [...groups.entries()]
      .map(([id, lines]) => ({
        supplier: this._suppliers().find((s) => s.id === id),
        lines,
        total: lines.reduce((sum, l) => sum + l.amount, 0),
        maxLeadTime: Math.max(0, ...lines.map((l) => l.link?.leadTimeDays ?? 0)),
      }))
      .sort((a, b) => (a.supplier ? 0 : 1) - (b.supplier ? 0 : 1) || b.total - a.total);
  });

  /** Loads SKUs + suppliers once; pass `force` to refresh from the server. */
  load(force = false): void {
    if (this.loaded && !force) return;
    this._loading.set(true);
    forkJoin({ products: this.api.list(), suppliers: this.api.suppliers() })
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe(({ products, suppliers }) => {
        this._products.set(products);
        this._suppliers.set(suppliers);
        this.loaded = true;
      });
  }

  /** Non-serial SKUs only; serial SKUs must use receiveSerials / removeSerials. */
  adjustStock(id: number, delta: number, unitCost?: number, note = ''): Observable<Product> {
    return this.api
      .adjustStock(id, delta, unitCost, note)
      .pipe(tap((product) => this.replace(product)));
  }

  movements(productId: number, from?: string, to?: string): Observable<StockCardResult> {
    return this.api.movements(productId, from, to);
  }

  serials(productId: number): Observable<SerialNumber[]> {
    return this.api.serials(productId);
  }

  receiveSerials(
    productId: number,
    serials: string[],
    unitCost: number,
    note = '',
  ): Observable<Product> {
    return this.api.receiveSerials(productId, serials, unitCost, note).pipe(
      map((result) => result.product),
      tap((product) => this.replace(product)),
    );
  }

  removeSerials(
    productId: number,
    ids: number[],
    status: SerialRemoveStatus,
    note: string,
  ): Observable<Product> {
    return this.api
      .removeSerials(productId, ids, status, note)
      .pipe(tap((product) => this.replace(product)));
  }

  private replace(product: Product): void {
    this._products.update((list) => list.map((p) => (p.id === product.id ? product : p)));
  }
}
