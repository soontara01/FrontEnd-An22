import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MATERIAL } from '@shared/material';
import { PlatformAuth } from '../../data/platform-auth.service';

/** Toolbar + outlet of the platform pages (E36) — nothing of the shop's MainLayout. */
@Component({
  selector: 'app-platform-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MATERIAL],
  template: `
    <mat-toolbar class="toolbar">
      <mat-icon>admin_panel_settings</mat-icon>
      <span class="title">ผู้ให้บริการระบบ</span>
      <nav class="nav">
        <a mat-button routerLink="companies" routerLinkActive="active">บริษัทลูกค้า</a>
        <a mat-button routerLink="outbox" routerLinkActive="active">อีเมลที่ส่ง (mock)</a>
      </nav>
      <span class="spacer"></span>
      <span class="who">{{ auth.admin()?.name }}</span>
      <button mat-icon-button matTooltip="ออกจากระบบ" (click)="auth.logout()">
        <mat-icon>logout</mat-icon>
      </button>
    </mat-toolbar>
    <main class="content">
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
      background: var(--mat-sys-surface);
    }
    .toolbar {
      gap: 8px;
      background: var(--mat-sys-inverse-surface);
      color: var(--mat-sys-inverse-on-surface);
      flex-wrap: wrap;
      height: auto;
      min-height: 64px;
    }
    .title {
      font: var(--mat-sys-title-medium);
      margin-right: 16px;
    }
    .nav a,
    .toolbar button {
      color: inherit;
    }
    .nav a.active {
      text-decoration: underline;
    }
    .spacer {
      flex: 1;
    }
    .who {
      font: var(--mat-sys-body-medium);
    }
    .content {
      padding: 24px;
      @media (max-width: 599px) {
        padding: 16px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PlatformLayout {
  protected readonly auth = inject(PlatformAuth);
}
