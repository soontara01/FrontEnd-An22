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
  promotionBranchScopeError,
  promotionStatus,
} from '@core/models';
import { AuthService } from '@core/auth/auth.service';
import { NotificationService } from '@core/services/notification.service';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { AdminOnlyNote } from '@shared/components/admin-only-note/admin-only-note';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { httpErrorShown } from '@core/http/http-error-shown';
import { PromotionPreview } from '../../components/promotion-preview/promotion-preview';
import { PromotionsStore } from '../../data/promotions.store';

/** Read-only view of one promotion (`/promotions/:id`). */
@Component({
  selector: 'app-promotion-detail',
  imports: [RouterLink, PageHeader, LoadingSpinner, AdminOnlyNote, PromotionPreview, MATERIAL],
  templateUrl: './promotion-detail.html',
  styleUrl: './promotion-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PromotionDetail implements OnInit {
  protected readonly store = inject(PromotionsStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);
  /** Only admins edit / enable / delete promotions (server → 403). */
  protected readonly isAdmin = this.auth.isAdmin;

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

  /** Why this admin may not change it ('' = may): a branch-limited one needs a company admin (D2). */
  protected readonly scopeBlocker = computed(() => {
    const p = this.promotion();
    return (p && promotionBranchScopeError(null, p, this.auth.isCompanyAdmin())) ?? '';
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
      .subscribe({
        next: () => {
          this.notify.success(`ลบ ${p.code} เรียบร้อย`);
          void this.router.navigate(['/promotions']);
        },
        error: httpErrorShown,
      });
  }

  private withoutId(p: Promotion): PromotionPayload {
    const copy: Partial<Promotion> = { ...p };
    delete copy.id;
    return copy as PromotionPayload;
  }
}
