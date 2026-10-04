import {
  SkuPrice,
  addDaysIso,
  effectivePrice,
  findOverlap,
  priceStatus,
  rangesOverlap,
  toIsoDate,
} from './price.model';

describe('price model', () => {
  const p = (id: number, startDate: string, endDate: string | null, productId = 1): SkuPrice => ({
    id,
    productId,
    price: id * 100,
    startDate,
    endDate,
    note: '',
  });
  const today = '2026-10-03';

  it('formats local dates and adds days across month/year ends', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('derives status with inclusive start/end and open end', () => {
    expect(priceStatus(p(1, '2026-10-03', '2026-10-03'), today)).toBe('active');
    expect(priceStatus(p(1, '2026-10-04', null), today)).toBe('scheduled');
    expect(priceStatus(p(1, '2026-01-01', '2026-10-02'), today)).toBe('expired');
    expect(priceStatus(p(1, '2026-01-01', null), today)).toBe('active');
  });

  it('detects overlaps (touching days overlap, adjacent days do not)', () => {
    const a = p(1, '2026-01-01', '2026-06-30');
    expect(rangesOverlap(a, p(2, '2026-06-30', '2026-12-31'))).toBe(true);
    expect(rangesOverlap(a, p(2, '2026-07-01', null))).toBe(false);
    expect(rangesOverlap(p(1, '2026-01-01', null), p(2, '2030-01-01', '2030-01-31'))).toBe(true);
  });

  it('finds the effective price and overlaps of the same SKU only, ignoring the edited one', () => {
    const prices = [
      p(1, '2026-01-01', '2026-06-30'),
      p(2, '2026-07-01', null),
      p(3, '2026-01-01', null, 99),
    ];
    expect(effectivePrice(prices.slice(0, 2), today)?.id).toBe(2);
    expect(effectivePrice([p(1, '2026-01-01', '2026-09-30')], today)).toBeUndefined();

    const candidate = { productId: 1, startDate: '2026-08-01', endDate: '2026-08-31' };
    expect(findOverlap(prices, candidate)?.id).toBe(2);
    expect(findOverlap(prices, candidate, 2)).toBeUndefined();
  });
});
