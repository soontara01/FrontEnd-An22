import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { RouterLink } from '@angular/router';
import { ADMIN_ONLY_MENUS, DEFAULT_USER_MENUS, MenuAccess, menuAccessError } from '@core/models';
import { MENU, MenuItem } from '@core/navigation/menu.config';
import { NotificationService } from '@core/services/notification.service';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { UsersApi } from '../../data/users-api.service';

/**
 * Which menus the `user` role sees (admins see all). Applies to every user from their next page
 * load. Hides menus and their routes only — data rights stay with the permission table.
 */
@Component({
  selector: 'app-menu-access',
  imports: [RouterLink, MatCheckboxModule, LoadingSpinner, PageHeader, MATERIAL],
  templateUrl: './menu-access.html',
  styles: `
    .note {
      margin: 0 0 16px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    th.role,
    td.role {
      width: 160px;
      text-align: center;
    }
    .menu {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .problem {
      margin-top: 12px;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class MenuAccessPage {
  private readonly api = inject(UsersApi);
  private readonly notify = inject(NotificationService);

  protected readonly menus = MENU;
  protected readonly adminOnly = ADMIN_ONLY_MENUS;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  /** Paths ticked for the `user` role */
  protected readonly ticked = signal<ReadonlySet<string>>(new Set());

  private readonly payload = computed<MenuAccess>(() => ({
    userMenus: MENU.map((m) => m.path).filter((p) => this.ticked().has(p)),
  }));
  protected readonly problem = computed(() =>
    menuAccessError(
      this.payload(),
      MENU.map((m) => m.path),
    ),
  );

  constructor() {
    this.api.menuAccess().subscribe({
      next: (access) => {
        this.ticked.set(new Set(access.userMenus));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected isTicked(item: MenuItem): boolean {
    return this.ticked().has(item.path);
  }

  protected toggle(item: MenuItem, on: boolean): void {
    this.ticked.update((set) => {
      const next = new Set(set);
      if (on) next.add(item.path);
      else next.delete(item.path);
      return next;
    });
  }

  protected resetDefaults(): void {
    this.ticked.set(new Set(DEFAULT_USER_MENUS));
  }

  protected save(): void {
    if (this.problem() || this.saving()) return;
    this.saving.set(true);
    this.api.saveMenuAccess(this.payload()).subscribe({
      next: (saved) => {
        this.ticked.set(new Set(saved.userMenus));
        this.saving.set(false);
        this.notify.success('บันทึกสิทธิ์เมนูแล้ว — มีผลเมื่อผู้ใช้เปิดหน้าใหม่');
      },
      error: () => this.saving.set(false),
    });
  }
}
