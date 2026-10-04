import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';
import {
  Product,
  SKU_STATUS_BADGE,
  SKU_STATUS_HINT,
  SKU_STATUS_LABEL,
  VAT_TYPE_LABEL,
  effectiveCost,
  marginPercent,
  creditLabel,
  stockInPacks,
  suggestReorderQty,
  stockLevel,
  vatBreakdown,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { SkuStore } from '../../data/sku.store';

const LEVEL = {
  ok: { label: 'ปกติ', badge: 'badge-success' },
  low: { label: 'ใกล้หมด', badge: 'badge-warn' },
  out: { label: 'หมด', badge: 'badge-error' },
} as const;

/** Read-only view of one SKU (`/sku/:id`). */
@Component({
  selector: 'app-sku-detail',
  imports: [CurrencyPipe, RouterLink, PageHeader, LoadingSpinner, MATERIAL],
  templateUrl: './sku-detail.html',
  styleUrl: './sku-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SkuDetail implements OnInit {
  protected readonly store = inject(SkuStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);

  /** Bound from the `:id` route param. */
  readonly id = input.required<string>();

  protected readonly sku = signal<Product | null>(null);

  protected readonly level = computed(() => {
    const sku = this.sku();
    return sku ? LEVEL[stockLevel(sku)] : null;
  });

  protected readonly margin = computed(() => {
    const sku = this.sku();
    return sku ? marginPercent(sku.currentPrice, effectiveCost(sku), sku.vatType) : null;
  });

  /** Today's VAT-inclusive price split into net + VAT. */
  protected readonly priceBreakdown = computed(() => {
    const sku = this.sku();
    return sku?.currentPrice != null ? vatBreakdown(sku.currentPrice, sku.vatType) : null;
  });

  /** Quantity the reorder rule would suggest right now (0 = no need). */
  protected readonly reorderQty = computed(() => {
    const sku = this.sku();
    return sku ? suggestReorderQty(sku) : 0;
  });

  protected readonly credit = creditLabel;

  protected supplierCredit(id: number): string {
    const s = this.store.suppliers().find((x) => x.id === id);
    return s ? creditLabel(s.creditDays) : '';
  }

  protected readonly stockText = computed(() => {
    const sku = this.sku();
    return sku ? stockInPacks(sku) : '';
  });

  protected readonly status = computed(() => {
    const sku = this.sku();
    return sku
      ? {
          label: SKU_STATUS_LABEL[sku.saleStatus],
          badge: SKU_STATUS_BADGE[sku.saleStatus],
          hint: SKU_STATUS_HINT[sku.saleStatus],
        }
      : null;
  });

  protected readonly vatLabel = VAT_TYPE_LABEL;

  protected readonly serialFormat = computed(() => {
    const sku = this.sku();
    if (!sku?.serialControl) return null;
    const prefix = sku.serialPrefix ? `${sku.serialPrefix}-` : '';
    return sku.serialLength
      ? `${prefix}${'X'.repeat(Math.max(sku.serialLength - prefix.length, 1))} (${sku.serialLength} ตัว)`
      : prefix
        ? `${prefix}… (ไม่จำกัดความยาว)`
        : 'ไม่กำหนดรูปแบบ';
  });

  ngOnInit(): void {
    this.store.load(); // supplier names for the supplier table
    this.store.getById(Number(this.id())).subscribe({
      next: (sku) => this.sku.set(sku),
      error: () => void this.router.navigate(['/sku']),
    });
  }

  protected remove(sku: Product): void {
    openConfirm(this.dialog, {
      title: 'ลบ SKU',
      message: `ต้องการลบ ${sku.sku} - ${sku.name} ใช่หรือไม่?`,
      confirmText: 'ลบ',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.remove(sku.id)),
      )
      .subscribe(() => {
        this.notify.success(`ลบ ${sku.sku} เรียบร้อย`);
        void this.router.navigate(['/sku']);
      });
  }
}
