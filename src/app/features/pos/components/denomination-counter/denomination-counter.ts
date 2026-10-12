import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, model } from '@angular/core';
import { DenominationCount, THAI_DENOMINATIONS, denominationTotal } from '@core/models';
import { MATERIAL } from '@shared/material';

/**
 * Cash counting helper: a quantity per Thai banknote / coin and the total
 * (`[(counts)]`, only values with a quantity > 0, largest first).
 */
@Component({
  selector: 'app-denomination-counter',
  imports: [DecimalPipe, MATERIAL],
  template: `
    <div class="notes">
      @for (value of denominations; track value) {
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ value | number: '1.0-2' }} บาท</mat-label>
          <input
            matInput
            type="number"
            min="0"
            step="1"
            [value]="qtyOf(value) || ''"
            (input)="setQty(value, $any($event.target).value)"
          />
          <span matTextSuffix>×</span>
        </mat-form-field>
      }
    </div>
    <p>
      รวมที่นับได้ <strong>{{ total() | number: '1.2-2' }}</strong> บาท
    </p>
  `,
  styles: `
    .notes {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 0 12px;
      margin-top: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DenominationCounter {
  readonly counts = model<DenominationCount[]>([]);

  protected readonly denominations = THAI_DENOMINATIONS;
  readonly total = computed(() => denominationTotal(this.counts()));

  protected qtyOf(value: number): number {
    return this.counts().find((c) => c.value === value)?.qty ?? 0;
  }

  protected setQty(value: number, raw: string): void {
    const qty = Math.max(0, Math.floor(Number(raw) || 0));
    this.counts.update((counts) =>
      [...counts.filter((c) => c.value !== value), { value, qty }]
        .filter((c) => c.qty > 0)
        .sort((a, b) => b.value - a.value),
    );
  }
}
