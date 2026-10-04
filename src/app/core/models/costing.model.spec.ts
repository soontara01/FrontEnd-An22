import { buildStockCard, costValue, effectiveCost, movingAverage } from './costing.model';

describe('costing model', () => {
  it('re-averages cost on receipt (moving weighted average)', () => {
    expect(movingAverage(0, 0, 10, 80)).toBe(80); // first receipt
    expect(movingAverage(10, 80, 10, 100)).toBe(90);
    expect(movingAverage(3, 350, 20, 300)).toBeCloseTo(306.5217, 4);
    expect(movingAverage(-2, 50, 5, 60)).toBe(60); // negative stock is treated as 0
  });

  it('uses the actual average while in stock, otherwise the standard cost', () => {
    expect(effectiveCost({ stock: 5, avgCost: 90, cost: 100 })).toBe(90);
    expect(effectiveCost({ stock: 0, avgCost: 90, cost: 100 })).toBe(100);
    expect(effectiveCost({ stock: 5, avgCost: 0, cost: 100 })).toBe(100);
  });

  it('values inventory at cost', () => {
    expect(costValue({ stock: 3, avgCost: 306.5217 })).toBe(919.57);
  });
});

describe('buildStockCard', () => {
  // Local-noon timestamps so the calendar day never shifts with the timezone.
  const at = (day: string) => new Date(`${day}T12:00:00`).toISOString();
  const m = (id: number, day: string, qty: number, balanceQty: number, balanceAvgCost: number) => ({
    id,
    productId: 1,
    date: at(day),
    type: (qty > 0 ? 'receive' : 'issue') as 'receive' | 'issue',
    qty,
    unitCost: balanceAvgCost,
    totalCost: qty * balanceAvgCost,
    balanceQty,
    balanceAvgCost,
    balanceValue: balanceQty * balanceAvgCost,
    serials: [],
    note: '',
  });
  const moves = [
    m(1, '2026-09-01', 10, 10, 100),
    m(2, '2026-09-15', -4, 6, 100),
    m(3, '2026-10-01', 4, 10, 90),
    m(4, '2026-10-03', -2, 8, 90),
  ];

  it('derives opening, in-range movements, totals and closing', () => {
    const card = buildStockCard(moves, '2026-09-10', '2026-10-01');
    expect(card.opening).toEqual({ qty: 10, avgCost: 100, value: 1000 });
    expect(card.movements.map((x) => x.id)).toEqual([2, 3]);
    expect(card.totals).toEqual({ inQty: 4, inCost: 360, outQty: 4, outCost: 400 });
    expect(card.closing).toEqual({ qty: 10, avgCost: 90, value: 900 });
  });

  it('uses zero opening without `from` and keeps closing = opening for an empty range', () => {
    expect(buildStockCard(moves, null, null).opening).toEqual({ qty: 0, avgCost: 0, value: 0 });
    const empty = buildStockCard(moves, '2026-09-20', '2026-09-25');
    expect(empty.movements).toEqual([]);
    expect(empty.closing).toEqual(empty.opening);
    expect(empty.opening.qty).toBe(6);
  });
});
