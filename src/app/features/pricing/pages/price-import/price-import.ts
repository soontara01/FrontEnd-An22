import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { Observable, catchError, concat, from, concatMap, last, map, of } from 'rxjs';
import { formatDateRange } from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { saveBlob } from '@shared/utils/download';
import {
  PriceImportRow,
  buildPriceTemplate,
  readPriceRows,
  saveOrder,
  validatePriceRows,
} from '../../data/price-excel';
import { PricingStore } from '../../data/pricing.store';

type Step = 'pick' | 'preview' | 'saving' | 'done';

interface SaveResult {
  ok: boolean;
  message: string;
}

/** Import price periods from .xlsx: upload → validate preview → save valid rows one by one. */
@Component({
  selector: 'app-price-import',
  imports: [RouterLink, CurrencyPipe, MatProgressBarModule, StatCard, MATERIAL],
  templateUrl: './price-import.html',
  styleUrl: './price-import.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PriceImport {
  protected readonly store = inject(PricingStore);
  private readonly notify = inject(NotificationService);

  protected readonly step = signal<Step>('pick');
  protected readonly busy = signal(false);
  protected readonly fileName = signal('');
  protected readonly fileError = signal('');
  protected readonly rows = signal<PriceImportRow[]>([]);
  protected readonly onlyErrors = signal(false);
  protected readonly results = signal<ReadonlyMap<number, SaveResult>>(new Map());

  private readonly count = (action: PriceImportRow['action']) =>
    computed(() => this.rows().filter((r) => r.action === action).length);
  protected readonly createCount = this.count('create');
  protected readonly updateCount = this.count('update');
  protected readonly unchangedCount = this.count('unchanged');
  protected readonly errorCount = this.count('error');
  protected readonly validRows = computed(() => saveOrder(this.rows()));
  protected readonly visibleRows = computed(() =>
    this.onlyErrors() ? this.rows().filter((r) => r.action === 'error') : this.rows(),
  );
  protected readonly savedCount = computed(
    () => [...this.results().values()].filter((r) => r.ok).length,
  );
  protected readonly failedCount = computed(
    () => [...this.results().values()].filter((r) => !r.ok).length,
  );
  protected readonly progress = computed(() => {
    const total = this.validRows().length;
    return total ? (this.results().size / total) * 100 : 0;
  });

  constructor() {
    this.store.load(); // SKUs + every price period for matching / overlap checks
  }

  protected async downloadTemplate(): Promise<void> {
    this.busy.set(true);
    try {
      saveBlob(await buildPriceTemplate(this.store.products()), 'price-import-template.xlsx');
    } finally {
      this.busy.set(false);
    }
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.fileError.set('');
    this.busy.set(true);
    try {
      const raw = await readPriceRows(file);
      if (!raw.length) throw new Error('ไม่พบข้อมูลในไฟล์');
      this.rows.set(validatePriceRows(raw, this.store.products(), this.store.prices()));
      this.fileName.set(file.name);
      this.results.set(new Map());
      this.onlyErrors.set(this.errorCount() > 0);
      this.step.set('preview');
    } catch (e) {
      this.fileError.set(e instanceof Error ? e.message : 'อ่านไฟล์ไม่สำเร็จ (ต้องเป็น .xlsx)');
    } finally {
      this.busy.set(false);
    }
  }

  protected reset(): void {
    this.rows.set([]);
    this.results.set(new Map());
    this.fileName.set('');
    this.step.set('pick');
  }

  /** Saves valid rows sequentially, earlier periods first; a failing row doesn't stop the rest. */
  protected import(): void {
    const rows = this.validRows();
    if (!rows.length) return;
    this.step.set('saving');
    from(rows)
      .pipe(concatMap((row) => this.saveRow(row)))
      .subscribe({
        next: ([row, result]) => this.results.update((m) => new Map(m).set(row.rowNo, result)),
        complete: () => {
          this.step.set('done');
          this.store.load(true);
          this.notify.success(`นำเข้าสำเร็จ ${this.savedCount()} รายการ`);
        },
      });
  }

  /** Ends the periods in the way first, then saves the row's own period. */
  private saveRow(row: PriceImportRow): Observable<[PriceImportRow, SaveResult]> {
    const payload = row.payload!;
    const own$ = row.existingId
      ? this.store.update(row.existingId, payload)
      : this.store.create(payload);
    return concat(...row.closes.map((c) => this.store.update(c.id, c.payload)), own$).pipe(
      last(),
      map((): [PriceImportRow, SaveResult] => [row, { ok: true, message: '' }]),
      catchError((err: { error?: { message?: string } }) =>
        of<[PriceImportRow, SaveResult]>([
          row,
          { ok: false, message: err.error?.message ?? 'บันทึกไม่สำเร็จ' },
        ]),
      ),
    );
  }

  protected range(row: PriceImportRow): string {
    return row.payload ? formatDateRange(row.payload) : '-';
  }

  protected resultOf(row: PriceImportRow): SaveResult | undefined {
    return this.results().get(row.rowNo);
  }
}
