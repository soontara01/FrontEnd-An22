import { PAYMENT_METHOD_DEFAULTS, PaymentMethod } from './payment-method.model';
import { cashDueFor, paymentError, paymentSummary } from './pos-payment.model';
import { PaymentInput } from './sale.model';

const method = (id: number, over: Partial<PaymentMethod>): PaymentMethod => ({
  ...PAYMENT_METHOD_DEFAULTS,
  id,
  code: `M${id}`,
  name: `ช่องทาง ${id}`,
  type: 'cash',
  ...over,
});

const methods: PaymentMethod[] = [
  method(1, { name: 'เงินสด', type: 'cash', cashRounding: '0.25' }),
  method(2, {
    name: 'บัตร',
    type: 'card',
    requireReference: true,
    referenceLabel: 'เลขอนุมัติ',
    minAmount: 100,
  }),
  method(3, { name: 'QR', type: 'qr', maxAmount: 5000 }),
  method(4, { name: 'ผ่อน', type: 'installment', installmentMonths: [3, 6] }),
  method(5, { name: 'ปิด', type: 'transfer', active: false }),
];

const pay = (methodId: number, amount: number, over: Partial<PaymentInput> = {}) => ({
  methodId,
  amount,
  reference: '',
  installmentMonths: null,
  ...over,
});

describe('pos payment', () => {
  it('rounds the cash part and gives change', () => {
    const s = paymentSummary(100.1, [pay(1, 500)], methods);
    expect(s).toMatchObject({
      remaining: 100.1,
      cashDue: 100,
      rounding: -0.1,
      tendered: 500,
      change: 400,
      balance: 0,
      complete: true,
      opensDrawer: true,
    });
    expect(s.payments[0]).toMatchObject({ amount: 100, tendered: 500, type: 'cash' });
    expect(paymentError(100.1, [pay(1, 500)], methods)).toBeNull();
  });

  it('settles non-cash lines exactly and cash for the rest', () => {
    const inputs = [pay(2, 1000, { reference: 'A1' }), pay(1, 300)];
    const s = paymentSummary(1250.13, inputs, methods);
    expect(s).toMatchObject({ nonCash: 1000, remaining: 250.13, cashDue: 250.25, change: 49.75 });
    expect(s.rounding).toBe(0.12);
    expect(paymentError(1250.13, inputs, methods)).toBeNull();
    expect(cashDueFor(250.13, { cashRounding: '1' })).toBe(250);
  });

  it('is complete without cash when non-cash lines cover the total', () => {
    const s = paymentSummary(500, [pay(3, 200), pay(3, 300)], methods);
    expect(s).toMatchObject({ complete: true, change: 0, rounding: 0, opensDrawer: false });
    expect(paymentError(500, [pay(3, 200), pay(3, 300)], methods)).toBeNull();
  });

  it('reports what is still due', () => {
    expect(paymentSummary(500, [pay(3, 200)], methods).balance).toBe(300);
    expect(paymentError(500, [pay(3, 200)], methods)).toBe('ยอดชำระยังไม่ครบ (ขาด ฿300)');
    expect(paymentError(500, [pay(1, 499)], methods)).toBe('ยอดชำระยังไม่ครบ (ขาด ฿1)');
    expect(paymentError(500, [], methods)).toBe('กรุณาเลือกช่องทางชำระเงิน');
  });

  it('allows change only on cash', () => {
    expect(paymentError(500, [pay(3, 600)], methods)).toBe(
      'ยอดชำระที่ไม่ใช่เงินสดเกินยอดบิล (ทอนได้เฉพาะเงินสด)',
    );
    expect(paymentError(500, [pay(3, 500), pay(1, 100)], methods)).toBe(
      'ไม่มียอดที่ต้องรับเป็นเงินสด',
    );
    expect(paymentError(500, [pay(1, 300), pay(1, 300)], methods)).toBe('รับเงินสดได้บรรทัดเดียว');
  });

  it('checks method rules per line', () => {
    expect(paymentError(500, [pay(9, 500)], methods)).toBe('ไม่พบช่องทางชำระเงิน #9');
    expect(paymentError(500, [pay(5, 500)], methods)).toBe('ปิด ปิดใช้งาน');
    expect(paymentError(500, [pay(2, 500)], methods)).toBe('บัตร: กรุณากรอกเลขอนุมัติ');
    expect(paymentError(500, [pay(2, 50, { reference: 'x' }), pay(1, 450)], methods)).toBe(
      'บัตร: ขั้นต่ำ ฿100 ต่อรายการ',
    );
    expect(paymentError(6000, [pay(3, 6000)], methods)).toBe('QR: สูงสุด ฿5,000 ต่อรายการ');
    expect(paymentError(500, [pay(4, 500, { installmentMonths: 10 })], methods)).toBe(
      'ผ่อน: กรุณาเลือกจำนวนเดือนผ่อน',
    );
    expect(paymentError(500, [pay(4, 500, { installmentMonths: 6 })], methods)).toBeNull();
    expect(paymentError(500, [pay(3, 0.001)], methods)).toBe('QR: จำนวนเงินไม่ถูกต้อง');
  });

  it('records installment months only for installment lines', () => {
    const s = paymentSummary(500, [pay(3, 500, { installmentMonths: 3 })], methods);
    expect(s.payments[0].installmentMonths).toBeNull();
  });

  it('needs no payment for a zero bill', () => {
    expect(paymentError(0, [], methods)).toBeNull();
    expect(paymentError(0, [pay(1, 10)], methods)).toBe('บิลยอด 0 บาทไม่ต้องรับชำระ');
  });
});
