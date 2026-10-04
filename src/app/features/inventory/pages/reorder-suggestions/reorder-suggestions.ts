import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { branchLabel, creditLabel } from '@core/models';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { MATERIAL } from '@shared/material';
import { InventoryStore } from '../../data/inventory.store';

/**
 * Reorder suggestions (`/inventory/reorder`): SKUs at/below their reorder point,
 * grouped by main supplier, with suggested quantity (to max stock, ≥ MOQ, whole packs).
 */
@Component({
  selector: 'app-reorder-suggestions',
  imports: [CurrencyPipe, RouterLink, PageHeader, StatCard, EmptyState, LoadingSpinner, MATERIAL],
  templateUrl: './reorder-suggestions.html',
  styleUrl: './reorder-suggestions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ReorderSuggestions {
  protected readonly store = inject(InventoryStore);
  private readonly document = inject(DOCUMENT);

  protected readonly branch = branchLabel;
  protected readonly credit = creditLabel;

  protected readonly grandTotal = computed(() =>
    this.store.reorderGroups().reduce((sum, g) => sum + g.total, 0),
  );
  protected readonly supplierCount = computed(
    () => this.store.reorderGroups().filter((g) => g.supplier).length,
  );

  constructor() {
    this.store.load();
  }

  protected print(): void {
    this.document.defaultView?.print();
  }
}
