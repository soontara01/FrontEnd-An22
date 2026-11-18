import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '@core/http/api.service';
import { passwordError } from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';

/**
 * The owner sets a password from a single-use link `/auth/reset-password?token=`: a reset link
 * e-mailed after "ลืมรหัสผ่าน" (E41), or the first password of a company the platform created —
 * the setup link the platform passed on (E59). Same page and endpoint for both.
 */
@Component({
  selector: 'app-reset-password',
  imports: [RouterLink, AutofocusDirective, MATERIAL],
  template: `
    <mat-card class="card" appearance="outlined">
      <mat-card-header>
        <mat-card-title>ตั้งรหัสผ่าน</mat-card-title>
        <mat-card-subtitle>เจ้าของบริษัท — ลิงก์นี้ใช้ได้ครั้งเดียว</mat-card-subtitle>
      </mat-card-header>
      @if (done()) {
        <mat-card-content>
          <p role="status">
            ตั้งรหัสผ่านเรียบร้อย — เข้าสู่ระบบด้วยรหัสบริษัท ชื่อผู้ใช้ และรหัสผ่านนี้
            (ครั้งแรกจะให้สแกน QR ด้วย Microsoft Authenticator)
          </p>
        </mat-card-content>
        <mat-card-actions>
          <a mat-flat-button routerLink="/auth/login">เข้าสู่ระบบ</a>
        </mat-card-actions>
      } @else {
        <mat-card-content>
          <mat-form-field appearance="outline">
            <mat-label>รหัสผ่าน</mat-label>
            <input
              matInput
              appAutofocus
              type="password"
              autocomplete="new-password"
              [value]="password()"
              (input)="password.set($any($event.target).value)"
              (keydown.enter)="save()"
            />
            @if (touched() && problem(); as p) {
              <mat-hint class="field-error">{{ p }}</mat-hint>
            } @else {
              <mat-hint>อย่างน้อย 4 ตัว</mat-hint>
            }
          </mat-form-field>
        </mat-card-content>
        <mat-card-actions>
          <button mat-flat-button [disabled]="saving()" (click)="save()">บันทึกรหัสผ่าน</button>
          <a mat-button routerLink="/auth/forgot-password">ขอลิงก์ใหม่</a>
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    .card {
      width: min(400px, 100%);
    }
    mat-card-content {
      display: flex;
      flex-direction: column;
      padding-top: 16px;
    }
    mat-card-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      button,
      a {
        width: 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ResetPassword {
  private readonly api = inject(ApiService);
  /** `?token=` (withComponentInputBinding) */
  readonly token = input<string>();

  protected readonly password = signal('');
  protected readonly touched = signal(false);
  protected readonly saving = signal(false);
  protected readonly done = signal(false);
  protected readonly problem = computed(() => passwordError(this.password()));

  protected save(): void {
    this.touched.set(true);
    if (this.problem() || this.saving()) return;
    this.saving.set(true);
    this.api
      .post('auth/reset-password', { token: this.token() ?? '', password: this.password() })
      .subscribe({
        next: () => this.done.set(true),
        error: () => this.saving.set(false),
      });
  }
}
