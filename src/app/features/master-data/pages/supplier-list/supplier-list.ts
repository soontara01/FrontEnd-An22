import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';
import { Supplier, branchLabel, creditLabel } from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { SupplierStore } from '../../data/supplier.store';

/** Supplier list (tab "ผู้จำหน่าย" in ข้อมูลหลัก). */
@Component({
  selector: 'app-supplier-list',
  imports: [
    RouterLink,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    StatCard,
    EmptyState,
    LoadingSpinner,
    MATERIAL,
  ],
  templateUrl: './supplier-list.html',
  styleUrl: './supplier-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SupplierList {
  protected readonly store = inject(SupplierStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);

  protected readonly columns = [
    'code',
    'name',
    'taxId',
    'contact',
    'creditDays',
    'productCount',
    'active',
    'actions',
  ];
  protected readonly dataSource = new MatTableDataSource<Supplier>([]);
  protected readonly filterText = signal('');
  protected readonly includeInactive = signal(false);
  protected readonly branch = branchLabel;
  protected readonly credit = creditLabel;

  private readonly filtered = computed(() => {
    const text = this.filterText().trim().toLowerCase();
    return this.store
      .suppliers()
      .filter((s) => this.includeInactive() || s.active)
      .filter(
        (s) =>
          !text ||
          [s.code, s.name, s.taxId, s.contactName, s.phone, s.email].some((f) =>
            f.toLowerCase().includes(text),
          ),
      );
  });

  private readonly paginator = viewChild(MatPaginator);
  private readonly sort = viewChild(MatSort);

  constructor() {
    this.store.load(true); // SKU counts change from the SKU menu

    effect(() => {
      this.dataSource.data = this.filtered();
    });
    effect(() => {
      this.dataSource.paginator = this.paginator() ?? null;
      this.dataSource.sort = this.sort() ?? null;
    });
  }

  protected open(supplier: Supplier): void {
    void this.router.navigate(['/master-data/suppliers', supplier.id, 'edit']);
  }

  protected remove(supplier: Supplier, event: Event): void {
    event.stopPropagation();
    openConfirm(this.dialog, {
      title: 'ลบผู้จำหน่าย',
      message: `ต้องการลบ ${supplier.code} - ${supplier.name} ใช่หรือไม่?`,
      confirmText: 'ลบ',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.remove(supplier.id)),
      )
      .subscribe(() => this.notify.success(`ลบ ${supplier.name} แล้ว`));
  }
}
