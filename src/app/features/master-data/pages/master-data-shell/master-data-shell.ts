import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PageHeader } from '@shared/components/page-header/page-header';

interface MasterTab {
  label: string;
  icon: string;
  path: string;
}

/** Header + tab navigation for the master-data pages (tabs switch routes inside this menu). */
@Component({
  selector: 'app-master-data-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatTabsModule, MatIconModule, PageHeader],
  template: `
    <app-page-header title="ข้อมูลหลัก" subtitle="ข้อมูลที่ใช้ร่วมกันหลายเมนู" />

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
export default class MasterDataShell {
  protected readonly tabs: MasterTab[] = [
    { label: 'หมวดหมู่สินค้า', icon: 'account_tree', path: 'categories' },
    { label: 'ผู้จำหน่าย', icon: 'local_shipping', path: 'suppliers' },
  ];
}
