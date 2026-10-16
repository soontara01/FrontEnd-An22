import { moneyInputError, moneyProblem } from './money.model';

describe('money input rule (B1 / B14)', () => {
  it('tells an empty field, a negative amount and too many decimals apart', () => {
    for (const empty of [null, undefined, '', '  ', NaN, 'abc']) {
      expect(moneyProblem(empty)).toBe('required');
    }
    expect(moneyProblem(-0.01)).toBe('negative');
    expect(moneyProblem(1.005)).toBe('decimals');
    expect(moneyProblem('12.345')).toBe('decimals');
    for (const ok of [0, 1, 19.99, '350', 1e6]) expect(moneyProblem(ok)).toBeNull();
  });

  it('words each problem for its field', () => {
    expect(moneyInputError('', 'ต้นทุน')).toBe('กรุณากรอกต้นทุน');
    expect(moneyInputError(-5, 'ต้นทุน')).toBe('ต้นทุนต้องไม่ติดลบ');
    expect(moneyInputError(0.125, 'ต้นทุน')).toBe('ต้นทุนทศนิยมไม่เกิน 2 ตำแหน่ง');
    expect(moneyInputError(820, 'ต้นทุน')).toBeNull();
  });
});
