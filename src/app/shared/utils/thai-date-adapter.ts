import { Injectable, Provider } from '@angular/core';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_NATIVE_DATE_FORMATS,
  MatDateFormats,
  NativeDateAdapter,
} from '@angular/material/core';

/** Display format of a datepicker input (compared by identity): day/month/พ.ศ., e.g. 1/11/2569. */
const THAI_DATE_INPUT: object = Object.freeze({ thaiDateInput: 'd/M/yyyy BE' });

/** The year a Thai user types: ≥ 2400 is Buddhist era (− 543), below that Christian era. */
const BE_FROM = 2400;
const BE_OFFSET = 543;

/**
 * Native date adapter whose typed input matches what the field shows (B8): `d/m/yyyy` with the year
 * in พ.ศ. (or ค.ศ. when below 2400), `/`, `.` or `-` between the parts. The stock adapter shows
 * the Thai locale's day/month/พ.ศ. but parses typing as month/day/ค.ศ., so `1/11/2569` became
 * 11 Jan 2569 CE. Calendar labels keep the locale's formatting.
 */
@Injectable()
export class ThaiDateAdapter extends NativeDateAdapter {
  override parse(value: unknown, parseFormat?: unknown): Date | null {
    if (typeof value !== 'string') return super.parse(value, parseFormat);
    const text = value.trim();
    if (!text) return null;
    const parts = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
    if (!parts) return this.invalid();
    const [day, month, typedYear] = parts.slice(1).map(Number);
    const year = typedYear >= BE_FROM ? typedYear - BE_OFFSET : typedYear;
    if (year < 1000 || month < 1 || month > 12 || day < 1) return this.invalid();
    // Local date from its parts (never new Date('YYYY-MM-DD'), which is UTC).
    const date = new Date(year, month - 1, day);
    return date.getMonth() === month - 1 ? date : this.invalid();
  }

  override format(date: Date, displayFormat: object): string {
    if (displayFormat !== THAI_DATE_INPUT) return super.format(date, displayFormat);
    if (!this.isValid(date)) throw Error('ThaiDateAdapter: Cannot format invalid date.');
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear() + BE_OFFSET}`;
  }
}

export const THAI_DATE_FORMATS: MatDateFormats = {
  ...MAT_NATIVE_DATE_FORMATS,
  display: { ...MAT_NATIVE_DATE_FORMATS.display, dateInput: THAI_DATE_INPUT },
};

/** Use instead of `provideNativeDateAdapter()` in the routes that have datepickers. */
export const provideThaiDateAdapter = (): Provider[] => [
  { provide: DateAdapter, useClass: ThaiDateAdapter },
  { provide: MAT_DATE_FORMATS, useValue: THAI_DATE_FORMATS },
];
