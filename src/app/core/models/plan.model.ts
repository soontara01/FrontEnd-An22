/**
 * SaaS packages (E34, SaaS step 6.4): fixed in code, each limiting how many active branches, users
 * and POS terminals a company has. Over the limit the server refuses adding one more or turning one
 * back on (403); what is already over stays usable (a downgrade only stops adding).
 */
export type PlanId = 'starter' | 'standard' | 'pro';

/** What a package counts — only active records. */
export type LimitKind = 'branches' | 'users' | 'terminals';

export interface Plan {
  id: PlanId;
  name: string;
  /** Baht per month, VAT included */
  monthlyPrice: number;
  /** null = unlimited */
  limits: Record<LimitKind, number | null>;
}

export const PLANS: readonly Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 590,
    limits: { branches: 1, users: 5, terminals: 2 },
  },
  {
    id: 'standard',
    name: 'Standard',
    monthlyPrice: 1490,
    limits: { branches: 3, users: 20, terminals: 10 },
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 3490,
    limits: { branches: null, users: null, terminals: null },
  },
];

export const LIMIT_LABEL: Record<LimitKind, { noun: string; unit: string }> = {
  branches: { noun: 'สาขา', unit: 'สาขา' },
  users: { noun: 'ผู้ใช้ที่ใช้งาน', unit: 'คน' },
  terminals: { noun: 'เครื่อง POS ที่ใช้งาน', unit: 'เครื่อง' },
};

/** The package of an id; an unknown one counts as the smallest. */
export const planOf = (id: PlanId | string | null | undefined): Plan =>
  PLANS.find((p) => p.id === id) ?? PLANS[0];

/** Active records per kind. */
export type PlanUsage = Record<LimitKind, number>;

export function planUsage(data: {
  branches: readonly { active: boolean }[];
  users: readonly { active: boolean }[];
  terminals: readonly { active: boolean }[];
}): PlanUsage {
  const active = (list: readonly { active: boolean }[]) => list.filter((x) => x.active).length;
  return {
    branches: active(data.branches),
    users: active(data.users),
    terminals: active(data.terminals),
  };
}

/**
 * Whether one more active record of a kind fits the package (server → 403, screens disable the
 * add button). Thai message or null.
 */
export function planLimitError(kind: LimitKind, plan: Plan, usage: PlanUsage): string | null {
  const limit = plan.limits[kind];
  if (limit === null || usage[kind] < limit) return null;
  const { noun, unit } = LIMIT_LABEL[kind];
  return `แพ็กเกจ ${plan.name} ใช้${noun}ได้ ${limit} ${unit} — เปลี่ยนแพ็กเกจได้ที่เมนูบัญชีบริษัท`;
}

/** Kinds already over the package (after a downgrade): shown as a warning, nothing is blocked. */
export const overLimits = (plan: Plan, usage: PlanUsage): LimitKind[] =>
  (Object.keys(LIMIT_LABEL) as LimitKind[]).filter((k) => {
    const limit = plan.limits[k];
    return limit !== null && usage[k] > limit;
  });

/** `GET /company/subscription` (admins): the package and what the company uses of it. */
export interface SubscriptionInfo {
  planId: PlanId;
  usage: PlanUsage;
}
