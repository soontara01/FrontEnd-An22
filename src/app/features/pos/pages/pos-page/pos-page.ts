import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
  MatAutocompleteTrigger,
} from '@angular/material/autocomplete';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { filter, tap } from 'rxjs';
import { PricedLine, Product, Sale, stockInPacks } from '@core/models';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { SellUnit, findByCode, searchProducts } from '../../data/product-lookup';
import { PosStore } from '../../data/pos.store';
import { PaymentDialog } from '../../dialogs/payment-dialog/payment-dialog';
import {
  SerialPickData,
  SerialPickDialog,
} from '../../dialogs/serial-pick-dialog/serial-pick-dialog';

/** Search result row: one sellable unit (base or pack) with its price. */
interface UnitOption extends SellUnit {
  unit: string;
  price: number | null;
}

/**
 * POS screen: scan / search → cart (priced live by `priceCart()`) → payment dialog.
 * Shortcuts: F2 search, F8 park bill, F12 pay.
 */
@Component({
  selector: 'app-pos-page',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    MatAutocompleteModule,
    MatMenuModule,
    EmptyState,
    LoadingSpinner,
    AutofocusDirective,
    MATERIAL,
  ],
  templateUrl: './pos-page.html',
  styleUrl: './pos-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onShortcut($event)' },
})
export default class PosPage {
  protected readonly store = inject(PosStore);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);

  private readonly scanInput = viewChild.required<ElementRef<HTMLInputElement>>('scanInput');
  private readonly trigger = viewChild.required(MatAutocompleteTrigger);

  protected readonly query = signal('');
  protected readonly scanError = signal('');

  protected readonly options = computed<UnitOption[]>(() =>
    searchProducts(this.query(), this.store.products()).flatMap((product) => [
      { product, factor: 1, unit: product.unit, price: product.currentPrice },
      ...product.packUnits.map((u) => ({
        product,
        factor: u.factor,
        unit: `${u.unit} (${u.factor} ${product.unit})`,
        price: product.currentPrice === null ? null : product.currentPrice * u.factor,
      })),
    ]),
  );

  protected readonly cart = this.store.cart;
  protected readonly blocking = computed(() => this.cart().issues.filter((i) => i.blocking));
  protected readonly warnings = computed(() => this.cart().issues.filter((i) => !i.blocking));

  constructor() {
    this.store.load();
  }

  protected stockText(product: Product): string {
    return product.itemType === 'service' ? 'บริการ' : `คงเหลือ ${stockInPacks(product)}`;
  }

  /** 'HH:mm' of an ISO timestamp (DatePipe would pull locale formatting into the initial bundle). */
  protected time(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  protected promotionNames(line: PricedLine): string[] {
    const names = this.store.promotionName();
    return line.promotionIds.map((id) => names.get(id) ?? `#${id}`);
  }

  protected billPromotionNames(): string[] {
    const names = this.store.promotionName();
    return this.cart().billPromotionIds.map((id) => names.get(id) ?? `#${id}`);
  }

  protected needsSerial(line: PricedLine): boolean {
    return !!this.store.product(line.productId)?.serialControl;
  }

  /** Enter in the scan box: exact barcode / SKU code first, else the only search hit. */
  protected onEnter(): void {
    if (this.trigger().activeOption) return; // the autocomplete picks the highlighted option
    const code = this.query().trim();
    if (!code) return;
    const exact = findByCode(code, this.store.products());
    if (exact) return this.addUnit(exact);
    const hits = this.options();
    if (hits.length === 1) return this.addUnit(hits[0]);
    this.scanError.set(hits.length ? 'พบหลายรายการ เลือกจากรายการค้นหา' : `ไม่พบสินค้า "${code}"`);
  }

  protected onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    this.addUnit(event.option.value as UnitOption);
  }

  protected displayNothing(): string {
    return '';
  }

  private addUnit({ product, factor }: SellUnit): void {
    this.query.set('');
    this.scanInput().nativeElement.value = '';
    if (product.currentPrice === null) {
      this.scanError.set(`${product.sku} ยังไม่กำหนดราคาขาย`);
      return;
    }
    this.scanError.set('');
    if (product.serialControl) {
      this.pickSerials({
        product,
        exclude: this.store.serialsInCart(),
        count: null,
        title: 'เลือก Serial ที่ขาย',
      }).subscribe((serials) => this.store.addSerials(product.id, serials));
      return;
    }
    this.store.add(product.id, factor);
    this.focusScan();
  }

  protected changeQty(line: PricedLine, value: string | number): void {
    const qty = Number(value);
    if (line.cartIndex !== null && Number.isInteger(qty) && qty >= 1) {
      this.store.setQty(line.cartIndex, qty);
    }
  }

  protected removeLine(line: PricedLine): void {
    if (line.cartIndex !== null) this.store.remove(line.cartIndex);
    this.focusScan();
  }

  /** Picks the serials of every free unit of this SKU given by the line's promotion. */
  protected pickFreeSerials(line: PricedLine): void {
    const product = this.store.product(line.productId);
    const promotionId = line.freeOfPromotionId;
    if (!product || promotionId === null) return;
    const group = this.cart().lines.filter(
      (l) => l.freeOfPromotionId === promotionId && l.productId === line.productId,
    );
    const current = group.flatMap((l) => (l.serial ? [l.serial] : []));
    this.pickSerials({
      product,
      exclude: this.store.serialsInCart(),
      count: group.length,
      selected: current,
      title: 'เลือก Serial ของแถม',
    }).subscribe((serials) => this.store.setFreeSerials(promotionId, product.id, serials));
  }

  protected pay(): void {
    if (this.store.blocker() || this.dialog.openDialogs.length) return;
    this.dialog
      .open<PaymentDialog, void, Sale>(PaymentDialog, {
        injector: this.injector,
        width: '560px',
        maxWidth: '95vw',
        disableClose: true,
        autoFocus: false,
      })
      .afterClosed()
      .subscribe(() => this.focusScan());
  }

  protected hold(): void {
    this.store.hold();
    this.focusScan();
  }

  protected resume(id: string): void {
    this.store.resume(id);
    this.focusScan();
  }

  protected clearBill(): void {
    openConfirm(this.dialog, {
      title: 'ล้างบิล',
      message: 'ลบสินค้าทั้งหมดในบิลนี้?',
      confirmText: 'ล้างบิล',
    })
      .pipe(filter(Boolean))
      .subscribe(() => {
        this.store.clear();
        this.focusScan();
      });
  }

  protected onShortcut(event: KeyboardEvent): void {
    if (this.dialog.openDialogs.length) return;
    const actions: Record<string, () => void> = {
      F2: () => this.focusScan(),
      F8: () => this.hold(),
      F12: () => this.pay(),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  private pickSerials(data: SerialPickData) {
    return this.dialog
      .open<SerialPickDialog, SerialPickData, string[]>(SerialPickDialog, {
        data,
        injector: this.injector,
        width: '520px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .pipe(
        tap(() => this.focusScan()),
        filter((serials): serials is string[] => !!serials),
      );
  }

  private focusScan(): void {
    setTimeout(() => this.scanInput().nativeElement.focus());
  }
}
