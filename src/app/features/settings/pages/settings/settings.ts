import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { AuthService } from '@core/auth/auth.service';
import { ThemeService } from '@core/services/theme.service';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';

@Component({
  selector: 'app-settings',
  imports: [PageHeader, MatListModule, MATERIAL],
  template: `
    <app-page-header title="ตั้งค่า" />

    <mat-card appearance="outlined" class="section">
      <mat-card-header><mat-card-title>การแสดงผล</mat-card-title></mat-card-header>
      <mat-card-content>
        <mat-slide-toggle
          [checked]="theme.theme() === 'dark'"
          (change)="theme.theme.set($event.checked ? 'dark' : 'light')"
        >
          โหมดมืด
        </mat-slide-toggle>
      </mat-card-content>
    </mat-card>

    @if (auth.user(); as user) {
      <mat-card appearance="outlined" class="section">
        <mat-card-header><mat-card-title>โปรไฟล์</mat-card-title></mat-card-header>
        <mat-card-content>
          <mat-list>
            <mat-list-item>
              <span matListItemTitle>{{ user.name }}</span>
              <span matListItemLine>ชื่อ</span>
            </mat-list-item>
            <mat-list-item>
              <span matListItemTitle>{{ user.email }}</span>
              <span matListItemLine>อีเมล</span>
            </mat-list-item>
            <mat-list-item>
              <span matListItemTitle>{{ user.role }}</span>
              <span matListItemLine>สิทธิ์</span>
            </mat-list-item>
          </mat-list>
        </mat-card-content>
        <mat-card-actions>
          <button mat-stroked-button (click)="auth.logout()">
            <mat-icon>logout</mat-icon>
            ออกจากระบบ
          </button>
        </mat-card-actions>
      </mat-card>
    }
  `,
  styles: `
    .section {
      margin-bottom: 16px;
    }
    mat-card-content {
      padding-top: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Settings {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
}
