import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';
import {
  PROMOTION_STATUS_BADGE,
  PROMOTION_STATUS_LABEL,
  PROMOTION_TYPE_ICON,
  PROMOTION_TYPE_LABEL,
  Promotion,
  PromotionPayload,
  formatDateRange,
  hasStarted,
  promotionStatus,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { PromotionPreview } from '../../components/promotion-preview/promotion-preview';
import { PromotionsStore } from '../../data/promotions.store';

/** Read-only view of one promotion (`/promotions/:id`). */
@Component({
  selector: 'app-promotion-detail',
  imports: [RouterLink, PageHeader, LoadingSpinner, PromotionPreview, MATERIAL],
  templateUrl: './promotion-detail.html',
  styleUrl: './promotion-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PromotionDetail implements OnInit {
  protected readonly store = inject(PromotionsStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);

  /** Bound from the `:id` route param. */
  readonly id = input.required<string>();

  protected readonly promotion = signal<Promotion | null>(null);
  protected readonly busy = signal(false);
  protected readonly typeLabel = PROMOTION_TYPE_LABEL;
  protected readonly typeIcon = PROMOTION_TYPE_ICON;

  protected readonly status = computed(() => {
    const p = this.promotion();
    if (!p) return null;
    const s = promotionStatus(p, this.store.today);
    return { label: PROMOTION_STATUS_LABEL[s], badge: PROMOTION_STATUS_BADGE[s] };
  });

  protected readonly started = computed(() => {
    const p = this.promotion();
    return !!p && hasStarted(p, this.store.today);
  });

  protected readonly period = computed(() => {
    const p = this.promotion();
    return p ? formatDateRange(p) : '';
  });

  ngOnInit(): void {
    this.store.load(); // SKU / category names + preview data
    this.store.getById(Number(this.id())).subscribe({
      next: (p) => this.promotion.set(p),
      error: () => void this.router.navigate(['/promotions']),
    });
  }

  protected payloadOf(p: Promotion): PromotionPayload {
    return p;
  }

  /** Switching on/off is allowed at any time (also after the start). */
  protected toggleEnabled(p: Promotion): void {
    this.busy.set(true);
    this.store.update(p.id, { ...this.withoutId(p), enabled: !p.enabled }).subscribe({
      next: (saved) => {
        this.promotion.set(saved);
        this.busy.set(false);
        this.notify.success(saved.enabled ? `เปิดใช้งาน ${saved.code}` : `ปิดใช้งาน ${saved.code}`);
      },
      error: () => this.busy.set(false),
    });
  }

  protected remove(p: Promotion): void {
    openConfirm(this.dialog, {
      title: 'ลบโปรโมชั่น',
      message: `ต้องการลบ ${p.code} - ${p.name} ใช่หรือไม่?`,
      confirmText: 'ลบ',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.remove(p.id)),
      )
      .subscribe(() => {
        this.notify.success(`ลบ ${p.code} เรียบร้อย`);
        void this.router.navigate(['/promotions']);
      });
  }

  private withoutId(p: Promotion): PromotionPayload {
    const copy: Partial<Promotion> = { ...p };
    delete copy.id;
    return copy as PromotionPayload;
  }
}
