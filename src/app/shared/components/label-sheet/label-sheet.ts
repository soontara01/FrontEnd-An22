import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  inject,
  input,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Barcode } from '../barcode/barcode';

/** One printed label. */
export interface LabelData {
  /** Main text (receipt short name / product name / serial) */
  title: string;
  /** Small line under the title (e.g. SKU, model, warranty) */
  subtitle?: string;
  /** Value encoded as barcode ('' = no barcode) */
  barcode: string;
  /** VAT-inclusive price (shelf labels / price stickers) */
  price?: number | null;
  /** Small note under the price (e.g. 'ราคารวม VAT · ต่อ ชิ้น') */
  priceNote?: string;
}

/** A4 sticker-sheet layout (mm). */
export interface LabelLayout {
  id: string;
  label: string;
  cols: number;
  rows: number;
  width: number;
  height: number;
  /** Page margins so labels line up with the sticker sheet */
  marginTop: number;
  marginLeft: number;
  /** Visual style of each label */
  kind: 'sticker' | 'shelf';
}

/** Common A4 sticker sheets. */
export const LABEL_LAYOUTS: LabelLayout[] = [
  {
    id: 'a4-65',
    label: 'สติกเกอร์เล็ก 65 ดวง (38.1×21.2 มม.)',
    cols: 5,
    rows: 13,
    width: 38.1,
    height: 21.2,
    marginTop: 10.7,
    marginLeft: 4.7,
    kind: 'sticker',
  },
  {
    id: 'a4-40',
    label: 'สติกเกอร์ 40 ดวง (52.5×29.7 มม.)',
    cols: 4,
    rows: 10,
    width: 52.5,
    height: 29.7,
    marginTop: 0,
    marginLeft: 0,
    kind: 'sticker',
  },
  {
    id: 'a4-24',
    label: 'สติกเกอร์ 24 ดวง (70×37 มม.)',
    cols: 3,
    rows: 8,
    width: 70,
    height: 37.1,
    marginTop: 0,
    marginLeft: 0,
    kind: 'sticker',
  },
  {
    id: 'a4-10',
    label: 'ป้ายราคาชั้นวาง 10 ป้าย (105×59.4 มม.)',
    cols: 2,
    rows: 5,
    width: 105,
    height: 59.4,
    marginTop: 0,
    marginLeft: 0,
    kind: 'shelf',
  },
];

/**
 * Renders labels as A4 pages laid out for sticker sheets.
 * `skip` leaves the first N positions empty (re-using a partly used sheet).
 * Only `.label-sheet` content is printed (see global print styles).
 */
@Component({
  selector: 'app-label-sheet',
  imports: [CurrencyPipe, Barcode],
  templateUrl: './label-sheet.html',
  styleUrl: './label-sheet.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelSheet {
  constructor() {
    // While a label sheet is on screen, printing drops the page padding (see styles.scss).
    const root = inject(DOCUMENT).documentElement;
    root.classList.add('print-labels');
    inject(DestroyRef).onDestroy(() => root.classList.remove('print-labels'));
  }

  readonly labels = input.required<LabelData[]>();
  readonly layout = input.required<LabelLayout>();
  readonly skip = input(0);

  /** Pages of label slots (null = empty slot). */
  protected readonly pages = computed(() => {
    const { cols, rows } = this.layout();
    const perPage = cols * rows;
    const slots: (LabelData | null)[] = [
      ...Array<null>(Math.min(this.skip(), perPage - 1)).fill(null),
      ...this.labels(),
    ];
    const pages: (LabelData | null)[][] = [];
    for (let i = 0; i < slots.length; i += perPage) pages.push(slots.slice(i, i + perPage));
    return pages;
  });

  protected readonly pageCount = computed(() => this.pages().length);
}
