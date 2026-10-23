import { MAX_LIST_ROWS, dateRangeError, rowLimitError, tooManyRowsError } from './list-limit.model';

describe('list limits', () => {
  it('needs both ends and at most 366 days counting both ends', () => {
    expect(dateRangeError(null, '2026-10-23')).toBe('กรุณาเลือกช่วงวันที่ (ไม่เกิน 366 วัน)');
    expect(dateRangeError('2026-10-23', null)).toBe('กรุณาเลือกช่วงวันที่ (ไม่เกิน 366 วัน)');
    expect(dateRangeError('2026-01-01', '2026-12-31')).toBeNull();
    // 2028 is a leap year: 366 days exactly
    expect(dateRangeError('2028-01-01', '2028-12-31')).toBeNull();
    expect(dateRangeError('2026-01-01', '2027-01-01')).toBeNull();
    expect(dateRangeError('2026-01-01', '2027-01-02')).toBe('ช่วงวันที่ต้องไม่เกิน 366 วัน');
  });

  it('refuses more rows than the ceiling instead of cutting them', () => {
    expect(tooManyRowsError(true)).toBe(
      'ข้อมูลมากกว่า 20,000 รายการ กรุณาเลือกช่วงวันที่ให้สั้นลง',
    );
    expect(tooManyRowsError(false)).toBe('ข้อมูลมากกว่า 20,000 รายการ กรุณากรองให้แคบลง');
    expect(rowLimitError(new Array(MAX_LIST_ROWS), true)).toBeNull();
    expect(rowLimitError(new Array(MAX_LIST_ROWS + 1), false)).toBe(tooManyRowsError(false));
  });
});
