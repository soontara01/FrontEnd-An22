import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, forkJoin, map, tap, throwError } from 'rxjs';
import {
  ApprovalCredentials,
  CartItem,
  CashMovement,
  CashMovementPayload,
  Category,
  CountCheckResult,
  DrawerOpen,
  DrawerOpenPayload,
  FreeSerial,
  ManualDiscount,
  PaymentInput,
  PaymentMethod,
  PosTerminal,
  PricedCart,
  Product,
  Promotion,
  Sale,
  SerialNumber,
  Shift,
  ShiftClosePayload,
  ShiftCountInput,
  ShiftOpenPayload,
  ShiftSummary,
  StoreInfo,
  TaxInvoice,
  TaxInvoiceBuyer,
  cartError,
  manualDiscountError,
  priceCart,
  shiftBlocker,
  shiftOpenTooLong,
  terminalError,
  terminalLabel,
  todayIso,
} from '@core/models';
import { AuthService } from '@core/auth/auth.service';
import { StorageService } from '@core/services/storage.service';
import { TerminalService } from '@core/services/terminal.service';
import { httpErrorShown } from '@core/http/http-error-shown';
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

/** Bills parked before SaaS step 2 (one store): moved once into the branch that opens the POS. */
const LEGACY_HOLDS_KEY = 'pos.holds';
/** Id of the shift whose screen is locked (survives reloads / menu switches). */
const LOCK_KEY = 'pos.locked';

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
  private readonly terminal = inject(TerminalService);

  private readonly _products = signal<Product[]>([]);
  private readonly _promotions = signal<Promotion[]>([]);
  private readonly _categories = signal<Category[]>([]);
  private readonly _methods = signal<PaymentMethod[]>([]);
  private readonly _storeInfo = signal<StoreInfo | null>(null);
  private readonly _terminals = signal<PosTerminal[]>([]);
  private readonly _loading = signal(false);
  private readonly _items = signal<CartItem[]>([]);
  private readonly _freeSerials = signal<FreeSerial[]>([]);
  private readonly _customer = signal('');
  private readonly _buyer = signal<TaxInvoiceBuyer | null>(null);
  private readonly _billManual = signal<ManualDiscount | null>(null);
  private readonly _manualReason = signal('');
  /** Parked bills belong to this device's company + branch (saas-plan section 3). */
  private readonly holdsKey = `pos.held.${this.auth.company()?.id ?? 0}.${this.auth.currentBranch()?.id ?? 0}`;
  private readonly _holds = signal<HeldBill[]>(this.loadHolds());
  private readonly _lastSale = signal<Sale | null>(null);
  private readonly _lastInvoice = signal<TaxInvoice | null>(null);
  private readonly _shift = signal<Shift | null>(null);
  private readonly _shiftLoaded = signal(false);
  /** The shift closed on this page load (Z report) */
  private readonly _closedShift = signal<Shift | null>(null);
  private readonly _lockedShiftId = signal<number | null>(this.storage.get<number>(LOCK_KEY));

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
  readonly isAdmin = this.auth.isAdmin;
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
        // The server re-prices with the store's real status; until it loads assume registered.
        vatRegistered: this.storeInfo()?.vatRegistered ?? true,
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

  /** Open shift of this terminal (null = none) */
  readonly shift = this._shift.asReadonly();
  /** The current shift has been fetched at least once (no open-shift prompt before that) */
  readonly shiftLoaded = this._shiftLoaded.asReadonly();
  /** The terminal this device is set to (Settings → "เครื่องนี้"); null = not set */
  readonly terminalId = this.terminal.terminalId;
  /** 'เครื่อง 2 · แคชเชียร์หน้าร้าน' */
  readonly terminalLabel = computed(() => {
    const id = this.terminalId();
    return id === null ? 'ยังไม่ได้ตั้งเลขเครื่อง' : terminalLabel(id, this._terminals());
  });
  /**
   * Why this device cannot sell or open a shift: it must be an active terminal of the registry in
   * the working branch — same rule as the server (`terminalError()`). Null until the data has loaded.
   */
  readonly terminalProblem = computed(() =>
    this._shiftLoaded()
      ? terminalError(this.terminalId(), this._terminals(), this.auth.currentBranch()?.id ?? null)
      : null,
  );
  /** Shifts in use (`StoreInfo.requireShift`); unknown until the store info has loaded */
  readonly requireShift = computed(() => this._storeInfo()?.requireShift ?? false);
  /** Why this user cannot sell here now — same rule as the server (`shiftBlocker()`). */
  readonly shiftProblem = computed(() =>
    shiftBlocker('sell', {
      requireShift: this.requireShift(),
      shift: this._shift(),
      user: this.auth.user()?.name ?? '',
      isAdmin: this.isAdmin(),
    }),
  );
  /** Open longer than `StoreInfo.shiftMaxHours` — probably left open (warning only). */
  readonly closedShift = this._closedShift.asReadonly();
  /** Name of the logged-in user (= `Shift.cashier` of the shifts they open) */
  readonly userName = computed(() => this.auth.user()?.name ?? '');
  /** Username to prefill on the lock screen (the part of the e-mail before @) */
  readonly loginHint = computed(() => this.auth.user()?.username ?? '');
  /** The screen is locked for the open shift (a lock of another / closed shift is ignored). */
  readonly locked = computed(() => {
    const id = this._lockedShiftId();
    return id !== null && this._shift()?.id === id;
  });
  /** Its cashier or an admin may close the open shift (S1). */
  readonly canCloseShift = computed(() => {
    const shift = this._shift();
    return !!shift && (shift.cashier === this.auth.user()?.name || this.isAdmin());
  });
  readonly shiftTooLong = computed(() => {
    const shift = this._shift();
    const info = this._storeInfo();
    return !!shift && !!info && shiftOpenTooLong(shift, new Date(), info.shiftMaxHours);
  });

  /** First reason the bill cannot be paid yet (null = ready). */
  readonly blocker = computed(
    () =>
      this.terminalProblem() ??
      this.shiftProblem() ??
      cartError(this.cart()) ??
      this.manualProblem(),
  );

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
      terminals: this.api.posTerminals(),
      shift: this.api.currentShift(),
    })
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe({
        next: ({ products, promotions, categories, methods, storeInfo, terminals, shift }) => {
          this._products.set(products);
          this._promotions.set(promotions);
          this._categories.set(categories);
          this._methods.set(methods);
          this._storeInfo.set(storeInfo);
          this._terminals.set(terminals);
          this._shift.set(shift);
          this._shiftLoaded.set(true);
        },
        error: httpErrorShown,
      });
  }

  /** Opens a shift at this device's terminal (the number comes from Settings, not the cashier). */
  openShift(payload: ShiftOpenPayload): Observable<Shift> {
    return this.api.openShift(payload).pipe(tap((shift) => this._shift.set(shift)));
  }

  /** Float the last closed shift of this terminal left in the drawer (0 = none). */
  lastFloatLeft(): Observable<number> {
    // Asked of the server: non-admins may list only their own shifts (P6).
    return this.api.lastFloat().pipe(map((r) => r.floatLeft));
  }

  shiftSummary(shiftId: number): Observable<ShiftSummary> {
    return this.api.shiftSummary(shiftId);
  }

  cashMovements(shiftId: number): Observable<CashMovement[]> {
    return this.api.cashMovements(shiftId);
  }

  addCashMovement(shiftId: number, payload: CashMovementPayload): Observable<CashMovement> {
    return this.api.addCashMovement(shiftId, payload);
  }

  drawerOpens(shiftId: number): Observable<DrawerOpen[]> {
    return this.api.drawerOpens(shiftId);
  }

  /** Logs the drawer opened without a sale (S7; no drawer hardware yet). */
  openDrawer(shiftId: number, payload: DrawerOpenPayload): Observable<DrawerOpen> {
    return this.api.openDrawer(shiftId, payload);
  }

  /** Any shift by id — an admin closing another terminal's shift (`/pos/shift-close?shift=`). */
  fetchShift(id: number): Observable<Shift> {
    return this.api.shift(id);
  }

  /** 'เครื่อง 2 · แคชเชียร์หน้าร้าน' for any terminal number. */
  terminalLabelOf(id: number): string {
    return terminalLabel(id, this._terminals());
  }

  /**
   * Expected amounts / variances after a complete blind count — of this terminal's open shift, or
   * of `target` (another terminal's shift an admin closes).
   */
  countCheck(counts: ShiftCountInput[], target?: Shift): Observable<CountCheckResult> {
    const shift = target ?? this._shift();
    if (!shift) return throwError(() => new Error('ยังไม่ได้เปิดกะที่เครื่องนี้'));
    return this.api.countCheck(shift.id, counts);
  }

  /**
   * Closes this terminal's open shift, or `target`; the closed one stays available for its Z
   * report. Closing another terminal's shift leaves this terminal's shift and lock alone.
   */
  closeShift(payload: ShiftClosePayload, target?: Shift): Observable<Shift> {
    const shift = target ?? this._shift();
    if (!shift) return throwError(() => new Error('ยังไม่ได้เปิดกะที่เครื่องนี้'));
    const own = shift.id === this._shift()?.id;
    return this.api.closeShift(shift.id, payload).pipe(
      tap((closed) => {
        this._closedShift.set(closed);
        if (!own) return;
        this._shift.set(null);
        this.setLock(null);
      }),
    );
  }

  /** Locks the screen of the open shift until its cashier (or an admin) logs in again. */
  lock(): void {
    const shift = this._shift();
    if (shift) this.setLock(shift.id);
  }

  /** Unlocks with a verified login; returns why not (null = unlocked). */
  unlock(credentials: ApprovalCredentials): Observable<string | null> {
    return this.api.verify(credentials).pipe(
      map(({ user }) => {
        const shift = this._shift();
        if (shift && user.name !== shift.cashier && user.role !== 'admin') {
          return `ปลดล็อกได้เฉพาะ ${shift.cashier} หรือผู้ดูแลระบบ`;
        }
        this.setLock(null);
        return null;
      }),
    );
  }

  private setLock(shiftId: number | null): void {
    this._lockedShiftId.set(shiftId);
    if (shiftId === null) this.storage.remove(LOCK_KEY);
    else this.storage.set(LOCK_KEY, shiftId);
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
              this.api
                .taxInvoiceOf(sale.id)
                .subscribe({ next: (inv) => this._lastInvoice.set(inv), error: httpErrorShown });
            }
            this.clear();
            this.api.products().subscribe({
              next: (products) => this._products.set(products),
              error: httpErrorShown,
            });
          },
          // Prices, promotions or stock changed on the server: show the current state.
          error: () => this.load(),
        }),
      );
  }

  private saveHolds(holds: HeldBill[]): void {
    this._holds.set(holds);
    this.storage.set(this.holdsKey, holds);
  }

  private loadHolds(): HeldBill[] {
    const holds = this.storage.get<HeldBill[]>(this.holdsKey) ?? [];
    const legacy = this.storage.get<HeldBill[]>(LEGACY_HOLDS_KEY);
    if (!legacy) return holds;
    this.storage.remove(LEGACY_HOLDS_KEY);
    this.storage.set(this.holdsKey, [...holds, ...legacy]);
    return [...holds, ...legacy];
  }
}
