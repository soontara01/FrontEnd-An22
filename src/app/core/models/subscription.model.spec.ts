import {
  BillingInvoice,
  addMonthsIso,
  billingNotice,
  NO_INVOICE_DATE,
  daysBetween,
  isInvoiced,
  periodsToInvoice,
  subscriptionStatus,
} from './subscription.model';

describe('billing (E35)', () => {
  const invoice = (dueDate: string, status: BillingInvoice['status'] = 'open'): BillingInvoice => ({
    id: 1,
    companyId: 1,
    invoiceNo: 'SUB-202610-0001',
    planId: 'starter',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    amount: 590,
    issuedOn: '2026-10-01',
    dueDate,
    status,
    paidAt: null,
  });
  const sub = { trialEndsOn: '2026-10-14', nextInvoiceOn: '2026-10-15' };

  it('adds months keeping the day, clamped to the month end', () => {
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsIso('2026-10-15', 3)).toBe('2027-01-15');
    expect(daysBetween('2026-10-18', '2026-10-21')).toBe(3);
  });

  it('lists the monthly periods reached by today', () => {
    expect(periodsToInvoice('2026-09-15', '2026-10-18')).toEqual({
      periods: [
        { start: '2026-09-15', end: '2026-10-14' },
        { start: '2026-10-15', end: '2026-11-14' },
      ],
      nextInvoiceOn: '2026-11-15',
    });
    expect(periodsToInvoice('2026-11-01', '2026-10-18').periods).toEqual([]);
  });

  it('goes trial → active → past_due → suspended, and back to active once paid', () => {
    expect(subscriptionStatus(sub, [], '2026-10-14')).toBe('trial');
    expect(subscriptionStatus(sub, [], '2026-10-15')).toBe('active');
    const open = [invoice('2026-10-22')];
    expect(subscriptionStatus(sub, open, '2026-10-22')).toBe('active');
    expect(subscriptionStatus(sub, open, '2026-10-23')).toBe('past_due');
    expect(subscriptionStatus(sub, open, '2026-10-29')).toBe('past_due');
    expect(subscriptionStatus(sub, open, '2026-10-30')).toBe('suspended');
    expect(subscriptionStatus(sub, [invoice('2026-10-22', 'paid')], '2026-10-30')).toBe('active');
  });

  it('tells the owner about a trial ending, an invoice waiting or an overdue one', () => {
    expect(billingNotice(sub, [], '2026-10-10')).toBeNull();
    expect(billingNotice(sub, [], '2026-10-12')).toEqual({
      level: 'warn',
      text: 'ทดลองใช้เหลืออีก 2 วัน (ถึง 14/10/2569) — ใบแจ้งหนี้แรกออกวันที่ 15/10/2569',
    });
    const open = [invoice('2026-10-22')];
    expect(billingNotice(sub, open, '2026-10-20')?.level).toBe('info');
    expect(billingNotice(sub, open, '2026-10-25')).toEqual({
      level: 'error',
      text: 'ค้างชำระ SUB-202610-0001 ฿590 (ครบกำหนด 22/10/2569) — จะระงับการใช้งานหลังวันที่ 29/10/2569 (อีก 4 วัน)',
    });
    expect(billingNotice(sub, [invoice('2026-10-22', 'paid')], '2026-10-25')).toBeNull();
  });
});

describe('isInvoiced (C3-4)', () => {
  it('is false only for the never-invoiced date', () => {
    expect(isInvoiced({ nextInvoiceOn: NO_INVOICE_DATE })).toBe(false);
    expect(isInvoiced({ nextInvoiceOn: '2026-11-01' })).toBe(true);
  });
});
