import {
  PAYMENT_METHOD_DEFAULTS,
  PaymentMethod,
  allowsChange,
  isLastActiveCash,
  isValidPromptPayId,
  netReceived,
  opensDrawer,
  paymentMethodError,
  roundCash,
  withPaymentTypeRules,
} from './payment-method.model';

describe('payment method model', () => {
  const method = (id: number, extra: Partial<PaymentMethod> = {}): PaymentMethod => ({
    ...PAYMENT_METHOD_DEFAULTS,
    id,
    code: `M-${id}`,
    name: `M${id}`,
    type: 'card',
    ...extra,
  });
  const payload = (m: PaymentMethod) => {
    const copy: Partial<PaymentMethod> = { ...m };
    delete copy.id;
    return withPaymentTypeRules(copy as Omit<PaymentMethod, 'id'>);
  };
  const cash = method(1, { type: 'cash', code: 'CASH' });

  it('knows cash behaviour, rounding and net received', () => {
    expect(allowsChange(cash) && opensDrawer(cash)).toBe(true);
    expect(allowsChange(method(2)) || opensDrawer(method(2))).toBe(false);
    expect(roundCash(1234.6, 'none')).toBe(1234.6);
    expect(roundCash(1234.6, '0.25')).toBe(1234.5);
    expect(roundCash(1234.63, '0.25')).toBe(1234.75);
    expect(roundCash(1234.6, '1')).toBe(1235);
    expect(netReceived(1000, { feePercent: 1.6 })).toBe(984);
  });

  it('validates PromptPay IDs (mobile or checksum-valid tax ID)', () => {
    expect(isValidPromptPayId('0812345678')).toBe(true);
    expect(isValidPromptPayId('081-234-5678')).toBe(true);
    expect(isValidPromptPayId('0105550123451')).toBe(true);
    expect(isValidPromptPayId('0105550123452')).toBe(false);
    expect(isValidPromptPayId('12345')).toBe(false);
  });

  it('clears fields the type does not use', () => {
    const p = payload(
      method(3, {
        type: 'cash',
        feePercent: 2,
        requireReference: true,
        referenceLabel: 'x',
        promptPayId: '0812345678',
        installmentMonths: [3],
        cashRounding: '1',
      }),
    );
    expect(p).toMatchObject({
      feePercent: 0,
      requireReference: false,
      referenceLabel: '',
      promptPayId: '',
      installmentMonths: [],
      cashRounding: '1',
    });
    const inst = payload(method(4, { type: 'installment', installmentMonths: [10, 3, 3, 6] }));
    expect(inst.installmentMonths).toEqual([3, 6, 10]);
    expect(inst.cashRounding).toBe('none');
  });

  it('validates methods', () => {
    const all = [cash, method(2)];
    const check = (m: PaymentMethod, exceptId?: number) =>
      paymentMethodError(payload(m), all, exceptId);
    expect(check(method(9))).toBeNull();
    expect(check(method(9, { code: 'CASH' }))).toContain('ซ้ำ');
    expect(check(method(9, { name: 'ชื่อยาวเกินยี่สิบตัวอักษรแน่นอน' }))).toContain('ไม่เกิน 20');
    expect(check(method(9, { minAmount: 500, maxAmount: 100 }))).toContain('ยอดสูงสุด');
    expect(check(method(9, { feePercent: 11 }))).toContain('ค่าธรรมเนียม');
    expect(check(method(9, { requireReference: true, referenceLabel: ' ' }))).toContain(
      'เลขอ้างอิง',
    );
    expect(check(method(9, { type: 'qr', promptPayId: '123' }))).toContain('PromptPay');
    expect(check(method(9, { type: 'installment' }))).toContain('อย่างน้อย 1');
    expect(check(method(9, { type: 'installment', installmentMonths: [1] }))).toContain('2 - 60');
  });

  it('keeps at least one active cash method', () => {
    const all = [cash, method(2)];
    expect(isLastActiveCash(all, 1)).toBe(true);
    expect(isLastActiveCash([...all, method(3, { type: 'cash' })], 1)).toBe(false);
    expect(paymentMethodError(payload({ ...cash, active: false }), all, 1)).toContain('เงินสด');
    expect(paymentMethodError(payload({ ...cash, type: 'card' }), all, 1)).toContain('เงินสด');
    expect(paymentMethodError(payload({ ...cash, name: 'เงินสด' }), all, 1)).toBeNull();
  });
});
