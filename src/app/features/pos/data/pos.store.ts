import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, forkJoin, tap } from 'rxjs';
import {
  CartItem,
  Category,
  FreeSerial,
  ManualDiscount,
  PaymentInput,
  PaymentMethod,
  PricedCart,
  Product,
  Promotion,
  Sale,
  SerialNumber,
  StoreInfo,
  TaxInvoice,
  TaxInvoiceBuyer,
  cartError,
  manualDiscountError,
  priceCart,
  todayIso,
} from '@core/models';
import { AuthService } from '@core/auth/auth.service';
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
  /** Full tax invoice requested for the bill (missing in bills parked before it existed) */
  buyer?: TaxInvoiceBuyer | null;
  /** Manual discount on the whole bill + its reason (missing in bills parked before it existed) */
  billManual?: ManualDiscount | null;
  manualReason?: string;
  /** Total when parked (display only; re-priced on resume) */
  total: number;
}

const HOLDS_KEY = 'pos.holds';

/**
 * State of the POS screen (provided in pos.routes.ts): master data loaded once per page load,
 * the cart (re-priced by `priceCart()` on every change), the optional full-tax-invoice buyer
 * and parked bills.
 */
@Injectable()
export class PosStore {
  private readonly api = inject(PosApi);
  private readonly storage = inject(StorageService);
  private readonly auth = inject(AuthService);

  private readonly _products = signal<Product[]>([]);
  private readonly _promotions = signal<Promotion[]>([]);
  private readonly _categories = signal<Category[]>([]);
  private readonly _methods = signal<PaymentMethod[]>([]);
  private readonly _storeInfo = signal<StoreInfo | null>(null);
  private readonly _loading = signal(false);
  private readonly _items = signal<CartItem[]>([]);
  private readonly _freeSerials = signal<FreeSerial[]>([]);
  private readonly _customer = signal('');
  private readonly _buyer = signal<TaxInvoiceBuyer | null>(null);
  private readonly _billManual = signal<ManualDiscount | null>(null);
  private readonly _manualReason = signal('');
  private readonly _holds = signal<HeldBill[]>(this.storage.get<HeldBill[]>(HOLDS_KEY) ?? []);
  private readonly _lastSale = signal<Sale | null>(null);
  private readonly _lastInvoice = signal<TaxInvoice | null>(null);

  readonly products = this._products.asReadonly();
  readonly promotions = this._promotions.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly items = this._items.asReadonly();
  readonly freeSerials = this._freeSerials.asReadonly();
  readonly customer = this._customer.asReadonly();
  /** Buyer of a full tax invoice issued with this bill (null = abbreviated receipt only) */
  readonly buyer = this._buyer.asReadonly();
  /** Manual discount on the whole bill (ส่วนลดพิเศษท้ายบิล) */
  readonly billManual = this._billManual.asReadonly();
  /** Why manual discounts are given (one reason per bill) */
  readonly manualReason = this._manualReason.asReadonly();
  readonly isAdmin = computed(() => this.auth.user()?.role === 'admin');
  /** Staff ceiling for manual discounts (% of a line after promotions) */
  readonly manualMaxPercent = computed(() => this._storeInfo()?.manualDiscountMaxPercent ?? 0);
  readonly holds = this._holds.asReadonly();
  readonly lastSale = this._lastSale.asReadonly();
  /** Full tax invoice issued with the last sale, if any */
  readonly lastInvoice = this._lastInvoice.asReadonly();
  /** Receipt header / footer */
  readonly storeInfo = this._storeInfo.asReadonly();

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
      this._billManual(),
    ),
  );

  /** Reason / staff-ceiling problem of the manual discounts (null = fine or none). */
  readonly manualProblem = computed(() =>
    manualDiscountError(this.cart(), {
      reason: this._manualReason(),
      isAdmin: this.isAdmin(),
      maxPercent: this.manualMaxPercent(),
    }),
  );

  /** First reason the bill cannot be paid yet (null = ready). */
  readonly blocker = computed(() => cartError(this.cart()) ?? this.manualProblem());

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
      storeInfo: this.api.storeInfo(),
    })
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe(({ products, promotions, categories, methods, storeInfo }) => {
        this._products.set(products);
        this._promotions.set(promotions);
        this._categories.set(categories);
        this._methods.set(methods);
        this._storeInfo.set(storeInfo);
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

  /** Manual discount on one cart line (null = none). */
  setLineDiscount(index: number, discount: ManualDiscount | null): void {
    this._items.update((items) =>
      items.map((i, n) => (n === index ? { ...i, manualDiscount: discount } : i)),
    );
  }

  /** Manual discount on the whole bill (null = none). */
  setBillDiscount(discount: ManualDiscount | null): void {
    this._billManual.set(discount);
  }

  setManualReason(reason: string): void {
    this._manualReason.set(reason);
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

  /** Requests (or, with null, drops) a full tax invoice issued together with the sale. */
  setBuyer(buyer: TaxInvoiceBuyer | null): void {
    this._buyer.set(buyer);
  }

  buyerByTaxId(taxId: string): Observable<TaxInvoiceBuyer | null> {
    return this.api.buyerByTaxId(taxId);
  }

  clear(): void {
    this._items.set([]);
    this._freeSerials.set([]);
    this._customer.set('');
    this._buyer.set(null);
    this._billManual.set(null);
    this._manualReason.set('');
  }

  /** Parks the current bill and starts an empty one. */
  hold(): void {
    if (!this._items().length) return;
    const bill: HeldBill = {
      // Unique even for two parks within the same millisecond.
      id: `H${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      heldAt: new Date().toISOString(),
      customer: this._customer(),
      items: this._items(),
      freeSerials: this._freeSerials(),
      buyer: this._buyer(),
      billManual: this._billManual(),
      manualReason: this._manualReason(),
      total: this.cart().total,
    };
    this.saveHolds([...this._holds(), bill]);
    this.clear();
  }

  /** Brings a parked bill back; the current bill (if any) is parked in its place. */
  resume(id: string): void {
    const bill = this._holds().find((b) => b.id === id);
    if (!bill) return;
    this.saveHolds(this._holds().filter((b) => b.id !== id));
    this.hold();
    this._items.set(bill.items);
    this._freeSerials.set(bill.freeSerials);
    this._customer.set(bill.customer);
    this._buyer.set(bill.buyer ?? null);
    this._billManual.set(bill.billManual ?? null);
    this._manualReason.set(bill.manualReason ?? '');
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
        customer: this._customer().trim() || (this._buyer()?.name ?? ''),
        expectedTotal: this.cart().total,
        buyer: this._buyer(),
        billManualDiscount: this._billManual(),
        manualDiscountReason: this._manualReason().trim(),
      })
      .pipe(
        tap({
          next: (sale) => {
            this._lastSale.set(sale);
            this._lastInvoice.set(null);
            if (sale.taxInvoiceNo) {
              this.api.taxInvoiceOf(sale.id).subscribe((inv) => this._lastInvoice.set(inv));
            }
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
