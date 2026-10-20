import { PlanId, PlanUsage } from './plan.model';
import { CompanyDeletion } from './company-data.model';
import {
  BillingInvoice,
  CompanySuspendReason,
  Subscription,
  SubscriptionStatus,
} from './subscription.model';

/**
 * The SaaS operator's pages (E36, SaaS step 6.7): platform admins are not users of any company —
 * own login (`POST /platform/auth/login`), own token, own pages under `/platform`.
 */
export interface PlatformAdmin {
  id: number;
  username: string;
  name: string;
}

/** The platform admin's token stays in the web server's session (E48). */
export interface PlatformLoginResponse {
  admin: PlatformAdmin;
}

export const SUSPEND_REASON_LABEL: Record<CompanySuspendReason, string> = {
  overdue: 'ค้างชำระ',
  platform: 'ผู้ให้บริการระงับ',
  deletion: 'รอลบข้อมูล',
};

/** One company in `GET /platform/companies`. */
export interface PlatformCompanyRow {
  id: number;
  code: string;
  name: string;
  taxId: string;
  planId: PlanId;
  active: boolean;
  suspendedReason: CompanySuspendReason | null;
  status: SubscriptionStatus;
  usage: PlanUsage;
  subscription: Subscription;
  /** Unpaid invoices, baht */
  openAmount: number;
  /** Its data was deleted (E39); the row stays so the code is never reused */
  deletedAt: string | null;
  /** The owner's pending deletion request (E39) */
  deletion: CompanyDeletion | null;
}

/** `GET /platform/companies/:id`: the row + its invoices, owner and suspension note. */
export interface PlatformCompanyDetail extends PlatformCompanyRow {
  invoices: BillingInvoice[];
  owner: { id: number; name: string; username: string; email: string } | null;
  suspendNote: string;
}

/** An e-mail the platform "sent" (mock outbox, E41). */
export interface PlatformEmail {
  id: number;
  at: string;
  companyId: number;
  to: string;
  subject: string;
  body: string;
}

/** Suspending a company by the platform admin: an active one, with a reason. */
export function suspendCompanyError(
  company: Pick<PlatformCompanyRow, 'active' | 'deletedAt'>,
  note: string,
): string | null {
  if (company.deletedAt) return 'บริษัทนี้ถูกลบข้อมูลแล้ว';
  if (!company.active) return 'บริษัทนี้ถูกระงับอยู่แล้ว';
  if (!note.trim()) return 'กรุณากรอกเหตุผลที่ระงับ';
  return null;
}

/**
 * Turning a suspended company back on: only one the platform suspended — an overdue one comes back
 * by paying its invoices, one waiting for deletion only when its owner cancels (E39).
 */
export function reactivateCompanyError(
  company: Pick<PlatformCompanyRow, 'active' | 'suspendedReason' | 'deletedAt'>,
): string | null {
  if (company.deletedAt) return 'บริษัทนี้ถูกลบข้อมูลแล้ว';
  if (company.active) return 'บริษัทนี้ใช้งานอยู่แล้ว';
  if (company.suspendedReason === 'overdue') return 'บริษัทค้างชำระ — บันทึกรับชำระใบแจ้งหนี้แทน';
  if (company.suspendedReason === 'deletion') {
    return 'บริษัทอยู่ระหว่างรอลบข้อมูล — ให้เจ้าของบริษัทยกเลิกคำขอลบ';
  }
  return null;
}

/** Marking an invoice paid (money received outside the system, E35). */
export function payInvoiceError(invoice: Pick<BillingInvoice, 'status'>): string | null {
  if (invoice.status === 'paid') return 'ใบแจ้งหนี้นี้ชำระแล้ว';
  if (invoice.status === 'void') return 'ใบแจ้งหนี้นี้ถูกยกเลิกแล้ว';
  return null;
}
