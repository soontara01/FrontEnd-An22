import {
  AuditEvent,
  AuditQuery,
  canSeeAuditEvent,
  filterAuditEvents,
  parseAuditQuery,
} from './audit.model';

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
