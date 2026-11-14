import { ChangeDetectionStrategy, Component, Injector, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { AuthService } from '@core/auth/auth.service';
import { ROLE_LABEL } from '@core/models';
import { ThemeService } from '@core/services/theme.service';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { MfaChangeDialog } from '../../dialogs/mfa-change-dialog';
import { StoreInfoForm } from '../../components/store-info-form/store-info-form';
import { ThisTerminal } from '../../components/this-terminal/this-terminal';

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
                  <span class="badge badge-success">ผูกแล้ว</span>
                } @else {
                  <span class="badge">ยังไม่ผูก — ผูกตอนเข้าสู่ระบบครั้งถัดไป</span>
                }
              </span>
              <span matListItemLine
                >Microsoft Authenticator — ใช้ทุกครั้งที่เข้าสู่ระบบ · เปลี่ยนเครื่องเองได้ด้านล่าง
                · ทำมือถือหาย ให้ผู้ดูแลระบบล้างให้</span
              >
            </mat-list-item>
          </mat-list>
        </mat-card-content>
        <mat-card-actions>
          @if (user.mfaEnabled) {
            <button mat-stroked-button (click)="changeMfaPhone()">
              <mat-icon>phonelink_setup</mat-icon>
              เปลี่ยนเครื่อง Authenticator
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
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);

  /** E58: the dialog needs the route's `SettingsApi`. */
  protected changeMfaPhone(): void {
    this.dialog.open(MfaChangeDialog, { injector: this.injector, width: '420px' });
  }
}
