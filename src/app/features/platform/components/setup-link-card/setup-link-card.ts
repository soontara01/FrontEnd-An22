import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  inject,
  input,
} from '@angular/core';
import { SETUP_LINK_HOURS, SetupLink } from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';

/**
 * The owner's setup link (E59) as the platform admin passes it on (LINE / SMS / e-mail): the full
 * URL on this site + copy button. Shown once — the api keeps only a hash of the token.
 */
@Component({
  selector: 'app-setup-link-card',
  imports: [ThaiDatePipe, MATERIAL],
  template: `
    <div class="link">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>ลิงก์ตั้งรหัสผ่านของเจ้าของ</mat-label>
        <input #field matInput readonly [value]="url()" (focus)="field.select()" />
      </mat-form-field>
      <button mat-flat-button type="button" (click)="copy(field)">
        <mat-icon>content_copy</mat-icon>
        คัดลอก
      </button>
    </div>
    <p class="text-muted small">
      ใช้ได้ครั้งเดียว ภายใน {{ hours }} ชั่วโมง (ถึง {{ link().expiresAt | thaiDate: 'datetime' }})
      — ส่งให้เจ้าของเท่านั้น ลิงก์นี้แสดงครั้งเดียว ถ้าหายให้ออกลิงก์ใหม่ (ลิงก์เดิมจะใช้ไม่ได้)
    </p>
  `,
  styles: `
    .link {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    mat-form-field {
      flex: 1;
      min-width: 0;
    }
    input {
      font-family: ui-monospace, monospace;
    }
    p {
      margin: 8px 0 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupLinkCard {
  private readonly document = inject(DOCUMENT);
  private readonly notify = inject(NotificationService);

  readonly link = input.required<SetupLink>();
  protected readonly hours = SETUP_LINK_HOURS;
  /** The api answers a path; this site's origin makes it a link the owner can open. */
  protected readonly url = computed(() => `${this.document.location.origin}${this.link().path}`);

  protected copy(input: HTMLInputElement): void {
    const fallback = () => {
      input.select();
      this.notify.error('คัดลอกอัตโนมัติไม่ได้ — กด Ctrl+C เพื่อคัดลอกลิงก์ที่เลือกไว้');
    };
    // No clipboard API outside a secure context (plain http on a LAN address).
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (!clipboard) return fallback();
    clipboard.writeText(this.url()).then(
      () => this.notify.success('คัดลอกลิงก์แล้ว'),
      () => fallback(),
    );
  }
}
