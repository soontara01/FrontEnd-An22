import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { Observable, catchError, concatMap, from, map, of } from 'rxjs';
import { PROMOTION_TYPE_LABEL } from '@core/models';
import { AuthService } from '@core/auth/auth.service';
import { NotificationService } from '@core/services/notification.service';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { saveBlob } from '@shared/utils/download';
import {
  PromotionImportRow,
  buildPromotionTemplate,
  readPromotionRows,
  validatePromotionRows,
} from '../../data/promotion-excel';
import { PromotionsStore } from '../../data/promotions.store';

type Step = 'pick' | 'preview' | 'saving' | 'done';

interface SaveResult {
  ok: boolean;
  message: string;
}

/** Import promotions from .xlsx: upload → validate preview → save valid rows one by one. */
@Component({
  selector: 'app-promotion-import',
  imports: [RouterLink, MatProgressBarModule, StatCard, MATERIAL],
  templateUrl: './promotion-import.html',
  styleUrl: './promotion-import.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PromotionImport {
  protected readonly store = inject(PromotionsStore);
  private readonly isCompanyAdmin = inject(AuthService).isCompanyAdmin;
  private readonly notify = inject(NotificationService);

  protected readonly step = signal<Step>('pick');
  protected readonly busy = signal(false);
  protected readonly fileName = signal('');
  protected readonly fileError = signal('');
  protected readonly rows = signal<PromotionImportRow[]>([]);
  protected readonly onlyErrors = signal(false);
  protected readonly results = signal<ReadonlyMap<number, SaveResult>>(new Map());

  private readonly count = (action: PromotionImportRow['action']) =>
    computed(() => this.rows().filter((r) => r.action === action).length);
  protected readonly createCount = this.count('create');
  protected readonly updateCount = this.count('update');
  protected readonly unchangedCount = this.count('unchanged');
  protected readonly errorCount = this.count('error');
  protected readonly validRows = computed(() =>
    this.rows().filter((r) => r.action === 'create' || r.action === 'update'),
  );
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
    this.store.load(); // promotions, SKUs, categories and branches for matching / validation
  }

  private excelContext() {
    return {
      products: this.store.products(),
      categories: this.store.categories(),
      branches: this.store.branches(),
    };
  }

  protected async downloadTemplate(): Promise<void> {
    this.busy.set(true);
    try {
      saveBlob(await buildPromotionTemplate(this.excelContext()), 'promotion-import-template.xlsx');
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
      const raw = await readPromotionRows(file);
      if (!raw.length) throw new Error('ไม่พบข้อมูลในไฟล์');
      this.rows.set(
        validatePromotionRows(raw, {
          ...this.excelContext(),
          promotions: this.store.promotions(),
          today: this.store.today,
          isCompanyAdmin: this.isCompanyAdmin(),
        }),
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

  /** Saves valid rows sequentially; a failing row doesn't stop the rest. */
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

  private saveRow(row: PromotionImportRow): Observable<[PromotionImportRow, SaveResult]> {
    const payload = row.payload!;
    const request$ = row.existingId
      ? this.store.update(row.existingId, payload)
      : this.store.create(payload);
    return request$.pipe(
      map((): [PromotionImportRow, SaveResult] => [row, { ok: true, message: '' }]),
      catchError((err: { error?: { message?: string } }) =>
        of<[PromotionImportRow, SaveResult]>([
          row,
          { ok: false, message: err.error?.message ?? 'บันทึกไม่สำเร็จ' },
        ]),
      ),
    );
  }

  protected typeText(row: PromotionImportRow): string {
    return row.type ? PROMOTION_TYPE_LABEL[row.type] : '-';
  }

  protected resultOf(row: PromotionImportRow): SaveResult | undefined {
    return this.results().get(row.rowNo);
  }
}
