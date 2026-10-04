import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { Observable, catchError, concatMap, firstValueFrom, forkJoin, from, map, of } from 'rxjs';
import { Product } from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { PageHeader } from '@shared/components/page-header/page-header';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { saveBlob } from '@shared/utils/download';
import { InventoryStore } from '../../data/inventory.store';
import {
  ReceiveGroup,
  ReceiveLine,
  buildReceiveTemplate,
  groupReceiveLines,
  readReceiveRows,
  validateReceiveRows,
} from '../../data/receive-excel';

type Step = 'pick' | 'preview' | 'saving' | 'done';

interface SaveResult {
  ok: boolean;
  message: string;
}

/**
 * Goods receipt from Excel (`/inventory/receive-import`): many SKUs per file,
 * quantities for normal SKUs and one row per serial for serial SKUs.
 * Upload → validate preview → save valid groups one by one.
 */
@Component({
  selector: 'app-receive-import',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    RouterLink,
    MatProgressBarModule,
    PageHeader,
    StatCard,
    MATERIAL,
  ],
  templateUrl: './receive-import.html',
  styleUrl: './receive-import.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ReceiveImport {
  protected readonly store = inject(InventoryStore);
  private readonly notify = inject(NotificationService);

  protected readonly step = signal<Step>('pick');
  protected readonly busy = signal(false);
  protected readonly fileName = signal('');
  protected readonly fileError = signal('');
  protected readonly lines = signal<ReceiveLine[]>([]);
  protected readonly onlyErrors = signal(false);
  /** Result per Excel row number. */
  protected readonly results = signal<ReadonlyMap<number, SaveResult>>(new Map());

  protected readonly validLines = computed(() => this.lines().filter((l) => !l.errors.length));
  protected readonly groups = computed(() => groupReceiveLines(this.lines()));
  protected readonly errorCount = computed(() => this.lines().length - this.validLines().length);
  protected readonly skuCount = computed(
    () => new Set(this.validLines().map((l) => l.productId)).size,
  );
  protected readonly qtyTotal = computed(() =>
    this.validLines()
      .filter((l) => l.kind === 'qty')
      .reduce((sum, l) => sum + l.baseQty, 0),
  );
  protected readonly serialCount = computed(
    () => this.validLines().filter((l) => l.kind === 'serial').length,
  );
  protected readonly valueTotal = computed(() =>
    this.validLines().reduce((sum, l) => sum + l.value, 0),
  );
  protected readonly visibleLines = computed(() =>
    this.onlyErrors() ? this.lines().filter((l) => l.errors.length) : this.lines(),
  );
  protected readonly savedRows = computed(
    () => [...this.results().values()].filter((r) => r.ok).length,
  );
  protected readonly failedRows = computed(
    () => [...this.results().values()].filter((r) => !r.ok).length,
  );
  protected readonly progress = computed(() => {
    const total = this.validLines().length;
    return total ? (this.results().size / total) * 100 : 0;
  });

  constructor() {
    this.store.load();
  }

  protected productOf(line: ReceiveLine): Product | undefined {
    return this.store.allProducts().find((p) => p.id === line.productId);
  }

  protected async downloadTemplate(): Promise<void> {
    this.busy.set(true);
    try {
      saveBlob(await buildReceiveTemplate(this.store.products()), 'receive-template.xlsx');
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
      const raw = await readReceiveRows(file);
      if (!raw.length) throw new Error('ไม่พบข้อมูลในไฟล์');
      const products = this.store.allProducts();
      // Only the serial SKUs in this file need their in-stock serials (duplicate check).
      const serialIds = [
        ...new Set(
          raw
            .map((r) => products.find((p) => p.sku.toUpperCase() === (r.sku ?? '').toUpperCase()))
            .filter((p): p is Product => !!p?.serialControl)
            .map((p) => p.id),
        ),
      ];
      const inStockSerials = await firstValueFrom(this.loadInStockSerials(serialIds));
      this.lines.set(validateReceiveRows(raw, { products, inStockSerials }));
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
    this.lines.set([]);
    this.results.set(new Map());
    this.fileName.set('');
    this.step.set('pick');
  }

  /** Saves each group in turn; a failing group marks its rows and the rest continue. */
  protected import(): void {
    const groups = this.groups();
    if (!groups.length) return;
    this.step.set('saving');
    from(groups)
      .pipe(
        concatMap((group) =>
          this.save(group).pipe(
            map((): [ReceiveGroup, SaveResult] => [group, { ok: true, message: '' }]),
            catchError((err: { error?: { message?: string } }) =>
              of<[ReceiveGroup, SaveResult]>([
                group,
                { ok: false, message: err.error?.message ?? 'บันทึกไม่สำเร็จ' },
              ]),
            ),
          ),
        ),
      )
      .subscribe({
        next: ([group, result]) =>
          this.results.update((m) => {
            const next = new Map(m);
            group.rowNos.forEach((rowNo) => next.set(rowNo, result));
            return next;
          }),
        complete: () => {
          this.step.set('done');
          this.store.load(true);
          this.notify.success(`รับเข้าสำเร็จ ${this.savedRows()} แถว`);
        },
      });
  }

  protected resultOf(line: ReceiveLine): SaveResult | undefined {
    return this.results().get(line.rowNo);
  }

  private save(group: ReceiveGroup): Observable<unknown> {
    return group.kind === 'qty'
      ? this.store.adjustStock(group.productId, group.baseQty, group.unitCostBase, group.note)
      : this.store.receiveSerials(group.productId, group.serials, group.unitCostBase, group.note);
  }

  private loadInStockSerials(ids: number[]): Observable<Map<number, Set<string>>> {
    if (!ids.length) return of(new Map());
    return forkJoin(ids.map((id) => this.store.serials(id))).pipe(
      map(
        (lists) =>
          new Map(
            ids.map((id, i) => [
              id,
              new Set(lists[i].filter((s) => s.status === 'in_stock').map((s) => s.serial)),
            ]),
          ),
      ),
    );
  }
}
