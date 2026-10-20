import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  Observable,
  catchError,
  debounceTime,
  finalize,
  forkJoin,
  map,
  of,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import {
  ApprovalCredentials,
  CartIssue,
  CartItem,
  CashMovement,
  CashMovementPayload,
  Category,
  CountCheckResult,
  DrawerOpen,
  DrawerOpenPayload,
  FreeSerial,
  HeldBill,
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
import { CostCheckPayload, PosApi } from './pos-api.service';

export type { HeldBill } from '@core/models';

/**
 * Where this device once parked bills (before E48 they lived in localStorage): `pos.holds`
 * (before SaaS step 2) and `pos.held.<company>.<branch>` — moved up to the server once, then
 * removed. `pos.locked` was the device's screen lock (now `Shift.lockedAt`).
 */
const LEGACY_HOLDS_KEY = 'pos.holds';
const OLD_LOCK_KEY = 'pos.locked';

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
  /** Bills this device parked before E48, per company + branch (moved to the server on load). */
  private readonly oldHoldsKey = `pos.held.${this.auth.company()?.id ?? 0}.${this.auth.currentBranch()?.id ?? 0}`;
  /** Parked bills of this branch + terminal, from the server (E48). */
  private readonly _holds = signal<HeldBill[]>([]);
  private readonly _lastSale = signal<Sale | null>(null);
  private readonly _lastInvoice = signal<TaxInvoice | null>(null);
  private readonly _shift = signal<Shift | null>(null);
  private readonly _shiftLoaded = signal(false);
  /** The shift closed on this page load (Z report) */
  private readonly _closedShift = signal<Shift | null>(null);

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
        // Same branch the server prices with (`X-Branch-Id`, D2).
        branchId: this.auth.currentBranch()?.id ?? null,
      },
      this._freeSerials(),
      this._billManual(),
    ),
  );

  /**
   * Cart sent to `POST /sales/cost-check` (E45): only for who cannot see cost — their products
   * arrive without cost, so `priceCart()` here cannot tell — and only while a manual discount is
   * given (nothing else can go below cost). null = no check.
   */
  private readonly costCheckRequest = computed<CostCheckPayload | null>(() => {
    if (this.auth.canSeeCost()) return null;
    const items = this._items();
    const billManualDiscount = this._billManual();
    if (!billManualDiscount && !items.some((i) => i.manualDiscount)) return null;
    return { items, freeSerials: this._freeSerials(), billManualDiscount };
  });
  /** The server's answer and the request it answers (an older answer is never shown). */
  private readonly costCheck = toSignal(
    toObservable(this.costCheckRequest).pipe(
      debounceTime(300),
      switchMap((request) =>
        request
          ? this.api.costCheck(request).pipe(
              map((issues) => ({ request, issues })),
              // The error toast is shown already; the warning just stays away.
              catchError(() => of({ request, issues: [] as CartIssue[] })),
            )
          : of({ request, issues: [] as CartIssue[] }),
      ),
    ),
    { initialValue: { request: null, issues: [] as CartIssue[] } },
  );
  /** Warnings of the cart (non-blocking), incl. the server's below-cost ones (E45). */
  readonly warnings = computed(() => {
    const own = this.cart().issues.filter((i) => !i.blocking);
    const check = this.costCheck();
    const current = this.costCheckRequest();
    return current && check.request === current ? [...own, ...check.issues] : own;
  });

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
      ? terminalError(
          this.terminalId(),
          this._terminals(),
          this.auth.currentBranch()?.id ?? null,
          this.auth.branches(),
        )
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
  /** The screen of the open shift is locked (`Shift.lockedAt`, kept by the server — E48). */
  readonly locked = computed(() => !!this._shift()?.lockedAt);
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
    this.loadHolds();
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

  /** Seller details of another branch (Z report of a shift closed on its behalf, E22). */
  fetchStoreInfo(branchId: number): Observable<StoreInfo> {
    return this.api.storeInfo(branchId);
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
        if (own) this._shift.set(null);
      }),
    );
  }

  /**
   * Locks the screen of the open shift until its cashier (or an admin) logs in again — on the
   * server (E48), so clearing the browser's storage does not unlock it.
   */
  lock(): void {
    const shift = this._shift();
    if (!shift) return;
    this.api.lockShift(shift.id).subscribe({
      next: (locked) => this._shift.set(locked),
      error: httpErrorShown,
    });
  }

  /**
   * Unlocks with the cashier's or an admin's login, checked by the server (wrong / someone else →
   * 400, shown by the error interceptor). Emits null when unlocked (no shift = nothing to do).
   */
  unlock(credentials: ApprovalCredentials): Observable<string | null> {
    const shift = this._shift();
    if (!shift) return of(null);
    return this.api.unlockShift(shift.id, credentials).pipe(
      tap((unlocked) => this._shift.set(unlocked)),
      map(() => null),
    );
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

  /** Parks the current bill on the server and starts an empty one. */
  hold(): void {
    const bill = this.billToHold();
    if (!bill) return;
    this.api.holdBill(bill).subscribe({
      next: (held) => {
        this._holds.update((holds) => [...holds, held]);
        this.clear();
      },
      error: httpErrorShown,
    });
  }

  /** Brings a parked bill back; the current bill (if any) is parked in its place. */
  resume(id: string): void {
    const bill = this._holds().find((b) => b.id === id);
    if (!bill) return;
    const current = this.billToHold();
    this.api
      .deleteHeldBill(id)
      .pipe(switchMap(() => (current ? this.api.holdBill(current) : of(null))))
      .subscribe({
        next: (parked) => {
          this._holds.update((holds) => [
            ...holds.filter((b) => b.id !== id),
            ...(parked ? [parked] : []),
          ]);
          this._items.set(bill.items);
          this._freeSerials.set(bill.freeSerials);
          this._customer.set(bill.customer);
          this._buyer.set(bill.buyer ?? null);
          this._billManual.set(bill.billManual ?? null);
          this._manualReason.set(bill.manualReason ?? '');
        },
        error: httpErrorShown,
      });
  }

  discardHold(id: string): void {
    this.api.deleteHeldBill(id).subscribe({
      next: () => this._holds.update((holds) => holds.filter((b) => b.id !== id)),
      error: httpErrorShown,
    });
  }

  /** The current bill as a parked one (null = empty cart). */
  private billToHold(): Omit<HeldBill, 'id'> | null {
    if (!this._items().length) return null;
    return {
      heldAt: new Date().toISOString(),
      customer: this._customer(),
      items: this._items(),
      freeSerials: this._freeSerials(),
      buyer: this._buyer(),
      billManual: this._billManual(),
      manualReason: this._manualReason(),
      total: this.cart().total,
    };
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

  /**
   * Parked bills of this branch + terminal (a device that is no POS terminal has none). Bills
   * this device parked in localStorage before E48 go up to the server first, then are removed.
   */
  private loadHolds(): void {
    this.storage.remove(OLD_LOCK_KEY);
    if (this.terminal.terminalId() === null) {
      this._holds.set([]);
      return;
    }
    const old = [
      ...(this.storage.get<HeldBill[]>(this.oldHoldsKey) ?? []),
      ...(this.storage.get<HeldBill[]>(LEGACY_HOLDS_KEY) ?? []),
    ];
    const moveUp = old.length
      ? forkJoin(old.map((bill) => this.api.holdBill(withoutId(bill)))).pipe(
          tap(() => {
            this.storage.remove(this.oldHoldsKey);
            this.storage.remove(LEGACY_HOLDS_KEY);
          }),
        )
      : of([]);
    moveUp.pipe(switchMap(() => this.api.heldBills())).subscribe({
      next: (holds) => this._holds.set(holds),
      error: httpErrorShown,
    });
  }
}

/** A parked bill to send up again: the server issues the id. */
function withoutId(bill: HeldBill): Omit<HeldBill, 'id'> {
  const copy: Partial<HeldBill> = { ...bill };
  delete copy.id;
  return copy as Omit<HeldBill, 'id'>;
}
