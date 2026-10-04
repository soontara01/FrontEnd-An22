import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';
import {
  PRICE_STATUS_LABEL,
  PriceStatus,
  SkuPrice,
  formatDateRange,
  effectiveCost,
  marginPercent,
  priceStatus,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { PricingStore } from '../../data/pricing.store';
import { PriceFormData, PriceFormDialog } from '../../dialogs/price-form-dialog/price-form-dialog';

const STATUS_BADGE: Record<PriceStatus, string> = {
  active: 'badge-success',
  scheduled: 'badge-warn',
  expired: '',
};

/** All price periods of one SKU (`/pricing/:productId`). */
@Component({
  selector: 'app-sku-prices',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    RouterLink,
    MatTableModule,
    PageHeader,
    EmptyState,
    LoadingSpinner,
    ThaiDatePipe,
    MATERIAL,
  ],
  templateUrl: './sku-prices.html',
  styleUrl: './sku-prices.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SkuPrices {
  protected readonly store = inject(PricingStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly notify = inject(NotificationService);

  /** Bound from the `:productId` route param. */
  readonly productId = input.required<string>();

  protected readonly columns = [
    'price',
    'startDate',
    'endDate',
    'status',
    'margin',
    'note',
    'actions',
  ];

  protected readonly row = computed(() =>
    this.store.rows().find((r) => r.product.id === Number(this.productId())),
  );
  protected readonly periods = computed(() => this.store.pricesFor(Number(this.productId())));

  constructor() {
    this.store.load();

    // Unknown / discontinued SKU id → back to the overview once data is loaded.
    effect(() => {
      if (!this.store.loading() && this.store.rows().length && !this.row()) {
        void this.router.navigate(['/pricing']);
      }
    });
  }

  protected readonly effectiveCost = effectiveCost;

  protected status(p: SkuPrice): PriceStatus {
    return priceStatus(p, this.store.today);
  }

  protected statusText(p: SkuPrice): string {
    return PRICE_STATUS_LABEL[this.status(p)];
  }

  protected statusBadge(p: SkuPrice): string {
    return STATUS_BADGE[this.status(p)];
  }

  protected margin(p: SkuPrice): number | null {
    const product = this.row()?.product;
    return product ? marginPercent(p.price, effectiveCost(product), product.vatType) : null;
  }

  protected openForm(price?: SkuPrice): void {
    const row = this.row();
    if (!row) return;
    this.dialog
      .open<PriceFormDialog, PriceFormData, SkuPrice>(PriceFormDialog, {
        data: { product: row.product, price, others: this.periods() },
        width: '520px',
        maxWidth: '95vw',
        // Route-scoped PricingStore + date adapter live in this injector.
        injector: this.injector,
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.notify.success(price ? 'บันทึกช่วงราคาแล้ว' : 'เพิ่มช่วงราคาแล้ว');
      });
  }

  protected remove(price: SkuPrice): void {
    openConfirm(this.dialog, {
      title: 'ลบช่วงราคา',
      message: `ต้องการลบราคา ฿${price.price.toLocaleString('en-US')} (${formatDateRange(price)}) ใช่หรือไม่?`,
      confirmText: 'ลบ',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.remove(price.id)),
      )
      .subscribe(() => this.notify.success('ลบช่วงราคาแล้ว'));
  }
}
