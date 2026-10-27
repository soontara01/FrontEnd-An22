import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { todayIso } from '@core/models';
import { MATERIAL } from '@shared/material';

/** Months offered back from this month (3 tax years). */
const MONTHS_BACK = 36;

/** "ตุลาคม 2569" for '2026-10'. */
export const thaiMonthLabel = (month: string): string =>
  new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(
    new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1),
  );

/** 'YYYY-MM' months from this month back `MONTHS_BACK`, plus `value` when it is outside them. */
export function monthOptions(value: string, today = todayIso()): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const months = Array.from({ length: MONTHS_BACK + 1 }, (_, i) => {
    const d = new Date(year, month - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  return months.includes(value) ? months : [...months, value].sort().reverse();
}

/**
 * Tax month of the sales tax reports in Thai — month name + พ.ศ. (C3-11); the browser's
 * `<input type="month">` showed "October 2026" on an English browser.
 */
@Component({
  selector: 'app-month-select',
  imports: [MATERIAL],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="month">
      <mat-label>เดือนภาษี</mat-label>
      <mat-select [value]="value()" (selectionChange)="changed.emit($event.value)">
        @for (m of options(); track m) {
          <mat-option [value]="m">{{ label(m) }}</mat-option>
        }
      </mat-select>
    </mat-form-field>
  `,
  styles: `
    .month {
      min-width: 200px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthSelect {
  /** 'YYYY-MM' */
  readonly value = input.required<string>();
  readonly changed = output<string>();

  protected readonly options = computed(() => monthOptions(this.value()));
  protected readonly label = thaiMonthLabel;
}
