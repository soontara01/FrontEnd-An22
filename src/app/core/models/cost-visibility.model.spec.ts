import { COST_FIELDS, canSeeCost, hideCost } from './cost-visibility.model';

describe('cost visibility (P5, E43)', () => {
  it('admins and the owner always see cost, staff only when the company allows it', () => {
    const off = { staffSeeCost: false };
    const on = { staffSeeCost: true };
    expect(canSeeCost({ role: 'owner' }, off)).toBe(true);
    expect(canSeeCost({ role: 'admin' }, off)).toBe(true);
    expect(canSeeCost({ role: 'user' }, off)).toBe(false);
    expect(canSeeCost({ role: 'user' }, on)).toBe(true);
    expect(canSeeCost(null, on)).toBe(false);
  });

  it('nulls every cost field at any depth and keeps everything else', () => {
    const body = {
      sku: 'A1',
      cost: 100,
      avgCost: 95.5,
      suppliers: [{ supplierId: 1, cost: 90, moq: 10 }],
      lines: [{ qty: 2, cogs: 191, amount: 300, manualDiscount: { type: 'baht', value: 5 } }],
      card: {
        opening: { qty: 3, avgCost: 90, value: 270 },
        totals: { inQty: 1, inCost: 100, outQty: 0, outCost: 0 },
        movements: [{ unitCost: 1, totalCost: 1, balanceAvgCost: 1, balanceValue: 1, qty: 1 }],
      },
      exchange: { costIn: 1, costOut: 2 },
      transfer: { unitCost: 9 },
      when: null,
    };
    expect(hideCost(body)).toEqual({
      sku: 'A1',
      cost: null,
      avgCost: null,
      suppliers: [{ supplierId: 1, cost: null, moq: 10 }],
      lines: [{ qty: 2, cogs: null, amount: 300, manualDiscount: { type: 'baht', value: 5 } }],
      card: {
        opening: { qty: 3, avgCost: null, value: null },
        totals: { inQty: 1, inCost: null, outQty: 0, outCost: null },
        movements: [
          { unitCost: null, totalCost: null, balanceAvgCost: null, balanceValue: null, qty: 1 },
        ],
      },
      exchange: { costIn: null, costOut: null },
      transfer: { unitCost: null },
      when: null,
    });
    expect(body.cost).toBe(100); // a copy — the stored data never changes
  });

  it('leaves non-JSON answers alone', () => {
    const blob = new Blob(['x']);
    expect(hideCost(blob)).toBe(blob);
    expect(hideCost([1, 'a'])).toEqual([1, 'a']);
    expect(COST_FIELDS.has('value')).toBe(false);
  });
});
