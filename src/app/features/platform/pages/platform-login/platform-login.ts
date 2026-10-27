import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { environment } from '@env/environment';
import { MATERIAL } from '@shared/material';
import { PlatformAuth } from '../../data/platform-auth.service';

/** Login of the SaaS operator (E36): no company code — platform admins belong to no company. */
@Component({
  selector: 'app-platform-login',
  imports: [ReactiveFormsModule, AutofocusDirective, MATERIAL],
  template: `
    <main class="page">
      <mat-card class="card" appearance="outlined">
        <mat-card-header>
          <mat-card-title>ผู้ให้บริการระบบ</mat-card-title>
          <mat-card-subtitle>
            สำหรับผู้ดูแลแพลตฟอร์มเท่านั้น
            @if (demo) {
              (ทดลอง: platform / platform)
            }
          </mat-card-subtitle>
        </mat-card-header>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-card-content>
            @if (expired()) {
              <p class="expired" role="alert">เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่</p>
            }
            <mat-form-field appearance="outline">
              <mat-label>ชื่อผู้ใช้</mat-label>
              <input matInput appAutofocus formControlName="username" autocomplete="username" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>รหัสผ่าน</mat-label>
              <input
                matInput
                type="password"
                formControlName="password"
                autocomplete="current-password"
              />
            </mat-form-field>
          </mat-card-content>
          <mat-card-actions>
            <button mat-flat-button type="submit" [disabled]="submitting()">เข้าสู่ระบบ</button>
          </mat-card-actions>
        </form>
      </mat-card>
    </main>
  `,
  styles: `
    .page {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 16px;
      background: var(--mat-sys-surface-container);
    }
    .card {
      width: min(400px, 100%);
    }
    mat-card-content {
      display: flex;
      flex-direction: column;
      padding-top: 16px;
    }
    mat-card-actions button {
      width: 100%;
    }
    .expired {
      margin: 0 0 16px;
      color: var(--mat-sys-error);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PlatformLogin {
  private readonly auth = inject(PlatformAuth);
  private readonly router = inject(Router);
  /** The seed login is hinted only on the mock (C3-2). */
  protected readonly demo = environment.useMock;
  /** `?expired=1`: the platform session ended (401, C3-6). */
  readonly expired = input<string>();
  protected readonly submitting = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { username, password } = this.form.getRawValue();
    this.auth.login(username, password).subscribe({
      next: () => void this.router.navigateByUrl('/platform/companies'),
      error: () => this.submitting.set(false),
    });
  }
}
