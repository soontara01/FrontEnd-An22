import { costValue, effectiveCost, movingAverage } from './costing.model';

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
