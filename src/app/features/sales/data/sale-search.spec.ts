import { SALE_DEFAULTS, Sale, SaleLine } from '@core/models';
import { matchesSaleSearch } from './sale-search';

describe('matchesSaleSearch', () => {
  const sale = {
    ...SALE_DEFAULTS,
    id: 1,
    orderNo: 'POS-HQ-1-20261026-0002',
    date: '2026-10-26T06:26:00Z',
    customer: 'บริษัท ทดสอบผู้ซื้อ จำกัด',
    cashier: 'นก ขายดี',
    total: 13955.5,
    subtotal: 14990,
    itemCount: 1,
    status: 'paid',
    lines: [{ serial: 'R5C00000001' } as SaleLine],
  } as Sale;

  it('matches the bill number, customer, cashier and the sold serial', () => {
    expect(matchesSaleSearch(sale, '')).toBe(true);
    expect(matchesSaleSearch(sale, 'pos-hq-1')).toBe(true);
    expect(matchesSaleSearch(sale, 'ทดสอบผู้ซื้อ')).toBe(true);
    expect(matchesSaleSearch(sale, 'นก')).toBe(true);
    expect(matchesSaleSearch(sale, 'r5c00000001')).toBe(true);
    expect(matchesSaleSearch(sale, 'R5C00000002')).toBe(false);
  });

  it('finds the bill by a serial handed out later by an exchange (C3-9)', () => {
    expect(matchesSaleSearch(sale, ' R5C00000002 ', ['R5C00000002'])).toBe(true);
  });
});
