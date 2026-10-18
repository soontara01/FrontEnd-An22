import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { ApiService } from '@core/http/api.service';
import { OnboardingCounts, User, hasAdminRights, onboardingSteps } from '@core/models';
import { StorageService } from '@core/services/storage.service';
import { PageHeader } from '@shared/components/page-header/page-header';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';

@Component({
  selector: 'app-dashboard',
  imports: [PageHeader, StatCard, MATERIAL],
  template: `
    <app-page-header [title]="'สวัสดี ' + (auth.user()?.name ?? '')" subtitle="ภาพรวมของระบบ" />

    <!-- Setup checklist of a new company (E37), until done or hidden on this device. -->
    @if (showOnboarding()) {
      <mat-card appearance="outlined" class="onboarding">
        <mat-card-header>
          <mat-card-title>เริ่มต้นใช้งาน</mat-card-title>
          <mat-card-subtitle
            >ทำครบแล้ว {{ doneCount() }} / {{ steps().length }} ขั้น</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          <ul class="steps">
            @for (step of steps(); track step.key) {
              <li [class.done]="step.done">
                <mat-icon>{{ step.done ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                @if (step.done) {
                  <span>{{ step.label }}</span>
                } @else {
                  <a [href]="step.href">{{ step.label }}</a>
                }
              </li>
            }
          </ul>
        </mat-card-content>
        <mat-card-actions>
          <button mat-button (click)="hideOnboarding()">ซ่อน</button>
        </mat-card-actions>
      </mat-card>
    }

    <!-- User stats come from GET /users: admin only (server → 403 for others). -->
    @if (auth.isAdmin()) {
      <section class="stat-grid">
        @for (card of stats(); track card.label) {
          <app-stat-card [label]="card.label" [value]="card.value" [icon]="card.icon" />
        }
      </section>

      <a mat-stroked-button href="/users">
        <mat-icon>group</mat-icon>
        จัดการผู้ใช้งาน
      </a>
    }
  `,
  styles: `
    .onboarding {
      margin-bottom: 24px;
    }
    .steps {
      list-style: none;
      padding: 0;
      margin: 0;
      li {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
      }
      li.done {
        color: var(--mat-sys-on-surface-variant);
      }
      li.done mat-icon {
        color: var(--mat-sys-primary);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Dashboard {
  protected readonly auth = inject(AuthService);
  private readonly storage = inject(StorageService);
  private readonly api = inject(ApiService);

  private readonly hiddenKey = `onboarding.hidden.${this.auth.company()?.id ?? 0}`;
  private readonly hidden = signal(!!this.storage.get<boolean>(this.hiddenKey));
  private readonly counts = toSignal(
    this.auth.isAdmin()
      ? this.api.get<OnboardingCounts>('company/onboarding').pipe(catchError(() => of(null)))
      : of(null),
    { initialValue: null },
  );
  protected readonly steps = computed(() => {
    const counts = this.counts();
    return counts ? onboardingSteps(counts) : [];
  });
  protected readonly doneCount = computed(() => this.steps().filter((s) => s.done).length);
  protected readonly showOnboarding = computed(
    () => !this.hidden() && this.steps().some((s) => !s.done),
  );

  protected hideOnboarding(): void {
    this.hidden.set(true);
    this.storage.set(this.hiddenKey, true);
  }

  // Uses the shared ApiService directly (no feature store needed for read-only stats).
  private readonly users = toSignal(
    this.auth.isAdmin() ? inject(ApiService).get<User[]>('users') : of([]),
    { initialValue: [] },
  );

  protected readonly stats = computed(() => {
    const users = this.users();
    return [
      { label: 'ผู้ใช้ทั้งหมด', value: users.length, icon: 'group' },
      { label: 'ใช้งานอยู่', value: users.filter((u) => u.active).length, icon: 'check_circle' },
      {
        label: 'ผู้ดูแลระบบ',
        value: users.filter((u) => hasAdminRights(u)).length,
        icon: 'shield_person',
      },
    ];
  });
}
