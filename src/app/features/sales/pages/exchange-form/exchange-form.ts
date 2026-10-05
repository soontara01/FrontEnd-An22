import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import {
  ExchangeContext,
  ExchangeLineInput,
  ExchangePayload,
  STORE_INFO_DEFAULTS,
  SaleLine,
  currentSerial,
  exchangeBlocker,
  exchangeDeadline,
  exchangeError,
  remainingQty,
  todayIso,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { SalesStore } from '../../data/sales.store';

interface Row {
  index: number;
  /** Units the customer still holds (sold − returned by credit notes) */
  held: number;
  /** Serial the customer holds now (serial lines) */
  serial: string | null;
  qty: number;
  newSerial: string;
  restock: boolean;
}

/**
 * Same-SKU exchange of a paid bill (`/sales/:id/exchange`, any staff member within the store's
 * exchange window): pick the units handed back, the replacement serial for serial SKUs and whether
 * the old unit goes back into stock. No money and no tax document — the rule is `exchangeError()`.
 */
@Component({
  selector: 'app-exchange-form',
  imports: [RouterLink, MatCheckboxModule, PageHeader, LoadingSpinner, ThaiDatePipe, MATERIAL],
  templateUrl: './exchange-form.html',
  styleUrl: '../credit-note-form/credit-note-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ExchangeForm {
  protected readonly store = inject(SalesStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  /** Route param (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly quickReasons = ['สินค้าชำรุด/เสีย', 'ลูกค้าขอเปลี่ยนเครื่อง', 'หยิบสินค้าผิด'];

  protected readonly data = rxResource({
    params: () => Number(this.id()),
    stream: ({ params }) => this.store.withReturnsAndExchanges(params),
  });
  /** In-stock serials per serial SKU of the bill. */
  protected readonly stockSerials = rxResource({
    params: () => {
      if (!this.data.hasValue()) return undefined;
      const ids = this.data
        .value()
        .sale.lines.filter((l) => l.serial)
        .map((l) => l.productId);
      return [...new Set(ids)];
    },
    stream: ({ params }) =>
      params.length
        ? forkJoin(Object.fromEntries(params.map((id) => [id, this.store.inStockSerials(id)])))
        : of({} as Record<string, string[]>),
  });
  /** Current stock of the non-serial SKUs of the bill (replacements must be on the shelf). */
  protected readonly products = rxResource({
    params: () => {
      if (!this.data.hasValue()) return undefined;
      const ids = this.data
        .value()
        .sale.lines.filter((l) => !l.serial && l.itemType !== 'service')
        .map((l) => l.productId);
      return [...new Set(ids)];
    },
    stream: ({ params }) => this.store.productsOf(params),
  });

  protected readonly rows = signal<Row[]>([]);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);

  private readonly context = computed<ExchangeContext | null>(() => {
    if (!this.data.hasValue()) return null;
    const { notes, exchanges } = this.data.value();
    return {
      creditNotes: notes,
      exchanges,
      store: this.store.storeInfo() ?? STORE_INFO_DEFAULTS,
      isAdmin: this.auth.user()?.role === 'admin',
      today: todayIso(),
      products: this.products.hasValue() ? this.products.value() : [],
    };
  });
  private readonly payload = computed<ExchangePayload>(() => ({
    lines: this.rows()
      .filter((r) => r.qty > 0)
      .map((r): ExchangeLineInput => ({
        saleLineIndex: r.index,
        qty: r.qty,
        newSerial: r.serial ? r.newSerial.trim() || null : null,
        restock: r.restock,
      })),
    reason: this.reason().trim(),
  }));
  protected readonly blocker = computed(() => {
    const ctx = this.context();
    return ctx && this.data.hasValue() ? exchangeBlocker(this.data.value().sale, ctx) : null;
  });
  protected readonly problem = computed(() => {
    const ctx = this.context();
    if (!ctx || !this.data.hasValue() || !this.store.storeInfo() || !this.products.hasValue()) {
      return null;
    }
    return exchangeError(this.data.value().sale, this.payload(), ctx);
  });
  /** 'YYYY-MM-DD' last day staff may exchange (null = no limit). */
  protected readonly deadline = computed(() => {
    const info = this.store.storeInfo();
    return this.data.hasValue() && info ? exchangeDeadline(this.data.value().sale, info) : null;
  });

  constructor() {
    this.store.loadLookups();
    effect(() => {
      if (!this.data.hasValue()) return;
      const { sale, notes, exchanges } = this.data.value();
      this.rows.set(
        sale.lines.map((l, index) => ({
          index,
          held: l.itemType === 'service' ? 0 : remainingQty(sale, notes, index),
          serial: l.serial ? currentSerial(sale, index, exchanges) : null,
          qty: 0,
          newSerial: '',
          // Most swaps are for faulty units: written off unless the cashier says it is fine.
          restock: false,
        })),
      );
    });
    effect(() => {
      if (this.data.error()) void this.router.navigate(['/sales']);
    });
  }

  protected line(row: Row): SaleLine {
    return this.data.value()!.sale.lines[row.index];
  }

  /** Base-unit stock on the shelf for a non-serial row (null while loading). */
  protected shelfStock(row: Row): { stock: number; unit: string } | null {
    const list = this.products.hasValue() ? this.products.value() : [];
    const p = list.find((x) => x.id === this.line(row).productId);
    return p ? { stock: p.stock, unit: p.unit } : null;
  }

  /** Replacement serials on offer for a row (in stock, same SKU). */
  protected serialOptions(row: Row): string[] {
    const map = this.stockSerials.hasValue() ? this.stockSerials.value() : {};
    return map[this.line(row).productId] ?? [];
  }

  protected setQty(row: Row, value: string | number): void {
    const qty = Math.max(0, Math.min(row.held, Math.floor(Number(value) || 0)));
    this.patch(row, { qty });
  }

  protected patch(row: Row, change: Partial<Row>): void {
    this.rows.update((rows) => rows.map((r) => (r.index === row.index ? { ...r, ...change } : r)));
  }

  protected save(): void {
    if (!this.data.hasValue() || this.problem() || this.saving()) return;
    const sale = this.data.value().sale;
    this.saving.set(true);
    this.store.createExchange(sale.id, this.payload()).subscribe({
      next: (exchange) => {
        this.notify.success(`บันทึกการเปลี่ยนสินค้า ${exchange.exNo} แล้ว`);
        void this.router.navigate(['/sales', sale.id], { queryParams: { printEx: exchange.id } });
      },
      error: () => {
        this.saving.set(false);
        this.data.reload();
        this.stockSerials.reload();
        this.products.reload();
      },
    });
  }
}
