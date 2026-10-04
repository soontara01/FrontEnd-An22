import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { catchError, concatMap, from, map, of } from 'rxjs';
import { NotificationService } from '@core/services/notification.service';
import { PageHeader } from '@shared/components/page-header/page-header';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { saveBlob } from '@shared/utils/download';
import {
  ImportRow,
  buildImportTemplate,
  readSkuRows,
  validateImportRows,
} from '../../data/sku-excel';
import { SkuStore } from '../../data/sku.store';

type Step = 'pick' | 'preview' | 'saving' | 'done';

interface SaveResult {
  ok: boolean;
  message: string;
}

/** Import SKUs from .xlsx: upload → validate preview → save valid rows one by one. */
@Component({
  selector: 'app-sku-import',
  imports: [RouterLink, MatProgressBarModule, PageHeader, StatCard, MATERIAL],
  templateUrl: './sku-import.html',
  styleUrl: './sku-import.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SkuImport {
  protected readonly store = inject(SkuStore);
  private readonly notify = inject(NotificationService);

  protected readonly step = signal<Step>('pick');
  protected readonly busy = signal(false);
  protected readonly fileName = signal('');
  protected readonly fileError = signal('');
  protected readonly rows = signal<ImportRow[]>([]);
  protected readonly onlyErrors = signal(false);
  protected readonly results = signal<ReadonlyMap<number, SaveResult>>(new Map());

  protected readonly createCount = computed(
    () => this.rows().filter((r) => r.action === 'create').length,
  );
  protected readonly updateCount = computed(
    () => this.rows().filter((r) => r.action === 'update').length,
  );
  protected readonly errorCount = computed(
    () => this.rows().filter((r) => r.action === 'error').length,
  );
  protected readonly validRows = computed(() => this.rows().filter((r) => r.payload));
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
    this.store.load(); // existing SKUs + categories for matching/validation
  }

  protected async downloadTemplate(): Promise<void> {
    this.busy.set(true);
    try {
      saveBlob(await buildImportTemplate(this.store.categories()), 'sku-import-template.xlsx');
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
      const raw = await readSkuRows(file);
      if (!raw.length) throw new Error('ไม่พบข้อมูลในไฟล์');
      this.rows.set(
        validateImportRows(raw, { skus: this.store.skus(), categories: this.store.categories() }),
      );
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

  /** Saves valid rows sequentially (create or update); a failing row doesn't stop the rest. */
  protected import(): void {
    const rows = this.validRows();
    if (!rows.length) return;
    this.step.set('saving');
    from(rows)
      .pipe(
        concatMap((row) => {
          const request$ =
            row.action === 'update' && row.existingId
              ? this.store.update(row.existingId, row.payload!)
              : this.store.create(row.payload!);
          return request$.pipe(
            map((): [ImportRow, SaveResult] => [row, { ok: true, message: '' }]),
            catchError((err: { error?: { message?: string } }) =>
              of<[ImportRow, SaveResult]>([
                row,
                { ok: false, message: err.error?.message ?? 'บันทึกไม่สำเร็จ' },
              ]),
            ),
          );
        }),
      )
      .subscribe({
        next: ([row, result]) => this.results.update((m) => new Map(m).set(row.rowNo, result)),
        complete: () => {
          this.step.set('done');
          this.store.load(true);
          this.notify.success(`นำเข้าสำเร็จ ${this.savedCount()} รายการ`);
        },
      });
  }

  protected resultOf(row: ImportRow): SaveResult | undefined {
    return this.results().get(row.rowNo);
  }
}
