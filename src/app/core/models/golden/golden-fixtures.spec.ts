import payment from '../../../../../docs/backend/fixtures/payment.json';
import priceCart from '../../../../../docs/backend/fixtures/price-cart.json';
import { buildGoldenFixtures } from './golden-fixtures';

// The JSON is what the API's tests read; it must stay what the rules produce today.
// A rule or case changed on purpose → `npm run fixtures`, then review the JSON diff.
const written: Record<string, unknown[]> = { 'price-cart': priceCart, payment };

describe('golden fixtures (docs/backend/fixtures)', () => {
  // Through JSON like the files themselves: drops undefined fields, -0 becomes 0.
  const current = JSON.parse(JSON.stringify(buildGoldenFixtures())) as Record<string, unknown[]>;

  it('has a file for every fixture set', () => {
    expect(Object.keys(written).sort()).toEqual(Object.keys(current).sort());
  });

  for (const name of Object.keys(current)) {
    it(`${name}.json matches the rules (run npm run fixtures after an intended change)`, () => {
      expect(written[name]).toEqual(current[name]);
    });
  }
});
