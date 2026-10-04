import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { filter, switchMap } from 'rxjs';
import {
  CATEGORY_LEVEL_LABEL,
  CATEGORY_MAX_LEVEL,
  Category,
  CategoryLevel,
  CategoryNode,
} from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { CategoryStore } from '../../data/category.store';
import {
  CategoryFormData,
  CategoryFormDialog,
} from '../../dialogs/category-form-dialog/category-form-dialog';

interface TreeRow {
  node: CategoryNode;
  depth: number;
  expanded: boolean;
}

/** 3-level category tree (แผนก > หมวด > หมวดย่อย) with add / edit / delete. */
@Component({
  selector: 'app-category-tree',
  imports: [StatCard, EmptyState, LoadingSpinner, MATERIAL],
  templateUrl: './category-tree.html',
  styleUrl: './category-tree.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CategoryTree {
  protected readonly store = inject(CategoryStore);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly notify = inject(NotificationService);

  protected readonly levelLabel = CATEGORY_LEVEL_LABEL;
  protected readonly search = signal('');
  /** Collapsed node ids (everything starts expanded). */
  private readonly collapsed = signal<ReadonlySet<number>>(new Set());

  /** Visible rows of the tree. While searching, matches + their ancestors are shown expanded. */
  protected readonly rows = computed<TreeRow[]>(() => {
    const text = this.search().trim().toLowerCase();
    const matches = (n: CategoryNode): boolean =>
      !text ||
      n.name.toLowerCase().includes(text) ||
      n.code.toLowerCase().includes(text) ||
      n.children.some(matches);

    const rows: TreeRow[] = [];
    const walk = (nodes: CategoryNode[], depth: number) => {
      for (const node of nodes.filter(matches)) {
        const expanded = !!text || !this.collapsed().has(node.id);
        rows.push({ node, depth, expanded });
        if (expanded) walk(node.children, depth + 1);
      }
    };
    walk(this.store.tree(), 0);
    return rows;
  });

  constructor() {
    this.store.load();
  }

  protected toggle(node: CategoryNode): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  }

  protected canAddChild(node: Category): boolean {
    return node.level < CATEGORY_MAX_LEVEL && node.productCount === 0;
  }

  protected childLabel(node: Category): string {
    return CATEGORY_LEVEL_LABEL[(node.level + 1) as CategoryLevel] ?? '';
  }

  /** Why a category cannot be deleted ('' = it can). */
  protected deleteBlocker(node: CategoryNode): string {
    if (node.children.length) return 'ยังมีหมวดหมู่ย่อย';
    if (node.productCount) return `ยังมี SKU ${node.productCount} รายการ`;
    return '';
  }

  protected openForm(data: CategoryFormData): void {
    this.dialog
      .open<CategoryFormDialog, CategoryFormData, Category>(CategoryFormDialog, {
        data,
        width: '480px',
        maxWidth: '95vw',
        // Route-scoped CategoryStore lives in this injector.
        injector: this.injector,
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        if (data.parent)
          this.collapsed.update((set) => new Set([...set].filter((id) => id !== data.parent?.id)));
        this.notify.success(
          data.category ? `บันทึก ${saved.name} แล้ว` : `เพิ่ม ${saved.name} แล้ว`,
        );
      });
  }

  protected remove(node: CategoryNode): void {
    openConfirm(this.dialog, {
      title: 'ลบหมวดหมู่',
      message: `ต้องการลบ ${node.code} - ${node.name} ใช่หรือไม่?`,
      confirmText: 'ลบ',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.remove(node.id)),
      )
      .subscribe(() => this.notify.success(`ลบ ${node.name} แล้ว`));
  }
}
