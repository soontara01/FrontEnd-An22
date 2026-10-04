import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { RouterLink } from '@angular/router';
import { Product, VAT_TYPE_LABEL, isDiscontinued } from '@core/models';
import {
  LABEL_LAYOUTS,
  LabelData,
  LabelLayout,
  LabelSheet,
} from '@shared/components/label-sheet/label-sheet';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { SkuStore } from '../../data/sku.store';

type LabelKind = LabelLayout['kind'];

interface Selection {
  qty: number;
  /** '' = base unit, otherwise a pack unit name */
  unit: string;
}

/** Barcode stickers / shelf price labels for SKUs, printed on A4 sticker sheets. */
@Component({
  selector: 'app-sku-labels',
  imports: [RouterLink, MatButtonToggleModule, MatCheckboxModule, PageHeader, LabelSheet, MATERIAL],
  templateUrl: './sku-labels.html',
  styleUrl: './sku-labels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SkuLabels {
  protected readonly store = inject(SkuStore);
  private readonly document = inject(DOCUMENT);

  protected readonly kind = signal<LabelKind>('sticker');
  protected readonly layoutId = signal('a4-40');
  protected readonly skip = signal(0);
  protected readonly showPrice = signal(true);
  protected readonly search = signal('');
  protected readonly selections = signal<ReadonlyMap<number, Selection>>(new Map());

  protected readonly layouts = computed(() => LABEL_LAYOUTS.filter((l) => l.kind === this.kind()));
  protected readonly layout = computed(
    () => this.layouts().find((l) => l.id === this.layoutId()) ?? this.layouts()[0],
  );

  protected readonly candidates = computed(() => {
    const text = this.search().trim().toLowerCase();
    return this.store
      .skus()
      .filter((s) => !isDiscontinued(s))
      .filter(
        (s) =>
          !text ||
          [s.sku, s.name, s.shortName, s.barcode].some((f) => f.toLowerCase().includes(text)),
      );
  });

  protected readonly selectedCount = computed(
    () => [...this.selections().values()].filter((s) => s.qty > 0).length,
  );

  protected readonly labels = computed<LabelData[]>(() => {
    const labels: LabelData[] = [];
    for (const sku of this.store.skus()) {
      const sel = this.selections().get(sku.id);
      if (!sel || sel.qty <= 0) continue;
      const label = this.labelFor(sku, sel.unit);
      for (let i = 0; i < sel.qty; i++) labels.push(label);
    }
    return labels;
  });

  constructor() {
    this.store.load();
  }

  protected setKind(kind: LabelKind): void {
    this.kind.set(kind);
    this.layoutId.set(this.layouts()[0].id);
    this.skip.set(0);
  }

  /** 1-based start position on the sheet → number of slots to skip. */
  protected setStart(value: string): void {
    const perPage = this.layout().cols * this.layout().rows;
    this.skip.set(Math.max(0, Math.min(perPage - 1, Math.floor(Number(value) || 1) - 1)));
  }

  protected selection(sku: Product): Selection {
    return this.selections().get(sku.id) ?? { qty: 0, unit: '' };
  }

  protected setQty(sku: Product, value: string | number): void {
    const qty = Math.max(0, Math.min(500, Math.floor(Number(value) || 0)));
    this.update(sku, { qty });
  }

  protected toggle(sku: Product, checked: boolean): void {
    this.update(sku, { qty: checked ? Math.max(1, this.selection(sku).qty) : 0 });
  }

  protected setUnit(sku: Product, unit: string): void {
    this.update(sku, { unit });
  }

  /** Sticker run for received goods: one label per unit in stock. */
  protected qtyFromStock(): void {
    for (const sku of this.store.skus()) {
      const sel = this.selections().get(sku.id);
      if (sel && sel.qty > 0) this.update(sku, { qty: Math.max(1, sku.stock) });
    }
  }

  protected clear(): void {
    this.selections.set(new Map());
  }

  protected print(): void {
    this.document.defaultView?.print();
  }

  private update(sku: Product, change: Partial<Selection>): void {
    this.selections.update((map) =>
      new Map(map).set(sku.id, { ...this.selection(sku), ...change }),
    );
  }

  private labelFor(sku: Product, unitName: string): LabelData {
    const pack = sku.packUnits.find((p) => p.unit === unitName);
    const unit = pack?.unit ?? sku.unit;
    const factor = pack?.factor ?? 1;
    const barcode = (pack ? pack.barcode : sku.barcode) || sku.sku;
    const price = sku.currentPrice === null ? null : sku.currentPrice * factor;
    const vat = sku.vatType === 'vat7' ? 'ราคารวม VAT' : VAT_TYPE_LABEL.exempt;

    if (this.kind() === 'shelf') {
      const brandModel = [sku.brand, sku.model].filter(Boolean).join(' ');
      return {
        title: sku.name,
        subtitle: [brandModel, `SKU ${sku.sku}`].filter(Boolean).join(' · '),
        barcode,
        price,
        priceNote: [
          `${vat} / ${unit}`,
          sku.warrantyMonths ? `รับประกัน ${sku.warrantyMonths} เดือน` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }
    return {
      title: sku.shortName || sku.name,
      subtitle: pack ? `${sku.sku} · ${pack.unit} ×${pack.factor}` : sku.sku,
      barcode,
      price: this.showPrice() ? price : undefined,
    };
  }

  protected readonly unitOptions = (sku: Product) => sku.packUnits.map((p) => p.unit);
}
