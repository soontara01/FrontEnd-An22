import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from '../http/api.service';
import { httpErrorShown } from '../http/http-error-shown';
import { LimitKind, PlanId, planLimitError, planOf } from '../models/plan.model';
import type { SubscriptionInfo } from '../models/subscription.model';

/**
 * The company's package and usage (E34) for admin screens: loaded once per page load; add buttons
 * of branches / users / POS terminals ask `limitProblem()` (the server answers 403 anyway). Used
 * only by lazy features, so it stays out of the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly api = inject(ApiService);

  private readonly _info = signal<SubscriptionInfo | null>(null);
  private loading = false;

  readonly info = this._info.asReadonly();
  readonly plan = computed(() => planOf(this._info()?.planId));

  /** Loads once (admins only — the endpoint answers 403 to others); `force` to refresh. */
  load(force = false): void {
    if ((this._info() || this.loading) && !force) return;
    this.loading = true;
    this.api.get<SubscriptionInfo>('company/subscription').subscribe({
      next: (info) => {
        this._info.set(info);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        httpErrorShown();
      },
    });
  }

  /**
   * Why one more active record of this kind is refused ('' = fits / not loaded yet). `active` = the
   * page's own count of active records, so it stays right after adding / turning one off.
   */
  limitProblem(kind: LimitKind, active: number): string {
    const info = this._info();
    if (!info) return '';
    return planLimitError(kind, planOf(info.planId), { ...info.usage, [kind]: active }) ?? '';
  }

  /** The owner changes the package (E34; a downgrade only stops adding). */
  changePlan(planId: PlanId): Observable<SubscriptionInfo> {
    return this.api
      .put<SubscriptionInfo>('company/plan', { planId })
      .pipe(tap((info) => this._info.set(info)));
  }
}
