import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PageHeader } from '@shared/components/page-header/page-header';

interface AccountTab {
  label: string;
  icon: string;
  path: string;
}

/** Header + tab navigation for the company account pages (tabs switch routes inside this menu). */
@Component({
  selector: 'app-account-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatTabsModule, MatIconModule, PageHeader],
  template: `
    <app-page-header title="บัญชีบริษัท" subtitle="การใช้งานระบบของบริษัท" />

    <nav mat-tab-nav-bar [tabPanel]="panel" class="tabs">
      @for (tab of tabs; track tab.path) {
        <a
          mat-tab-link
          [routerLink]="tab.path"
          routerLinkActive
          #rla="routerLinkActive"
          [active]="rla.isActive"
        >
          <mat-icon class="tab-icon">{{ tab.icon }}</mat-icon>
          {{ tab.label }}
        </a>
      }
    </nav>
    <mat-tab-nav-panel #panel>
      <router-outlet />
    </mat-tab-nav-panel>
  `,
  styles: `
    .tabs {
      margin-bottom: 24px;
    }
    .tab-icon {
      margin-right: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AccountShell {
  protected readonly tabs: AccountTab[] = [
    { label: 'แพ็กเกจ', icon: 'workspace_premium', path: 'subscription' },
    { label: 'ประวัติการใช้งาน', icon: 'history', path: 'audit-log' },
    { label: 'ข้อมูลบริษัท', icon: 'database', path: 'data' },
  ];
}
