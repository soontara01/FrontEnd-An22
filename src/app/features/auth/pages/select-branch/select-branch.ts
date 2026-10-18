import { ChangeDetectionStrategy, Component, DOCUMENT, inject, signal } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '@core/auth/auth.service';
import { MATERIAL } from '@shared/material';

/**
 * Which branch this device works in (saas-plan section 8): after login when the user may work in
 * several branches and none is remembered, or when the remembered one is no longer allowed.
 * Choosing reloads into the app (`X-Branch-Id` from then on).
 */
@Component({
  selector: 'app-select-branch',
  imports: [MatListModule, MatProgressBarModule, MATERIAL],
  template: `
    <mat-card class="card" appearance="outlined">
      <mat-card-header>
        <mat-card-title>เลือกสาขา</mat-card-title>
        <mat-card-subtitle>{{ auth.company()?.name }} · {{ auth.user()?.name }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <mat-action-list>
          @for (b of auth.branches(); track b.id) {
            <button mat-list-item (click)="choose(b.id)">
              <mat-icon matListItemIcon>store</mat-icon>
              <span matListItemTitle>{{ b.name }}</span>
              <span matListItemLine>{{ b.code }} · เลขที่สาขา {{ b.branchNo }}</span>
            </button>
          } @empty {
            @if (!loading()) {
              <p class="text-muted">บัญชีนี้ยังไม่มีสาขาที่เข้าได้ กรุณาติดต่อผู้ดูแลระบบ</p>
            }
          }
        </mat-action-list>
      </mat-card-content>
      <mat-card-actions>
        <button mat-button (click)="auth.logout()">
          <mat-icon>logout</mat-icon>
          ออกจากระบบ
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .card {
      width: min(440px, 100%);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SelectBranch {
  protected readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  protected readonly loading = signal(true);

  constructor() {
    // Fresh list: rights may have changed since login.
    this.auth.refresh().subscribe({
      next: () => this.loading.set(false),
      error: () => this.loading.set(false),
    });
  }

  protected choose(id: number): void {
    this.auth.selectBranch(id);
    // Full page reload into the main app (SPA per menu)
    this.document.location.assign('/');
  }
}
