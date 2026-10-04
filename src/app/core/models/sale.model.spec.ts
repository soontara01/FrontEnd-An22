import { saleDay, voidError } from './sale.model';

describe('sale model', () => {
  // Local timestamps, so the test does not depend on the machine's time zone.
  const at = (h: number, day = 4) => new Date(2026, 9, day, h, 30).toISOString();

  it('takes the local calendar day of a sale', () => {
    expect(saleDay({ date: at(0) })).toBe('2026-10-04');
    expect(saleDay({ date: at(23) })).toBe('2026-10-04');
  });

  it('allows voiding a paid bill on the day of sale only, with a reason', () => {
    const sale = { date: at(9), status: 'paid' as const };
    expect(voidError(sale, 'ลูกค้าเปลี่ยนใจ', '2026-10-04')).toBeNull();
    expect(voidError(sale, '  ', '2026-10-04')).toBe('กรุณาระบุเหตุผลการยกเลิก');
    expect(voidError(sale, 'คืน', '2026-10-05')).toBe(
      'ยกเลิกได้เฉพาะบิลของวันนี้ บิลข้ามวันต้องออกใบลดหนี้',
    );
    expect(voidError({ ...sale, status: 'cancelled' }, 'x', '2026-10-04')).toBe(
      'ยกเลิกได้เฉพาะบิลที่ชำระแล้ว',
    );
  });
});
