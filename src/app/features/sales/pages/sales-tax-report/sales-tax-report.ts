import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { branchLabel, placeName, todayIso } from '@core/models';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { saveBlob } from '@shared/utils/download';
import { printElement } from '@shared/utils/print-element';
import { salesTaxReportXlsx } from '../../data/sales-tax-excel';
import { TaxReportRow, buildSalesTaxReport } from '../../data/sales-tax-report';
import { SalesStore } from '../../data/sales.store';

const KIND_LABEL: Record<TaxReportRow['kind'], string> = {
  abbreviated: 'อย่างย่อ',
  full: 'เต็มรูป',
  replacement: 'เต็มรูป (ออกแทน)',
  credit: 'ใบลดหนี้',
};

/**
 * Monthly sales tax report (`/sales/tax-report?month=YYYY-MM`, default this month):
 * `buildSalesTaxReport()` rows, printable on landscape A4 and exportable to Excel.
 */
@Component({
  selector: 'app-sales-tax-report',
  imports: [DecimalPipe, RouterLink, PageHeader, LoadingSpinner, ThaiDatePipe, MATERIAL],
  templateUrl: './sales-tax-report.html',
  styleUrl: './sales-tax-report.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SalesTaxReportPage {
  protected readonly store = inject(SalesStore);
  private readonly router = inject(Router);

  /** Query param (withComponentInputBinding). */
  readonly month = input<string>();

  private readonly sheet = viewChild('sheet', { read: ElementRef<HTMLElement> });
  protected readonly exporting = signal(false);

  protected readonly currentMonth = computed(() =>
    /^\d{4}-\d{2}$/.test(this.month() ?? '') ? this.month()! : todayIso().slice(0, 7),
  );
  protected readonly data = rxResource({
    params: () => this.currentMonth(),
    stream: ({ params }) => this.store.taxReportData(params),
  });
  protected readonly report = computed(() => {
    if (!this.data.hasValue()) return null;
    const { sales, invoices, notes } = this.data.value();
    return buildSalesTaxReport(this.currentMonth(), sales, invoices, notes);
  });
  protected readonly sellerBranch = computed(() => {
    const info = this.store.storeInfo();
    return info ? branchLabel(info) : '';
  });
  protected readonly sellerPlace = computed(() => {
    const info = this.store.storeInfo();
    return info ? placeName(info) : '';
  });

  constructor() {
    this.store.loadLookups();
  }

  protected kindText(row: TaxReportRow): string {
    return KIND_LABEL[row.kind];
  }

  protected setMonth(value: string): void {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    void this.router.navigate([], { queryParams: { month: value } });
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
      const blob = await salesTaxReportXlsx(report, this.store.storeInfo());
      saveBlob(blob, `sales-tax-${report.month}.xlsx`);
    } finally {
      this.exporting.set(false);
    }
  }
}
