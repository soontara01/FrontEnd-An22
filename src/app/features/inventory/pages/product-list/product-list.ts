import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ComponentType } from '@angular/cdk/portal';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { firstValueFrom, forkJoin } from 'rxjs';
import {
  Product,
  SerialNumber,
  SKU_STATUS_BADGE,
  SKU_STATUS_LABEL,
  StockLevel,
  allBarcodes,
  costValue,
  canPurchase,
  stockInPacks,
  stockLevel,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { saveBlob, timestampedName } from '@shared/utils/download';
import { STOCK_LEVEL_LABEL, inventoryXlsx } from '../../data/inventory-excel';
import { InventoryStore } from '../../data/inventory.store';
import { StockIssueDialog } from '../../dialogs/stock-issue-dialog/stock-issue-dialog';
import { StockReceiveDialog } from '../../dialogs/stock-receive-dialog/stock-receive-dialog';
import { SerialHistoryDialog } from '../../dialogs/serial-history-dialog/serial-history-dialog';
import { SerialReceiveDialog } from '../../dialogs/serial-receive-dialog/serial-receive-dialog';
import { SerialRemoveDialog } from '../../dialogs/serial-remove-dialog/serial-remove-dialog';

@Component({
  selector: 'app-product-list',
  imports: [
    RouterLink,
    CurrencyPipe,
    DecimalPipe,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    PageHeader,
    StatCard,
    EmptyState,
    LoadingSpinner,
    MATERIAL,
  ],
  templateUrl: './product-list.html',
  styleUrl: './product-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ProductList {
  protected readonly store = inject(InventoryStore);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);

  protected readonly columns = [
    'sku',
    'name',
    'category',
    'currentPrice',
    'stock',
    'avgCost',
    'level',
    'actions',
  ];
  protected readonly dataSource = new MatTableDataSource<Product>([]);
  protected readonly filterText = signal('');
  protected readonly lowOnly = signal(false);

  protected readonly levelLabel = STOCK_LEVEL_LABEL;
  protected readonly exporting = signal(false);
  protected readonly levelClass: Record<StockLevel, string> = {
    ok: 'badge-success',
    low: 'badge-warn',
    out: 'badge-error',
  };
  protected readonly level = stockLevel;
  protected readonly canPurchase = canPurchase;
  protected readonly inPacks = stockInPacks;
  protected readonly value = costValue;

  private readonly filtered = computed(() => {
    const text = this.filterText().trim().toLowerCase();
    return this.store
      .products()
      .filter((p) => !this.lowOnly() || stockLevel(p) !== 'ok')
      .filter(
        (p) =>
          !text ||
          [p.sku, p.name, p.shortName, p.categoryPath, ...allBarcodes(p)].some((field) =>
            field.toLowerCase().includes(text),
          ),
      );
  });

  private readonly paginator = viewChild(MatPaginator);
  private readonly sort = viewChild(MatSort);

  constructor() {
    this.store.load();

    effect(() => {
      this.dataSource.data = this.filtered();
    });
    effect(() => {
      this.dataSource.paginator = this.paginator() ?? null;
      this.dataSource.sort = this.sort() ?? null;
    });
  }

  /** Exports the rows currently shown (search / filter applied) + their in-stock serials. */
  protected async exportExcel(): Promise<void> {
    this.exporting.set(true);
    try {
      const rows = this.dataSource.filteredData;
      const serialIds = rows.filter((p) => p.serialControl && p.stock > 0).map((p) => p.id);
      const serials: SerialNumber[] = serialIds.length
        ? (await firstValueFrom(forkJoin(serialIds.map((id) => this.store.serials(id))))).flat()
        : [];
      const blob = await inventoryXlsx(rows, serials);
      saveBlob(blob, `${timestampedName('inventory')}.xlsx`);
    } finally {
      this.exporting.set(false);
    }
  }

  protected statusText(p: Product): string {
    return SKU_STATUS_LABEL[p.saleStatus];
  }

  protected statusClass(p: Product): string {
    return SKU_STATUS_BADGE[p.saleStatus];
  }

  /** Non-serial issue by quantity, at the current average cost. */
  protected openStockIssue(product: Product): void {
    this.openDialog(StockIssueDialog, product, (p) =>
      this.notify.success(
        `${p.sku}: ตัดออก ${product.stock - p.stock} ${p.unit} ที่ทุน ${p.avgCost.toFixed(2)} ฿ · คงเหลือ ${p.stock}`,
      ),
    );
  }

  /** Non-serial receipt with purchase cost (moving average). */
  protected openStockReceive(product: Product): void {
    this.openDialog(StockReceiveDialog, product, (p) =>
      this.notify.success(
        `${p.sku}: รับเข้าแล้ว คงเหลือ ${p.stock} ${p.unit} · ทุนเฉลี่ย ${p.avgCost.toFixed(2)} ฿`,
      ),
    );
  }

  protected openReceive(product: Product): void {
    this.openDialog(SerialReceiveDialog, product, (p) =>
      this.notify.success(`${p.sku}: รับเข้าแล้ว คงเหลือ ${p.stock} ${p.unit}`),
    );
  }

  protected openRemove(product: Product): void {
    this.openDialog(SerialRemoveDialog, product, (p) =>
      this.notify.success(`${p.sku}: ตัดออกแล้ว คงเหลือ ${p.stock} ${p.unit}`),
    );
  }

  protected openHistory(product: Product): void {
    this.openDialog(SerialHistoryDialog, product);
  }

  /**
   * Opens a serial dialog with this component's injector so it can use the
   * route-scoped InventoryStore (MatDialog would otherwise use the root injector).
   */
  private openDialog<T>(
    component: ComponentType<T>,
    product: Product,
    onDone?: (updated: Product) => void,
  ): void {
    this.dialog
      .open<T, Product, Product>(component, {
        data: product,
        width: '640px',
        maxWidth: '95vw',
        injector: this.injector,
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((updated) => {
        if (updated) onDone?.(updated);
      });
  }
}
