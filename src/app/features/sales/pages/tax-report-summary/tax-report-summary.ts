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
import { forkJoin } from 'rxjs';
import { todayIso } from '@core/models';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { saveBlob } from '@shared/utils/download';
import { printElement } from '@shared/utils/print-element';
import { taxSummaryXlsx } from '../../data/sales-tax-excel';
import { TAX_SUMMARY_LABEL, buildTaxSummary } from '../../data/sales-tax-report';
import { SalesStore } from '../../data/sales.store';

/**
 * Sales tax of every branch for a month (`/sales/tax-report/summary?month=YYYY-MM`, company admins,
 * D6): one row per business place from `buildTaxSummary()` + the company total. A check only — the
 * report to file is per branch (`/sales/tax-report?branch=`), which each row links to.
 */
@Component({
  selector: 'app-tax-report-summary',
  imports: [DecimalPipe, RouterLink, PageHeader, LoadingSpinner, ThaiDatePipe, MATERIAL],
  templateUrl: './tax-report-summary.html',
  styleUrl: './tax-report-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class TaxReportSummary {
  protected readonly store = inject(SalesStore);
  private readonly router = inject(Router);

  /** Query param (withComponentInputBinding). */
  readonly month = input<string>();

  private readonly sheet = viewChild('sheet', { read: ElementRef<HTMLElement> });
  protected readonly label = TAX_SUMMARY_LABEL;
  protected readonly exporting = signal(false);
  protected readonly currentMonth = computed(() =>
    /^\d{4}-\d{2}$/.test(this.month() ?? '') ? this.month()! : todayIso().slice(0, 7),
  );
  protected readonly data = rxResource({
    params: () => this.currentMonth(),
    stream: ({ params }) =>
      forkJoin({ docs: this.store.taxReportData(params, 'all'), branches: this.store.branches() }),
  });
  protected readonly summary = computed(() => {
    if (!this.data.hasValue()) return null;
    const { docs, branches } = this.data.value();
    return buildTaxSummary(
      this.currentMonth(),
      branches,
      docs.sales,
      docs.invoices,
      docs.notes,
      branches[0]?.id ?? 0,
    );
  });

  constructor() {
    this.store.loadLookups();
  }

  protected setMonth(value: string): void {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    void this.router.navigate([], { queryParams: { month: value } });
  }

  protected print(): void {
    const el = this.sheet()?.nativeElement;
    if (el) printElement(el, 'A4');
  }

  protected async exportExcel(): Promise<void> {
    const summary = this.summary();
    if (!summary || this.exporting()) return;
    this.exporting.set(true);
    try {
      const blob = await taxSummaryXlsx(summary, this.store.storeInfo());
      saveBlob(blob, `sales-tax-summary-${summary.month}.xlsx`);
    } finally {
      this.exporting.set(false);
    }
  }
}
