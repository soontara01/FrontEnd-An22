import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import {
  PlatformCompanyRow,
  SUBSCRIPTION_STATUS_BADGE,
  SUBSCRIPTION_STATUS_LABEL,
  SUSPEND_REASON_LABEL,
  planOf,
} from '@core/models';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { PlatformApi } from '../../data/platform-api.service';

/** Every company on the platform (E36): package, billing status, usage, unpaid amount. */
@Component({
  selector: 'app-company-list',
  imports: [
    CurrencyPipe,
    RouterLink,
    MatTableModule,
    PageHeader,
    EmptyState,
    LoadingSpinner,
    ThaiDatePipe,
    MATERIAL,
  ],
  template: `
    <app-page-header title="บริษัทลูกค้า" [subtitle]="'ทั้งหมด ' + rows().length + ' บริษัท'">
      <button mat-icon-button matTooltip="โหลดใหม่" (click)="data.reload()">
        <mat-icon>refresh</mat-icon>
      </button>
    </app-page-header>

    <div class="filter-row">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>ค้นหา (รหัส / ชื่อ)</mat-label>
        <input matInput [value]="search()" (input)="search.set($any($event.target).value)" />
      </mat-form-field>
    </div>

    <mat-card appearance="outlined">
      @if (data.isLoading() && !data.hasValue()) {
        <app-loading-spinner />
      } @else if (!rows().length) {
        <app-empty-state icon="domain_disabled" message="ไม่พบบริษัท" />
      } @else {
        <div class="table-wrap">
          <table mat-table [dataSource]="rows()">
            <ng-container matColumnDef="code">
              <th mat-header-cell *matHeaderCellDef>รหัส</th>
              <td mat-cell *matCellDef="let c">
                <a class="mono" [routerLink]="[c.id]">{{ c.code }}</a>
              </td>
            </ng-container>
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>ชื่อ</th>
              <td mat-cell *matCellDef="let c">{{ c.name || '-' }}</td>
            </ng-container>
            <ng-container matColumnDef="plan">
              <th mat-header-cell *matHeaderCellDef>แพ็กเกจ</th>
              <td mat-cell *matCellDef="let c">{{ planName(c) }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>สถานะ</th>
              <td mat-cell *matCellDef="let c">
                <span [class]="'badge ' + badge(c)">{{ statusText(c) }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="usage">
              <th mat-header-cell *matHeaderCellDef>สาขา / ผู้ใช้ / เครื่อง</th>
              <td mat-cell *matCellDef="let c">
                {{ c.usage.branches }} / {{ c.usage.users }} / {{ c.usage.terminals }}
              </td>
            </ng-container>
            <ng-container matColumnDef="open">
              <th mat-header-cell *matHeaderCellDef class="num">ค้างชำระ</th>
              <td mat-cell *matCellDef="let c" class="num">
                {{
                  c.openAmount ? (c.openAmount | currency: 'THB' : 'symbol-narrow' : '1.0-0') : '-'
                }}
              </td>
            </ng-container>
            <ng-container matColumnDef="next">
              <th mat-header-cell *matHeaderCellDef>ใบถัดไป</th>
              <td mat-cell *matCellDef="let c">
                {{ c.deletedAt ? '-' : (c.subscription.nextInvoiceOn | thaiDate) }}
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
      }
    </mat-card>
  `,
  styles: `
    .table-wrap {
      overflow-x: auto;
    }
    .num {
      text-align: right;
    }
    .mono {
      font-family: ui-monospace, monospace;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CompanyList {
  private readonly api = inject(PlatformApi);
  protected readonly columns = ['code', 'name', 'plan', 'status', 'usage', 'open', 'next'];
  protected readonly search = signal('');
  protected readonly data = rxResource({ stream: () => this.api.companies() });
  protected readonly rows = computed(() => {
    const text = this.search().trim().toLowerCase();
    const all = this.data.hasValue() ? this.data.value() : [];
    return all.filter((c) => !text || `${c.code} ${c.name}`.toLowerCase().includes(text));
  });

  protected planName(c: PlatformCompanyRow): string {
    return planOf(c.planId).name;
  }

  protected statusText(c: PlatformCompanyRow): string {
    if (c.deletedAt) return 'ลบข้อมูลแล้ว';
    if (!c.active && c.suspendedReason) return `ระงับ: ${SUSPEND_REASON_LABEL[c.suspendedReason]}`;
    return SUBSCRIPTION_STATUS_LABEL[c.status];
  }

  protected badge(c: PlatformCompanyRow): string {
    if (c.deletedAt || !c.active) return 'badge-error';
    return SUBSCRIPTION_STATUS_BADGE[c.status];
  }
}
