import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '@core/auth/auth.service';
import { ApiService } from '@core/http/api.service';
import { User } from '@core/models';
import { PageHeader } from '@shared/components/page-header/page-header';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';

@Component({
  selector: 'app-dashboard',
  imports: [PageHeader, StatCard, MATERIAL],
  template: `
    <app-page-header [title]="'สวัสดี ' + (auth.user()?.name ?? '')" subtitle="ภาพรวมของระบบ" />

    <section class="stat-grid">
      @for (card of stats(); track card.label) {
        <app-stat-card [label]="card.label" [value]="card.value" [icon]="card.icon" />
      }
    </section>

    <a mat-stroked-button href="/users">
      <mat-icon>group</mat-icon>
      จัดการผู้ใช้งาน
    </a>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Dashboard {
  protected readonly auth = inject(AuthService);

  // Uses the shared ApiService directly (no feature store needed for read-only stats).
  private readonly users = toSignal(inject(ApiService).get<User[]>('users'), { initialValue: [] });

  protected readonly stats = computed(() => {
    const users = this.users();
    return [
      { label: 'ผู้ใช้ทั้งหมด', value: users.length, icon: 'group' },
      { label: 'ใช้งานอยู่', value: users.filter((u) => u.active).length, icon: 'check_circle' },
      {
        label: 'ผู้ดูแลระบบ',
        value: users.filter((u) => u.role === 'admin').length,
        icon: 'shield_person',
      },
    ];
  });
}
