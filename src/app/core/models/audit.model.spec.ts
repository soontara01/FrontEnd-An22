import {
  AuditEvent,
  AuditQuery,
  auditBaht,
  auditBranchCodes,
  canSeeAuditEvent,
  companySettingsChanges,
  filterAuditEvents,
  parseAuditQuery,
} from './audit.model';
import { COMPANY_INFO_DEFAULTS } from './company.model';

describe('audit log (E40)', () => {
  const event = (
    id: number,
    at: string,
    branchId: number | null,
    extra: Partial<AuditEvent> = {},
  ) =>
    ({
      id,
      at,
      actorKind: 'user',
      userId: 1,
      userName: 'Admin',
      branchId,
      terminalId: null,
      action: 'price_change',
      ref: null,
      detail: '',
      ...extra,
    }) as AuditEvent;
  const owner = { role: 'owner' as const, allBranches: true, branchIds: [] };
  const companyAdmin = { role: 'admin' as const, allBranches: true, branchIds: [] };
  const branchAdmin = { role: 'admin' as const, allBranches: false, branchIds: [2] };
  const staff = { role: 'user' as const, allBranches: true, branchIds: [] };

  it('shows company admins everything, branch admins their branches only, staff nothing', () => {
    const company = event(1, '2026-10-18T03:00:00Z', null);
    const bn = event(2, '2026-10-18T03:00:00Z', 2);
    const hq = event(3, '2026-10-18T03:00:00Z', 1);
    expect([company, bn, hq].map((e) => canSeeAuditEvent(e, owner))).toEqual([true, true, true]);
    expect([company, bn, hq].map((e) => canSeeAuditEvent(e, companyAdmin))).toEqual([
      true,
      true,
      true,
    ]);
    expect([company, bn, hq].map((e) => canSeeAuditEvent(e, branchAdmin))).toEqual([
      false,
      true,
      false,
    ]);
    expect(canSeeAuditEvent(bn, staff)).toBe(false);
  });

  it('filters by local date, action, user and branch, newest first', () => {
    const events = [
      event(1, '2026-10-16T05:00:00Z', 1),
      event(2, '2026-10-17T05:00:00Z', 2, { action: 'sale_void', userId: 2 }),
      event(3, '2026-10-18T05:00:00Z', 1),
    ];
    const all: AuditQuery = { from: null, to: null, action: null, userId: null, branchId: null };
    expect(filterAuditEvents(events, all, owner).map((e) => e.id)).toEqual([3, 2, 1]);
    const ids = (q: Partial<AuditQuery>) =>
      filterAuditEvents(events, { ...all, ...q }, owner).map((e) => e.id);
    expect(ids({ from: '2026-10-17' })).toEqual([3, 2]);
    expect(ids({ to: '2026-10-16' })).toEqual([1]);
    expect(ids({ action: 'sale_void' })).toEqual([2]);
    expect(ids({ userId: 1 })).toEqual([3, 1]);
    expect(ids({ branchId: 1 })).toEqual([3, 1]);
  });

  it('reads the query, ignoring anything odd', () => {
    const params: Record<string, string> = {
      from: '2026-10-01',
      to: 'x',
      action: 'sale_void',
      userId: '2',
      branchId: 'abc',
    };
    expect(parseAuditQuery((n) => params[n] ?? null)).toEqual({
      from: '2026-10-01',
      to: null,
      action: 'sale_void',
      userId: 2,
      branchId: null,
    });
    expect(parseAuditQuery((n) => (n === 'action' ? 'drop_table' : null)).action).toBeNull();
  });
});

describe('audit details (C3-5)', () => {
  it('writes money with a thousands separator', () => {
    expect(auditBaht(1490)).toBe('฿1,490');
    expect(auditBaht(50)).toBe('฿50');
  });

  it('names branches by code', () => {
    const branches = [
      { id: 1, code: 'HQ' },
      { id: 3, code: 'BN' },
    ];
    expect(auditBranchCodes([3, 1], branches)).toBe('BN, HQ');
    expect(auditBranchCodes([9], branches)).toBe('#9');
  });

  it('lists only the company settings that changed', () => {
    const before = { ...COMPANY_INFO_DEFAULTS, name: 'ร้าน', taxId: '0105550123451' };
    expect(companySettingsChanges(before, { ...before, staffSeeCost: true })).toBe(
      'ผู้ใช้ทั่วไปเห็นทุน / กำไร: ปิด → เปิด',
    );
    expect(
      companySettingsChanges(before, {
        ...before,
        vatRegistered: false,
        shiftVarianceLimit: 1500,
        exchangeDays: 0,
        taxInvoicePaper: '80mm',
      }),
    ).toBe(
      'จด VAT: จด → ไม่จด · กระดาษใบกำกับภาษี: A4 → 80 มม. · เปลี่ยนสินค้าได้ภายใน: 7 วัน → ไม่จำกัด · ส่วนต่างที่ต้องให้ admin อนุมัติ: ฿100 → ฿1,500',
    );
    expect(companySettingsChanges(before, { ...before })).toBe('บันทึกโดยไม่มีการเปลี่ยนแปลง');
    expect(companySettingsChanges(COMPANY_INFO_DEFAULTS, before)).toBe(
      'ชื่อผู้ประกอบการ: - → ร้าน · เลขประจำตัวผู้เสียภาษี: - → 0105550123451',
    );
  });
});
