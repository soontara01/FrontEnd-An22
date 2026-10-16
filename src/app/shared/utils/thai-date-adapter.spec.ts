import { TestBed } from '@angular/core/testing';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import { ThaiDateAdapter, provideThaiDateAdapter } from './thai-date-adapter';

describe('ThaiDateAdapter (B8)', () => {
  let adapter: ThaiDateAdapter;
  let dateInput: object;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideThaiDateAdapter(), { provide: MAT_DATE_LOCALE, useValue: 'th-TH' }],
    });
    adapter = TestBed.inject(DateAdapter) as ThaiDateAdapter;
    dateInput = TestBed.inject(MAT_DATE_FORMATS).display.dateInput;
  });

  const day = (d: Date | null) => d && [d.getFullYear(), d.getMonth() + 1, d.getDate()];

  it('reads day/month/year with a Buddhist-era year, as the field shows it', () => {
    expect(day(adapter.parse('1/11/2569'))).toEqual([2026, 11, 1]);
    expect(day(adapter.parse(' 13/10/2569 '))).toEqual([2026, 10, 13]);
    expect(day(adapter.parse('29.2.2567'))).toEqual([2024, 2, 29]);
    expect(day(adapter.parse('05-01-2570'))).toEqual([2027, 1, 5]);
  });

  it('takes a year below 2400 as Christian era', () => {
    expect(day(adapter.parse('1/11/2026'))).toEqual([2026, 11, 1]);
  });

  it('rejects anything that is not a real day/month/year', () => {
    for (const text of ['31/2/2569', '1/13/2569', '0/1/2569', '2026-11-01', '1/11/69', 'abc']) {
      const parsed = adapter.parse(text);
      expect(parsed && adapter.isValid(parsed)).toBe(false);
    }
    expect(adapter.parse('')).toBeNull();
    expect(adapter.parse('   ')).toBeNull();
  });

  it('shows d/m/yyyy in Buddhist era and parses its own output back', () => {
    const date = new Date(2026, 10, 1);
    const shown = adapter.format(date, dateInput);
    expect(shown).toBe('1/11/2569');
    expect(day(adapter.parse(shown))).toEqual([2026, 11, 1]);
  });

  it('passes dates and timestamps through like the native adapter', () => {
    const date = new Date(2026, 9, 16);
    expect(day(adapter.parse(date))).toEqual([2026, 10, 16]);
    expect(day(adapter.parse(date.getTime()))).toEqual([2026, 10, 16]);
  });
});
