import { parseExcelDate, thaiDateText } from './excel';

describe('Excel date helpers', () => {
  it('parses Thai and Christian years and Excel date cells', () => {
    expect(parseExcelDate('1/12/2569')).toBe('2026-12-01');
    expect(parseExcelDate('01-12-2026')).toBe('2026-12-01');
    expect(parseExcelDate(new Date(Date.UTC(2026, 11, 1)))).toBe('2026-12-01');
    expect(parseExcelDate('')).toBeUndefined();
    expect(parseExcelDate('2026-12-01')).toBeNull();
    expect(parseExcelDate('29/2/2569')).toBeNull();
  });

  it('writes a date the way a Thai user types it', () => {
    expect(thaiDateText('2026-12-01')).toBe('1/12/2569');
    expect(thaiDateText(null)).toBe('');
    expect(parseExcelDate(thaiDateText('2027-02-28'))).toBe('2027-02-28');
  });
});
