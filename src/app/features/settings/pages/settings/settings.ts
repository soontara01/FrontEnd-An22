import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { AuthService } from '@core/auth/auth.service';
import { httpErrorShown } from '@core/http/http-error-shown';
import { CompanyInfo, ROLE_LABEL, mfaRequiredFor } from '@core/models';
import { ThemeService } from '@core/services/theme.service';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { StoreInfoForm } from '../../components/store-info-form/store-info-form';
import { ThisTerminal } from '../../components/this-terminal/this-terminal';
import { SettingsApi } from '../../data/settings-api.service';
import { MfaDisableDialog } from '../../dialogs/mfa-disable-dialog';
import { MfaSetupDialog } from '../../dialogs/mfa-setup-dialog';

@Component({
  selector: 'app-settings',
  imports: [PageHeader, MatListModule, StoreInfoForm, ThisTerminal, MATERIAL],
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

    <mat-card appearance="outlined" class="section">
      <mat-card-header>
        <mat-card-title>เครื่องนี้ (เครื่อง POS)</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <app-this-terminal [editable]="auth.isAdmin()" />
      </mat-card-content>
    </mat-card>

    <mat-card appearance="outlined" class="section">
      <mat-card-header>
        <mat-card-title>ข้อมูลร้าน (หัว/ท้ายใบเสร็จ)</mat-card-title>
        <mat-card-subtitle
          >{{ auth.company()?.name }} · {{ auth.currentBranch()?.name }}</mat-card-subtitle
        >
      </mat-card-header>
      <mat-card-content>
        <app-store-info-form
          [companyEditable]="auth.isCompanyAdmin()"
          [branchEditable]="auth.isAdmin()"
        />
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
              <span matListItemTitle>{{ user.username }}</span>
              <span matListItemLine>ชื่อผู้ใช้</span>
            </mat-list-item>
            @if (user.email) {
              <mat-list-item>
                <span matListItemTitle>{{ user.email }}</span>
                <span matListItemLine>อีเมล</span>
              </mat-list-item>
            }
            <mat-list-item>
              <span matListItemTitle>{{ roleLabel[user.role] }}</span>
              <span matListItemLine>สิทธิ์</span>
            </mat-list-item>
            <mat-list-item>
              <mat-icon matListItemIcon>phonelink_lock</mat-icon>
              <span matListItemTitle>
                @if (user.mfaEnabled) {
                  <span class="badge badge-success">เปิดใช้อยู่</span>
                } @else {
                  <span class="badge">ยังไม่เปิด</span>
                }
                @if (mfaRequired()) {
                  <span class="text-muted small"> · บริษัทบังคับใช้</span>
                }
              </span>
              <span matListItemLine>Microsoft Authenticator (ยืนยันตัวตนสองขั้น)</span>
            </mat-list-item>
          </mat-list>
        </mat-card-content>
        <mat-card-actions>
          @if (user.mfaEnabled) {
            @if (!mfaRequired()) {
              <button mat-stroked-button (click)="disableMfa()">
                <mat-icon>phonelink_erase</mat-icon>
                ปิด Authenticator
              </button>
            }
          } @else {
            <button mat-stroked-button (click)="enableMfa()">
              <mat-icon>phonelink_lock</mat-icon>
              เปิดใช้ Microsoft Authenticator
            </button>
          }
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
    mat-card-actions {
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Settings {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly roleLabel = ROLE_LABEL;
  private readonly api = inject(SettingsApi);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly companyInfo = signal<CompanyInfo | null>(null);
  /** The company makes this user use Authenticator (E55): it cannot be turned off here. */
  protected readonly mfaRequired = computed(() => {
    const user = this.auth.user();
    const info = this.companyInfo();
    return !!user && !!info && mfaRequiredFor(user, info);
  });

  constructor() {
    this.api
      .companyInfo()
      .subscribe({ next: (i) => this.companyInfo.set(i), error: httpErrorShown });
  }

  protected enableMfa(): void {
    this.openMfa(MfaSetupDialog);
  }

  protected disableMfa(): void {
    this.openMfa(MfaDisableDialog);
  }

  /** Dialogs use the route's `SettingsApi`; the session is read again once it changed. */
  private openMfa(component: typeof MfaSetupDialog | typeof MfaDisableDialog): void {
    this.dialog
      .open<unknown, unknown, boolean>(component, { width: '440px', injector: this.injector })
      .afterClosed()
      .subscribe((changed) => {
        if (changed) this.auth.refresh().subscribe({ error: httpErrorShown });
      });
  }
}
