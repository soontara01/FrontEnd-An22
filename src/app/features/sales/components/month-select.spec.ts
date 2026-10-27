import { monthOptions, thaiMonthLabel } from './month-select';

describe('MonthSelect (C3-11)', () => {
  it('labels a month in Thai with the Buddhist year', () => {
    expect(thaiMonthLabel('2026-10')).toBe('ตุลาคม 2569');
    expect(thaiMonthLabel('2027-01')).toBe('มกราคม 2570');
  });

  it('offers this month back 36 months, newest first, across years', () => {
    const months = monthOptions('2026-10', '2026-10-27');
    expect(months).toHaveLength(37);
    expect(months.slice(0, 11)).toEqual([
      '2026-10',
      '2026-09',
      '2026-08',
      '2026-07',
      '2026-06',
      '2026-05',
      '2026-04',
      '2026-03',
      '2026-02',
      '2026-01',
      '2025-12',
    ]);
    expect(months.at(-1)).toBe('2023-10');
  });

  it('keeps a month from the URL that is outside the list', () => {
    expect(monthOptions('2027-02', '2026-10-27')[0]).toBe('2027-02');
    expect(monthOptions('2020-01', '2026-10-27').at(-1)).toBe('2020-01');
  });
});
