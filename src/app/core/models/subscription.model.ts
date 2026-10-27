import { PlanId, PlanUsage } from './plan.model';
import { addDaysIso, fromIsoDate, toIsoDate } from './price.model';

/**
 * Billing of the SaaS itself (E35, SaaS step 6.5) — a mock: invoices are issued per month and
 * paid outside the system (the platform admin marks them paid); no payment gateway.
 *
 * trial → (first invoice at the end of the trial) → active while nothing is overdue → past_due
 * after the due date → suspended once the grace period is over (the company cannot log in).
 */
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended';

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: 'ทดลองใช้',
  active: 'ใช้งานปกติ',
  past_due: 'ค้างชำระ',
  suspended: 'ระงับ (ค้างชำระ)',
};

export const SUBSCRIPTION_STATUS_BADGE: Record<SubscriptionStatus, string> = {
  trial: 'badge',
  active: 'badge-success',
  past_due: 'badge-warn',
  suspended: 'badge-error',
};

/** Why a company is suspended (`Company.active` false): billing, the platform admin, deletion (E39). */
export type CompanySuspendReason = 'overdue' | 'platform' | 'deletion';

/** Days of the free trial after signing up. */
export const TRIAL_DAYS = 14;
/** An invoice is due this many days after it is issued. */
export const INVOICE_DUE_DAYS = 7;
/** Days after the due date before an unpaid company is suspended. */
export const GRACE_DAYS = 7;
/** A trial ending within this many days is announced. */
export const TRIAL_NOTICE_DAYS = 3;

/** The company's billing schedule (platform level, one per company). Local dates `YYYY-MM-DD`. */
export interface Subscription {
  /** Last day of the free trial; null = never had one (older companies) */
  trialEndsOn: string | null;
  /** Start of the next period to invoice (= the day its invoice is issued) */
  nextInvoiceOn: string;
}

/** `nextInvoiceOn` of a company never invoiced (the seed DEMO, C3-4) — shown as "ไม่มีกำหนด". */
export const NO_INVOICE_DATE = '9999-12-31';

/** False for a company that is never invoiced (`NO_INVOICE_DATE`). */
export const isInvoiced = (sub: Pick<Subscription, 'nextInvoiceOn'>): boolean =>
  sub.nextInvoiceOn !== NO_INVOICE_DATE;

export type BillingInvoiceStatus = 'open' | 'paid' | 'void';

export const BILLING_INVOICE_STATUS_LABEL: Record<BillingInvoiceStatus, string> = {
  open: 'รอชำระ',
  paid: 'ชำระแล้ว',
  void: 'ยกเลิก',
};

/** A monthly invoice of the SaaS to a company (not a tax document of the shop). */
export interface BillingInvoice {
  id: number;
  companyId: number;
  /** 'SUB-YYYYMM-NNNN' (month of issue, numbered platform-wide) */
  invoiceNo: string;
  /** Package of the period when issued (price snapshot in `amount`) */
  planId: PlanId;
  periodStart: string;
  periodEnd: string;
  /** Baht, VAT included */
  amount: number;
  issuedOn: string;
  dueDate: string;
  status: BillingInvoiceStatus;
  /** ISO time it was marked paid; null = not paid */
  paidAt: string | null;
}

/** The same day of the month `months` later (clamped to the month's last day). */
export function addMonthsIso(iso: string, months: number): string {
  const d = fromIsoDate(iso);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toIsoDate(new Date(target.getFullYear(), target.getMonth(), Math.min(day, last)));
}

/**
 * Periods whose invoice is due to be issued by `today` (at most 24, oldest first) and the
 * schedule's next start afterwards. Each period runs one month from its start.
 */
export function periodsToInvoice(
  nextInvoiceOn: string,
  today: string,
): { periods: { start: string; end: string }[]; nextInvoiceOn: string } {
  const periods: { start: string; end: string }[] = [];
  let start = nextInvoiceOn;
  while (start <= today && periods.length < 24) {
    const next = addMonthsIso(start, 1);
    periods.push({ start, end: addDaysIso(next, -1) });
    start = next;
  }
  return { periods, nextInvoiceOn: start };
}

/** Whole days from `from` to `to` (local dates; negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / 86_400_000);
}

/** The oldest unpaid invoice (it decides the status). */
export const oldestOpenInvoice = (invoices: readonly BillingInvoice[]): BillingInvoice | null =>
  [...invoices]
    .filter((i) => i.status === 'open')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;

/** Last day the company may still use the system with this invoice unpaid. */
export const suspendAfter = (invoice: Pick<BillingInvoice, 'dueDate'>): string =>
  addDaysIso(invoice.dueDate, GRACE_DAYS);

/** Status of a company's billing on a day (server + screens). */
export function subscriptionStatus(
  sub: Subscription,
  invoices: readonly BillingInvoice[],
  today: string,
): SubscriptionStatus {
  const open = oldestOpenInvoice(invoices);
  if (open) {
    if (today <= open.dueDate) return 'active';
    return today <= suspendAfter(open) ? 'past_due' : 'suspended';
  }
  if (sub.trialEndsOn && today <= sub.trialEndsOn) return 'trial';
  return 'active';
}

/** A banner for the owner / admins (null = nothing to say). */
export interface BillingNotice {
  level: 'info' | 'warn' | 'error';
  text: string;
}

/**
 * What the owner / admins are told on every page (MainLayout banner): a trial ending soon, an
 * invoice waiting, or an overdue one with the day the company will be suspended.
 */
export function billingNotice(
  sub: Subscription,
  invoices: readonly BillingInvoice[],
  today: string,
): BillingNotice | null {
  const status = subscriptionStatus(sub, invoices, today);
  const open = oldestOpenInvoice(invoices);
  if (status === 'trial' && sub.trialEndsOn) {
    const left = daysBetween(today, sub.trialEndsOn);
    if (left > TRIAL_NOTICE_DAYS) return null;
    return {
      level: 'warn',
      text: `ทดลองใช้เหลืออีก ${left} วัน (ถึง ${thaiDay(sub.trialEndsOn)}) — ใบแจ้งหนี้แรกออกวันที่ ${thaiDay(sub.nextInvoiceOn)}`,
    };
  }
  if (!open) return null;
  const amount = open.amount.toLocaleString('th-TH');
  if (status === 'past_due') {
    const last = suspendAfter(open);
    return {
      level: 'error',
      text: `ค้างชำระ ${open.invoiceNo} ฿${amount} (ครบกำหนด ${thaiDay(open.dueDate)}) — จะระงับการใช้งานหลังวันที่ ${thaiDay(last)} (อีก ${daysBetween(today, last)} วัน)`,
    };
  }
  return {
    level: 'info',
    text: `ใบแจ้งหนี้ ${open.invoiceNo} ฿${amount} ครบกำหนดชำระ ${thaiDay(open.dueDate)}`,
  };
}

/** `d/m/พ.ศ.` of a local date, for notice texts. */
function thaiDay(iso: string): string {
  const d = fromIsoDate(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;
}

/** `GET /company/subscription` (admins): package, usage and billing of the company. */
export interface SubscriptionInfo {
  planId: PlanId;
  usage: PlanUsage;
  status: SubscriptionStatus;
  subscription: Subscription;
  /** Newest first */
  invoices: BillingInvoice[];
}
