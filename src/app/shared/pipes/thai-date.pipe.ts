import { Pipe, PipeTransform } from '@angular/core';
import { fromIsoDate } from '@core/models';

type Format = 'short' | 'datetime' | 'long' | 'month';

/** Formats a date in Thai (Buddhist era), e.g. `{{ value | thaiDate }}` → "5 ม.ค. 2569"
 * (`datetime` → "5 ม.ค. 2569 14:05", `long` → full month + time, `month` → "มกราคม 2569"). */
@Pipe({ name: 'thaiDate' })
export class ThaiDatePipe implements PipeTransform {
  private static readonly formats: Record<Format, Intl.DateTimeFormatOptions> = {
    short: { day: 'numeric', month: 'short', year: 'numeric' },
    datetime: {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
    long: { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    month: { month: 'long', year: 'numeric' },
  };

  transform(value: string | number | Date | null | undefined, format: Format = 'short'): string {
    if (value === null || value === undefined || value === '') return '';
    // Date-only 'YYYY-MM-DD' is a local calendar date (new Date() would read it as UTC).
    const date =
      typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? fromIsoDate(value)
        : new Date(value);
    if (isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('th-TH', ThaiDatePipe.formats[format]).format(date);
  }
}
