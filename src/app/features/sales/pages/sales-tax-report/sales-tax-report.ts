import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { BranchScope, branchLabel, placeName, todayIso } from '@core/models';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { saveBlob } from '@shared/utils/download';
import { printElement } from '@shared/utils/print-element';
import { salesTaxReportXlsx } from '../../data/sales-tax-excel';
import { TaxReportRow, buildSalesTaxReport, nonVatNote } from '../../data/sales-tax-report';
import { SalesStore } from '../../data/sales.store';
import { BranchScopeSelect } from '../../components/branch-scope-select';

const KIND_LABEL: Record<TaxReportRow['kind'], string> = {
  abbreviated: 'อย่างย่อ',
  full: 'เต็มรูป',
  replacement: 'เต็มรูป (ออกแทน)',
  credit: 'ใบลดหนี้',
};

/**
 * Monthly sales tax report of one business place (`/sales/tax-report?month=YYYY-MM&branch=<id>`,
 * default this month and the working branch, D6 / E23): `buildSalesTaxReport()` rows of that
 * branch, headed with its details, printable on landscape A4 and exportable to Excel.
 */
@Component({
  selector: 'app-sales-tax-report',
  imports: [
    BranchScopeSelect,
    DecimalPipe,
    RouterLink,
    PageHeader,
    LoadingSpinner,
    ThaiDatePipe,
    MATERIAL,
  ],
  templateUrl: './sales-tax-report.html',
  styleUrl: './sales-tax-report.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SalesTaxReportPage {
  protected readonly store = inject(SalesStore);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  /** The summary of every branch is for company admins (D6). */
  protected readonly isCompanyAdmin = this.auth.isCompanyAdmin;

  /** Query params (withComponentInputBinding). */
  readonly month = input<string>();
  /** One branch at a time — a filed report is per business place (D6) */
  readonly branch = input<string>();
  protected readonly branchId = computed(
    () => Number(this.branch()) || this.auth.currentBranch()?.id || 0,
  );
  /** Seller details of that branch (heading, Excel) */
  protected readonly info = computed(() => this.store.storeInfoFor(this.branchId()));

  private readonly sheet = viewChild('sheet', { read: ElementRef<HTMLElement> });
  protected readonly exporting = signal(false);
  protected readonly nonVatNote = nonVatNote;

  protected readonly currentMonth = computed(() =>
    /^\d{4}-\d{2}$/.test(this.month() ?? '') ? this.month()! : todayIso().slice(0, 7),
  );
  protected readonly data = rxResource({
    params: () => ({ month: this.currentMonth(), branchId: this.branchId() }),
    stream: ({ params }) => this.store.taxReportData(params.month, params.branchId),
  });
  protected readonly report = computed(() => {
    if (!this.data.hasValue()) return null;
    const { sales, invoices, notes } = this.data.value();
    return buildSalesTaxReport(this.currentMonth(), sales, invoices, notes);
  });
  protected readonly sellerBranch = computed(() => {
    const info = this.info();
    return info ? branchLabel(info) : '';
  });
  protected readonly sellerPlace = computed(() => {
    const info = this.info();
    return info ? placeName(info) : '';
  });

  constructor() {
    this.store.loadLookups();
    effect(() => this.store.loadBranchInfo(this.branchId()));
  }

  protected selectBranch(scope: BranchScope): void {
    void this.router.navigate([], {
      queryParams: { branch: scope === this.auth.currentBranch()?.id ? null : scope },
      queryParamsHandling: 'merge',
    });
  }

  protected kindText(row: TaxReportRow): string {
    return KIND_LABEL[row.kind];
  }

  protected setMonth(value: string): void {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    void this.router.navigate([], { queryParams: { month: value }, queryParamsHandling: 'merge' });
  }

  protected print(): void {
    const el = this.sheet()?.nativeElement;
    if (el) printElement(el, 'A4-landscape');
  }

  protected async exportExcel(): Promise<void> {
    const report = this.report();
    if (!report || this.exporting()) return;
    this.exporting.set(true);
    try {
      const blob = await salesTaxReportXlsx(report, this.info());
      const code = this.auth.branches().find((b) => b.id === this.branchId())?.code;
      saveBlob(blob, `sales-tax-${code ? `${code}-` : ''}${report.month}.xlsx`);
    } finally {
      this.exporting.set(false);
    }
  }
}
