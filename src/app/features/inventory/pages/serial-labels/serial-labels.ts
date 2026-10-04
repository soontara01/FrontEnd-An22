import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Router, RouterLink } from '@angular/router';
import { SerialNumber } from '@core/models';
import { LABEL_LAYOUTS, LabelData, LabelSheet } from '@shared/components/label-sheet/label-sheet';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { InventoryStore } from '../../data/inventory.store';

/** Serial-number stickers for one serial-controlled SKU (`/inventory/serial-labels/:productId`). */
@Component({
  selector: 'app-serial-labels',
  imports: [RouterLink, MatCheckboxModule, PageHeader, LabelSheet, LoadingSpinner, MATERIAL],
  templateUrl: './serial-labels.html',
  styleUrl: './serial-labels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SerialLabels implements OnInit {
  private readonly store = inject(InventoryStore);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  /** Bound from the `:productId` route param. */
  readonly productId = input.required<string>();

  protected readonly layouts = LABEL_LAYOUTS.filter((l) => l.kind === 'sticker');
  protected readonly layoutId = signal('a4-65');
  protected readonly layout = computed(
    () => this.layouts.find((l) => l.id === this.layoutId()) ?? this.layouts[0],
  );
  protected readonly skip = signal(0);
  protected readonly loading = signal(true);
  protected readonly search = signal('');
  private readonly serials = signal<SerialNumber[]>([]);
  protected readonly selected = signal<ReadonlySet<number>>(new Set());

  protected readonly product = computed(() =>
    this.store.products().find((p) => p.id === Number(this.productId())),
  );
  protected readonly visible = computed(() => {
    const text = this.search().trim().toUpperCase();
    return this.serials().filter((s) => !text || s.serial.includes(text));
  });

  protected readonly labels = computed<LabelData[]>(() => {
    const p = this.product();
    if (!p) return [];
    return this.serials()
      .filter((s) => this.selected().has(s.id))
      .map((s) => ({ title: p.shortName || p.name, subtitle: p.sku, barcode: s.serial }));
  });

  ngOnInit(): void {
    this.store.load();
    this.store.serials(Number(this.productId())).subscribe({
      next: (serials) => {
        const inStock = serials.filter((s) => s.status === 'in_stock');
        this.serials.set(inStock);
        this.selected.set(new Set(inStock.map((s) => s.id))); // default: all in stock
        this.loading.set(false);
      },
      error: () => void this.router.navigate(['/inventory']),
    });
  }

  protected toggle(id: number, checked: boolean): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected selectAll(on: boolean): void {
    this.selected.set(on ? new Set(this.visible().map((s) => s.id)) : new Set());
  }

  protected setStart(value: string): void {
    const perPage = this.layout().cols * this.layout().rows;
    this.skip.set(Math.max(0, Math.min(perPage - 1, Math.floor(Number(value) || 1) - 1)));
  }

  protected print(): void {
    this.document.defaultView?.print();
  }
}
