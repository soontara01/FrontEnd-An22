import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, forkJoin, tap } from 'rxjs';
import {
  CartItem,
  Category,
  FreeSerial,
  PaymentInput,
  PaymentMethod,
  PricedCart,
  Product,
  Promotion,
  Sale,
  SerialNumber,
  cartError,
  priceCart,
  todayIso,
} from '@core/models';
import { StorageService } from '@core/services/storage.service';
import { PosApi } from './pos-api.service';

/** A parked bill, kept in localStorage so it survives reloads and menu switches. */
export interface HeldBill {
  id: string;
  /** ISO timestamp */
  heldAt: string;
  customer: string;
  items: CartItem[];
  freeSerials: FreeSerial[];
  /** Total when parked (display only; re-priced on resume) */
  total: number;
}

const HOLDS_KEY = 'pos.holds';

/**
 * State of the POS screen (provided in pos.routes.ts): master data loaded once per page load,
 * the cart (re-priced by `priceCart()` on every change) and parked bills.
 */
@Injectable()
export class PosStore {
  private readonly api = inject(PosApi);
  private readonly storage = inject(StorageService);

  private readonly _products = signal<Product[]>([]);
  private readonly _promotions = signal<Promotion[]>([]);
  private readonly _categories = signal<Category[]>([]);
  private readonly _methods = signal<PaymentMethod[]>([]);
  private readonly _loading = signal(false);
  private readonly _items = signal<CartItem[]>([]);
  private readonly _freeSerials = signal<FreeSerial[]>([]);
  private readonly _customer = signal('');
  private readonly _holds = signal<HeldBill[]>(this.storage.get<HeldBill[]>(HOLDS_KEY) ?? []);
  private readonly _lastSale = signal<Sale | null>(null);

  readonly products = this._products.asReadonly();
  readonly promotions = this._promotions.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly items = this._items.asReadonly();
  readonly freeSerials = this._freeSerials.asReadonly();
  readonly customer = this._customer.asReadonly();
  readonly holds = this._holds.asReadonly();
  readonly lastSale = this._lastSale.asReadonly();

  /** Tender buttons: active methods in button order. */
  readonly methods = computed(() =>
    this._methods()
      .filter((m) => m.active)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  );

  readonly cart = computed<PricedCart>(() =>
    priceCart(
      this._items(),
      {
        products: this._products(),
        promotions: this._promotions(),
        categories: this._categories(),
        date: todayIso(),
      },
      this._freeSerials(),
    ),
  );

  /** First reason the bill cannot be paid yet (null = ready). */
  readonly blocker = computed(() => cartError(this.cart()));

  readonly promotionName = computed(
    () => new Map(this._promotions().map((p) => [p.id, `${p.code} ${p.name}`])),
  );

  /** Serials already in the cart (paid and free lines). */
  readonly serialsInCart = computed(
    () => new Set(this.cart().lines.flatMap((l) => (l.serial ? [l.serial] : []))),
  );

  load(): void {
    this._loading.set(true);
    forkJoin({
      products: this.api.products(),
      promotions: this.api.promotions(),
      categories: this.api.categories(),
      methods: this.api.paymentMethods(),
    })
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe(({ products, promotions, categories, methods }) => {
        this._products.set(products);
        this._promotions.set(promotions);
        this._categories.set(categories);
        this._methods.set(methods);
      });
  }

  product(id: number): Product | undefined {
    return this._products().find((p) => p.id === id);
  }

  serials(productId: number): Observable<SerialNumber[]> {
    return this.api.serials(productId);
  }

  /** Adds `qty` units; a non-serial SKU in the same unit adds to its existing line. */
  add(productId: number, factor = 1, qty = 1): void {
    this._items.update((items) => {
      const index = items.findIndex(
        (i) => i.productId === productId && i.factor === factor && !i.serial,
      );
      if (index < 0) return [...items, { productId, factor, qty, serial: null }];
      return items.map((i, n) => (n === index ? { ...i, qty: i.qty + qty } : i));
    });
  }

  /** One line per serial; serials already in the cart are ignored. */
  addSerials(productId: number, serials: readonly string[]): void {
    const taken = this.serialsInCart();
    const fresh = serials.filter((s) => !taken.has(s));
    this._items.update((items) => [
      ...items,
      ...fresh.map((serial) => ({ productId, factor: 1, qty: 1, serial })),
    ]);
  }

  setQty(index: number, qty: number): void {
    if (!Number.isInteger(qty) || qty < 1) return;
    this._items.update((items) => items.map((i, n) => (n === index ? { ...i, qty } : i)));
  }

  remove(index: number): void {
    this._items.update((items) => items.filter((_, n) => n !== index));
  }

  /** Serials for the free units of a serial SKU given by a promotion (replaces earlier ones). */
  setFreeSerials(promotionId: number, productId: number, serials: readonly string[]): void {
    this._freeSerials.update((list) => [
      ...list.filter((s) => s.promotionId !== promotionId || s.productId !== productId),
      ...serials.map((serial) => ({ promotionId, productId, serial })),
    ]);
  }

  setCustomer(name: string): void {
    this._customer.set(name);
  }

  clear(): void {
    this._items.set([]);
    this._freeSerials.set([]);
    this._customer.set('');
  }

  /** Parks the current bill and starts an empty one. */
  hold(): void {
    if (!this._items().length) return;
    const bill: HeldBill = {
      id: `H${Date.now()}`,
      heldAt: new Date().toISOString(),
      customer: this._customer(),
      items: this._items(),
      freeSerials: this._freeSerials(),
      total: this.cart().total,
    };
    this.saveHolds([...this._holds(), bill]);
    this.clear();
  }

  /** Brings a parked bill back; the current bill (if any) is parked in its place. */
  resume(id: string): void {
    const bill = this._holds().find((b) => b.id === id);
    if (!bill) return;
    this.hold();
    this.saveHolds(this._holds().filter((b) => b.id !== id));
    this._items.set(bill.items);
    this._freeSerials.set(bill.freeSerials);
    this._customer.set(bill.customer);
  }

  discardHold(id: string): void {
    this.saveHolds(this._holds().filter((b) => b.id !== id));
  }

  /** Submits the bill; on success the cart is cleared and stock is reloaded. */
  checkout(payments: PaymentInput[]): Observable<Sale> {
    return this.api
      .checkout({
        items: this._items(),
        freeSerials: this._freeSerials(),
        payments,
        customer: this._customer().trim(),
        expectedTotal: this.cart().total,
      })
      .pipe(
        tap({
          next: (sale) => {
            this._lastSale.set(sale);
            this.clear();
            this.api.products().subscribe((products) => this._products.set(products));
          },
          // Prices, promotions or stock changed on the server: show the current state.
          error: () => this.load(),
        }),
      );
  }

  private saveHolds(holds: HeldBill[]): void {
    this._holds.set(holds);
    this.storage.set(HOLDS_KEY, holds);
  }
}
