import { Pipe, PipeTransform } from '@angular/core';
import { fromIsoDate } from '@core/models';

/** Formats a date in Thai (Buddhist era), e.g. `{{ value | thaiDate }}` → "5 ม.ค. 2569". */
@Pipe({ name: 'thaiDate' })
export class ThaiDatePipe implements PipeTransform {
  private static readonly formats: Record<'short' | 'long', Intl.DateTimeFormatOptions> = {
    short: { day: 'numeric', month: 'short', year: 'numeric' },
    long: { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  };

  transform(
    value: string | number | Date | null | undefined,
    format: 'short' | 'long' = 'short',
  ): string {
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
