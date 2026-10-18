import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { PlatformApi } from '../../data/platform-api.service';

/**
 * E-mails the platform would have sent (E41) — the mock sends none, so password reset links are
 * read (and opened) here. A real backend has no such page.
 */
@Component({
  selector: 'app-outbox',
  imports: [PageHeader, EmptyState, LoadingSpinner, ThaiDatePipe, MATERIAL],
  template: `
    <app-page-header
      title="อีเมลที่ส่ง (mock)"
      subtitle="ระบบจำลองไม่ส่งอีเมลจริง — ลิงก์อยู่ที่นี่"
    >
      <button mat-icon-button matTooltip="โหลดใหม่" (click)="data.reload()">
        <mat-icon>refresh</mat-icon>
      </button>
    </app-page-header>
    @if (data.isLoading() && !data.hasValue()) {
      <app-loading-spinner />
    } @else if (!mails().length) {
      <app-empty-state icon="mail" message="ยังไม่มีอีเมล" />
    } @else {
      @for (mail of mails(); track mail.id) {
        <mat-card appearance="outlined" class="mail">
          <mat-card-header>
            <mat-card-title>{{ mail.subject }}</mat-card-title>
            <mat-card-subtitle
              >ถึง {{ mail.to }} · {{ mail.at | thaiDate: 'datetime' }}</mat-card-subtitle
            >
          </mat-card-header>
          <mat-card-content>
            <a [href]="mail.body">{{ mail.body }}</a>
          </mat-card-content>
        </mat-card>
      }
    }
  `,
  styles: `
    .mail {
      margin-bottom: 12px;
    }
    a {
      word-break: break-all;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Outbox {
  private readonly api = inject(PlatformApi);
  protected readonly data = rxResource({ stream: () => this.api.outbox() });
  protected readonly mails = () => (this.data.hasValue() ? this.data.value() : []);
}
