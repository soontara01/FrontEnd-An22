import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import type { MfaSetup } from '@core/models/auth.model';
import { formatTotpSecret } from '@core/models/totp.model';
import { qrDataUrl } from '@shared/utils/qr';

/**
 * How to add this account to Microsoft Authenticator (E55): the QR code of `setup.otpauthUrl`, or
 * the secret typed by hand. The 6-digit code field belongs to the page that uses it.
 */
@Component({
  selector: 'app-mfa-setup',
  template: `
    <ol class="steps">
      <li>
        ติดตั้งแอป <strong>Microsoft Authenticator</strong> บนมือถือ (App Store / Google Play)
      </li>
      <li>
        ในแอปกด <strong>+</strong> → <strong>บัญชีอื่น (Google, Facebook ฯลฯ)</strong> แล้วสแกน QR
        นี้
      </li>
      <li>พิมพ์รหัส 6 หลักที่แอปแสดงลงในช่องด้านล่าง</li>
    </ol>
    <div class="qr">
      @if (qr(); as src) {
        <img [src]="src" width="200" height="200" alt="QR code สำหรับ Microsoft Authenticator" />
      } @else {
        <div class="placeholder" aria-hidden="true"></div>
      }
    </div>
    <p class="manual">
      สแกนไม่ได้? ในแอปเลือก "ใส่รหัสด้วยตนเอง" แล้วพิมพ์รหัสลับ
      <code class="secret">{{ secretText() }}</code>
    </p>
  `,
  styles: `
    :host {
      display: block;
    }
    .steps {
      margin: 0 0 12px;
      padding-left: 20px;
      line-height: 1.6;
    }
    .qr {
      display: flex;
      justify-content: center;
      margin-bottom: 8px;
    }
    img,
    .placeholder {
      width: 200px;
      height: 200px;
      background: #fff;
      border-radius: 8px;
    }
    .manual {
      margin: 0 0 16px;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }
    .secret {
      display: block;
      margin-top: 4px;
      font-size: 1rem;
      letter-spacing: 1px;
      color: var(--mat-sys-on-surface);
      user-select: all;
      word-break: break-all;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MfaSetupPanel {
  readonly setup = input.required<MfaSetup>();
  protected readonly qr = signal<string | null>(null);
  protected readonly secretText = () => formatTotpSecret(this.setup().secret);

  constructor() {
    effect(() => {
      const url = this.setup().otpauthUrl;
      this.qr.set(null);
      qrDataUrl(url).then(
        (src) => this.qr.set(src),
        () => this.qr.set(null),
      );
    });
  }
}
