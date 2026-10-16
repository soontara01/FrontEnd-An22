import { AfterViewInit, Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Focuses the host element after it renders: `<input appAutofocus />`;
 * `[appAutofocus]="false"` turns it off (e.g. another field takes the focus).
 */
@Directive({ selector: '[appAutofocus]' })
export class AutofocusDirective implements AfterViewInit {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly appAutofocus = input<boolean | ''>('');

  ngAfterViewInit(): void {
    if (this.appAutofocus() === false) return;
    setTimeout(() => this.el.nativeElement.focus());
  }
}
