import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import {
  ApprovalCredentials,
  CashMovement,
  CashMovementPayload,
  Category,
  CountCheckResult,
  DrawerOpen,
  DrawerOpenPayload,
  PaymentMethod,
  PosTerminal,
  Product,
  Promotion,
  Sale,
  SalePayload,
  SerialNumber,
  Shift,
  ShiftClosePayload,
  ShiftCountInput,
  ShiftOpenPayload,
  ShiftSummary,
  StoreInfo,
  User,
  TaxInvoice,
  TaxInvoiceBuyer,
} from '@core/models';

/** HTTP calls for the POS feature (provided in pos.routes.ts). */
@Injectable()
export class PosApi {
  private readonly api = inject(ApiService);

  products(): Observable<Product[]> {
    return this.api.get<Product[]>('products');
  }

  promotions(): Observable<Promotion[]> {
    return this.api.get<Promotion[]>('promotions');
  }

  categories(): Observable<Category[]> {
    return this.api.get<Category[]>('categories');
  }

  paymentMethods(): Observable<PaymentMethod[]> {
    return this.api.get<PaymentMethod[]>('payment-methods');
  }

  serials(productId: number): Observable<SerialNumber[]> {
    return this.api.get<SerialNumber[]>(`products/${productId}/serials`);
  }

  storeInfo(): Observable<StoreInfo> {
    return this.api.get<StoreInfo>('settings/store');
  }

  posTerminals(): Observable<PosTerminal[]> {
    return this.api.get<PosTerminal[]>('pos-terminals');
  }

  taxInvoiceOf(saleId: number): Observable<TaxInvoice | null> {
    return this.api.get<TaxInvoice | null>(`sales/${saleId}/tax-invoice`);
  }

  /** Buyer details last used with this tax ID (null = never). */
  buyerByTaxId(taxId: string): Observable<TaxInvoiceBuyer | null> {
    return this.api.get<TaxInvoiceBuyer | null>('tax-invoices/buyer', { taxId });
  }

  checkout(payload: SalePayload): Observable<Sale> {
    return this.api.post<Sale>('sales', payload);
  }

  drawerOpens(shiftId: number): Observable<DrawerOpen[]> {
    return this.api.get<DrawerOpen[]>(`shifts/${shiftId}/drawer-opens`);
  }

  openDrawer(shiftId: number, payload: DrawerOpenPayload): Observable<DrawerOpen> {
    return this.api.post<DrawerOpen>(`shifts/${shiftId}/drawer-opens`, payload);
  }

  /** Any shift by id (an admin closing another terminal's shift). */
  shift(id: number): Observable<Shift> {
    return this.api.get<Shift>(`shifts/${id}`);
  }

  /** Open shift of this terminal (`X-Terminal-Id`), null = none. */
  currentShift(): Observable<Shift | null> {
    return this.api.get<Shift | null>('shifts/current');
  }

  /** All shifts, newest first (to find the float the last shift left in the drawer). */
  shifts(): Observable<Shift[]> {
    return this.api.get<Shift[]>('shifts');
  }

  openShift(payload: ShiftOpenPayload): Observable<Shift> {
    return this.api.post<Shift>('shifts/open', payload);
  }

  /** X report; per-method lines only for admins while the shift is open. */
  shiftSummary(shiftId: number): Observable<ShiftSummary> {
    return this.api.get<ShiftSummary>(`shifts/${shiftId}/summary`);
  }

  cashMovements(shiftId: number): Observable<CashMovement[]> {
    return this.api.get<CashMovement[]>(`shifts/${shiftId}/movements`);
  }

  addCashMovement(shiftId: number, payload: CashMovementPayload): Observable<CashMovement> {
    return this.api.post<CashMovement>(`shifts/${shiftId}/cash-movements`, payload);
  }

  /** Expected amounts / variances, revealed only after a complete blind count. */
  countCheck(shiftId: number, counts: ShiftCountInput[]): Observable<CountCheckResult> {
    return this.api.post<CountCheckResult>(`shifts/${shiftId}/count-check`, { counts });
  }

  closeShift(shiftId: number, payload: ShiftClosePayload): Observable<Shift> {
    return this.api.post<Shift>(`shifts/${shiftId}/close`, payload);
  }

  /** Checks a login without starting a session (wrong → 400, never a 401 logout). */
  verify(credentials: ApprovalCredentials): Observable<{ user: User }> {
    return this.api.post<{ user: User }>('auth/verify', credentials);
  }
}
