import { SaleLine, isFreeLine, normalizeSale, saleDay, voidError } from './sale.model';

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

  it('fills fields a stored sale or an API response may lack (B24)', () => {
    const sale = normalizeSale({
      id: 7,
      orderNo: 'POS1-20261016-0002',
      total: 531,
      shiftId: null,
      lines: [{ name: 'เมาส์ไร้สาย', unitPrice: 590, amount: 531, freeOfPromotionId: undefined }],
    } as unknown as Parameters<typeof normalizeSale>[0]);
    expect(sale).toMatchObject({
      subtotal: 531,
      payments: [],
      creditNoteNos: [],
      exchangeNos: [],
      manualDiscount: 0,
      returnStatus: 'none',
    });
    expect(sale.lines[0]).toMatchObject({
      shortName: 'เมาส์ไร้สาย',
      listPrice: 590,
      promotionIds: [],
      freeOfPromotionId: null,
      manualDiscount: 0,
      itemType: 'stock',
      factor: 1,
    });
    // Values that are there are kept.
    const free = normalizeSale({
      total: 0,
      lines: [{ name: 'A', unitPrice: 0, listPrice: 590, amount: 0, freeOfPromotionId: 3 }],
    } as unknown as Parameters<typeof normalizeSale>[0]);
    expect(free.lines[0]).toMatchObject({ listPrice: 590, freeOfPromotionId: 3 });
  });

  it('tells free lines apart even when the field is missing', () => {
    expect(isFreeLine({ freeOfPromotionId: 3 })).toBe(true);
    expect(isFreeLine({ freeOfPromotionId: null })).toBe(false);
    expect(isFreeLine({} as Pick<SaleLine, 'freeOfPromotionId'>)).toBe(false);
  });
});
