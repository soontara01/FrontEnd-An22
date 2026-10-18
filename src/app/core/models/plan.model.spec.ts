import { PLANS, overLimits, planLimitError, planOf, planUsage } from './plan.model';

describe('packages (E34)', () => {
  const starter = planOf('starter');
  const usage = (branches: number, users: number, terminals: number) => ({
    branches,
    users,
    terminals,
  });

  it('counts only active records', () => {
    const on = { active: true };
    const off = { active: false };
    expect(planUsage({ branches: [on, off], users: [on, on, off], terminals: [] })).toEqual(
      usage(1, 2, 0),
    );
  });

  it('refuses one more past the limit, never on an unlimited package', () => {
    expect(planLimitError('branches', starter, usage(0, 0, 0))).toBeNull();
    expect(planLimitError('branches', starter, usage(1, 0, 0))).toBe(
      'แพ็กเกจ Starter ใช้สาขาได้ 1 สาขา — เปลี่ยนแพ็กเกจได้ที่เมนูบัญชีบริษัท',
    );
    expect(planLimitError('users', starter, usage(1, 4, 0))).toBeNull();
    expect(planLimitError('users', starter, usage(1, 5, 0))).not.toBeNull();
    expect(planLimitError('terminals', planOf('pro'), usage(99, 999, 99))).toBeNull();
  });

  it('flags what a downgrade left over the limit; unknown ids are the smallest package', () => {
    expect(overLimits(starter, usage(2, 5, 3))).toEqual(['branches', 'terminals']);
    expect(overLimits(planOf('pro'), usage(9, 9, 9))).toEqual([]);
    expect(planOf('gold')).toBe(PLANS[0]);
  });
});
