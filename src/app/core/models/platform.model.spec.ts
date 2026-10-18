import { payInvoiceError, reactivateCompanyError, suspendCompanyError } from './platform.model';

describe('platform admin rules (E36)', () => {
  it('suspends an active company with a reason', () => {
    expect(suspendCompanyError({ active: true, deletedAt: null }, ' ')).toBe(
      'กรุณากรอกเหตุผลที่ระงับ',
    );
    expect(suspendCompanyError({ active: false, deletedAt: null }, 'x')).toBe(
      'บริษัทนี้ถูกระงับอยู่แล้ว',
    );
    expect(suspendCompanyError({ active: true, deletedAt: null }, 'ผิดเงื่อนไข')).toBeNull();
  });

  it('turns back on only what the platform suspended', () => {
    const c = (suspendedReason: 'overdue' | 'platform' | 'deletion' | null, active = false) => ({
      active,
      suspendedReason,
      deletedAt: null,
    });
    expect(reactivateCompanyError(c('platform'))).toBeNull();
    expect(reactivateCompanyError(c('overdue'))).toBe(
      'บริษัทค้างชำระ — บันทึกรับชำระใบแจ้งหนี้แทน',
    );
    expect(reactivateCompanyError(c('deletion'))).toContain('รอลบข้อมูล');
    expect(reactivateCompanyError(c(null, true))).toBe('บริษัทนี้ใช้งานอยู่แล้ว');
  });

  it('marks an open invoice paid once', () => {
    expect(payInvoiceError({ status: 'open' })).toBeNull();
    expect(payInvoiceError({ status: 'paid' })).toBe('ใบแจ้งหนี้นี้ชำระแล้ว');
  });
});
