import type { CompanyInfo } from './company.model';
import { toIsoDate } from './price.model';
import { User, canWorkIn, isCompanyAdmin, hasAdminRights } from './user.model';

/**
 * Audit log of a company (E40, SaaS step 6.3): important events only, append-only — never edited
 * or deleted (a real API: insert-only table, no UPDATE / DELETE grant). Written by the server.
 */
export type AuditAction =
  | 'login'
  | 'login_failed'
  | 'sale_void'
  | 'manual_discount'
  | 'credit_note'
  | 'tax_invoice_reissue'
  | 'stock_out'
  | 'serial_remove'
  | 'transfer_cancel'
  | 'price_change'
  | 'promotion_change'
  | 'user_change'
  | 'user_password'
  | 'owner_transfer'
  | 'plan_change'
  | 'signup'
  | 'company_suspend'
  | 'company_reactivate'
  | 'invoice_paid'
  | 'company_export'
  | 'deletion_request'
  | 'deletion_cancel'
  | 'password_reset'
  | 'menu_access'
  | 'company_settings'
  | 'branch_settings'
  | 'branch_change'
  | 'terminal_change'
  | 'shift_close_other'
  | 'shift_approve'
  | 'shift_adjust';

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  login: 'เข้าสู่ระบบ',
  login_failed: 'เข้าสู่ระบบไม่สำเร็จ',
  sale_void: 'ยกเลิกบิล',
  manual_discount: 'ส่วนลดพิเศษ',
  credit_note: 'ออกใบลดหนี้',
  tax_invoice_reissue: 'ยกเลิก-ออกใบกำกับภาษีใหม่',
  stock_out: 'ตัดสต็อกออก',
  serial_remove: 'ตัด Serial ออก',
  transfer_cancel: 'ยกเลิกใบโอน',
  price_change: 'แก้ราคาขาย',
  promotion_change: 'แก้โปรโมชั่น',
  user_change: 'แก้ผู้ใช้',
  user_password: 'ตั้งรหัสผ่านใหม่',
  owner_transfer: 'โอนความเป็นเจ้าของ',
  plan_change: 'เปลี่ยนแพ็กเกจ',
  signup: 'สมัครใช้งาน',
  company_suspend: 'ระงับบริษัท',
  company_reactivate: 'เปิดใช้งานบริษัทอีกครั้ง',
  invoice_paid: 'รับชำระค่าบริการ',
  company_export: 'ดาวน์โหลดข้อมูลทั้งบริษัท',
  deletion_request: 'ขอลบข้อมูลบริษัท',
  deletion_cancel: 'ยกเลิกคำขอลบข้อมูล',
  password_reset: 'ตั้งรหัสผ่านใหม่ (ลิงก์อีเมล)',
  menu_access: 'แก้สิทธิ์เมนู',
  company_settings: 'แก้ตั้งค่าบริษัท',
  branch_settings: 'แก้ข้อมูลสาขา (ตั้งค่า)',
  branch_change: 'เพิ่ม / แก้สาขา',
  terminal_change: 'เพิ่ม / แก้เครื่อง POS',
  shift_close_other: 'ปิดกะแทน',
  shift_approve: 'อนุมัติส่วนต่างกะ',
  shift_adjust: 'ปรับปรุงกะ',
};

/** Who did it: a user of the company, the SaaS operator (platform admin) or the system itself. */
export type AuditActorKind = 'user' | 'platform' | 'system';

/** The record an event is about (shown as a label; `id` may point to a page). */
export interface AuditRef {
  kind:
    | 'sale'
    | 'credit_note'
    | 'tax_invoice'
    | 'product'
    | 'transfer'
    | 'price'
    | 'promotion'
    | 'user'
    | 'branch'
    | 'terminal'
    | 'shift'
    | 'company';
  id: number | null;
  /** Document number / SKU / username … as it was then */
  label: string;
}

export interface AuditEvent {
  id: number;
  /** ISO time */
  at: string;
  actorKind: AuditActorKind;
  /** null = not a user of the company (platform / system, or a failed login) */
  userId: number | null;
  /** Name as it was then (a failed login: the username typed) */
  userName: string;
  /** Branch the event belongs to; null = company-level (only company admins see it) */
  branchId: number | null;
  terminalId: number | null;
  action: AuditAction;
  ref: AuditRef | null;
  /** Short Thai description (reason, amounts, what changed) */
  detail: string;
}

/** `GET /audit-log` filters: local dates (inclusive), one action, one user, one branch. */
export interface AuditQuery {
  from: string | null;
  to: string | null;
  action: AuditAction | null;
  userId: number | null;
  branchId: number | null;
}

/**
 * Who sees an event (E40): the owner and company admins every event; a branch admin only the
 * events of a branch they work in (not company-level ones); everyone else none.
 */
export function canSeeAuditEvent(
  event: Pick<AuditEvent, 'branchId'>,
  viewer: Pick<User, 'role' | 'allBranches' | 'branchIds'>,
): boolean {
  if (isCompanyAdmin(viewer)) return true;
  if (!hasAdminRights(viewer) || event.branchId === null) return false;
  return canWorkIn(viewer, { id: event.branchId, active: true });
}

/** The events a viewer may see that match the query, newest first (server + its tests). */
export function filterAuditEvents(
  events: readonly AuditEvent[],
  query: AuditQuery,
  viewer: Pick<User, 'role' | 'allBranches' | 'branchIds'>,
): AuditEvent[] {
  const day = (e: AuditEvent) => toIsoDate(new Date(e.at));
  return events
    .filter((e) => canSeeAuditEvent(e, viewer))
    .filter((e) => !query.from || day(e) >= query.from)
    .filter((e) => !query.to || day(e) <= query.to)
    .filter((e) => !query.action || e.action === query.action)
    .filter((e) => query.userId === null || e.userId === query.userId)
    .filter((e) => query.branchId === null || e.branchId === query.branchId)
    .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);
}

/** Reads `?from=&to=&action=&userId=&branchId=` of `GET /audit-log` (anything odd = not filtered). */
export function parseAuditQuery(get: (name: string) => string | null): AuditQuery {
  const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const id = (v: string | null) => (v && Number.isInteger(Number(v)) ? Number(v) : null);
  const action = get('action');
  return {
    from: date(get('from')),
    to: date(get('to')),
    action: action && action in AUDIT_ACTION_LABEL ? (action as AuditAction) : null,
    userId: id(get('userId')),
    branchId: id(get('branchId')),
  };
}

/** "฿1,490" — money in an audit detail (C3-5). */
export const auditBaht = (amount: number): string => `฿${amount.toLocaleString('en-US')}`;

/** "HQ, BN" — a user's branches by code, never by id (C3-5); an unknown id stays as `#id`. */
export const auditBranchCodes = (
  ids: readonly number[],
  branches: readonly { id: number; code: string }[],
): string => ids.map((id) => branches.find((b) => b.id === id)?.code ?? `#${id}`).join(', ');

const onOff = (v: boolean): string => (v ? 'เปิด' : 'ปิด');

/** Settings-page labels of the company settings an audit entry names, with how each value reads. */
const COMPANY_SETTING_TEXT: { [K in keyof CompanyInfo]: [string, (v: CompanyInfo[K]) => string] } =
  {
    name: ['ชื่อผู้ประกอบการ', (v) => v || '-'],
    taxId: ['เลขประจำตัวผู้เสียภาษี', (v) => v || '-'],
    vatRegistered: ['จด VAT', (v) => (v ? 'จด' : 'ไม่จด')],
    taxInvoicePaper: ['กระดาษใบกำกับภาษี', (v) => (v === '80mm' ? '80 มม.' : v)],
    exchangeDays: ['เปลี่ยนสินค้าได้ภายใน', (v) => (v === 0 ? 'ไม่จำกัด' : `${v} วัน`)],
    manualDiscountMaxPercent: ['ส่วนลดพิเศษที่พนักงานให้ได้สูงสุด', (v) => `${v}%`],
    requireShift: ['ใช้ระบบกะ', onOff],
    shiftVarianceLimit: ['ส่วนต่างที่ต้องให้ admin อนุมัติ', auditBaht],
    shiftMaxHours: ['เตือนเมื่อกะเปิดนานเกิน', (v) => `${v} ชม.`],
    staffSeeCost: ['ผู้ใช้ทั่วไปเห็นทุน / กำไร', onOff],
  };

/**
 * Detail of a `company_settings` entry: only what changed, "ป้าย: เดิม → ใหม่" joined by " · "
 * (C3-5 — it used to list VAT / shifts / discount whatever changed).
 */
export function companySettingsChanges(before: CompanyInfo, after: CompanyInfo): string {
  const changes = (Object.keys(COMPANY_SETTING_TEXT) as (keyof CompanyInfo)[])
    .filter((key) => before[key] !== after[key])
    .map((key) => {
      const [label, text] = COMPANY_SETTING_TEXT[key] as [string, (v: unknown) => string];
      return `${label}: ${text(before[key])} → ${text(after[key])}`;
    });
  return changes.length ? changes.join(' · ') : 'บันทึกโดยไม่มีการเปลี่ยนแปลง';
}
