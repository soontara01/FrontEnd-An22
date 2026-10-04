import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  viewChild,
} from '@angular/core';
import JsBarcode from 'jsbarcode';

/** EAN-13 when the value is a valid 13-digit EAN, otherwise CODE128 (any text). */
export function barcodeFormat(value: string): 'EAN13' | 'CODE128' {
  if (!/^\d{13}$/.test(value)) return 'CODE128';
  const sum = [...value.slice(0, 12)].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(value[12]) ? 'EAN13' : 'CODE128';
}

/** Renders a barcode as SVG (scales with its container, prints crisp). */
@Component({
  selector: 'app-barcode',
  template: `<svg #svg role="img" [attr.aria-label]="'บาร์โค้ด ' + value()"></svg>`,
  styles: `
    :host {
      display: block;
      line-height: 0;
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Barcode {
  readonly value = input.required<string>();
  /** Show the human-readable text under the bars */
  readonly showText = input(true);

  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  constructor() {
    effect(() => {
      const value = this.value();
      const el = this.svg().nativeElement;
      if (!value) {
        el.replaceChildren();
        return;
      }
      try {
        JsBarcode(el, value, {
          format: barcodeFormat(value),
          displayValue: this.showText(),
          margin: 0,
          height: 40,
          width: 2,
          fontSize: 14,
          textMargin: 1,
          background: 'transparent',
        });
        // Let CSS size it: keep the drawing's aspect ratio inside the label box.
        const w = el.getAttribute('width');
        const h = el.getAttribute('height');
        el.setAttribute('viewBox', `0 0 ${parseFloat(w ?? '0')} ${parseFloat(h ?? '0')}`);
        el.removeAttribute('width');
        el.removeAttribute('height');
        el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      } catch {
        el.replaceChildren(); // invalid value for the format — leave empty
      }
    });
  }
}
