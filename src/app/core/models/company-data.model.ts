import { normalizeCompanyCode } from './company.model';
import { fromIsoDate } from './price.model';

/**
 * A company's own data (E38 / E39, SaaS step 6.8, PDPA): the owner downloads all of it as one JSON
 * file, and may ask for it to be deleted — the company is suspended at once (only the owner still
 * logs in, to download or cancel) and the platform deletes it after `DELETION_WAIT_DAYS`.
 */
export const EXPORT_SCHEMA_VERSION = 1;

/** `GET /company/export` (owner): every collection of the company; never a password. */
export interface CompanyExport {
  schemaVersion: number;
  /** ISO time */
  exportedAt: string;
  company: { id: number; code: string; name: string; taxId: string };
  /** Collection name → its records, as stored (field names = the TypeScript models) */
  data: Record<string, unknown>;
}

/** Days between asking for deletion and the platform deleting the data. */
export const DELETION_WAIT_DAYS = 30;

/** A pending deletion request (platform level, on the company). */
export interface CompanyDeletion {
  /** ISO time */
  requestedAt: string;
  requestedBy: string;
  reason: string;
  /** First local day the platform may delete the data */
  purgeAfter: string;
}

/** `POST /company/deletion` (owner): typed company code + own password as confirmation. */
export interface DeletionRequest {
  companyCode: string;
  password: string;
  reason: string;
}

/** The confirmation the deletion form asks for (the password itself is checked by the server). */
export function deletionRequestError(p: DeletionRequest, companyCode: string): string | null {
  if (normalizeCompanyCode(p.companyCode) !== normalizeCompanyCode(companyCode)) {
    return 'พิมพ์รหัสบริษัทให้ตรงเพื่อยืนยัน';
  }
  if (!p.password) return 'กรุณากรอกรหัสผ่านเพื่อยืนยัน';
  return null;
}

/** Whether the platform may delete the company's data today (E39). */
export function purgeError(
  deletion: CompanyDeletion | null | undefined,
  today: string,
): string | null {
  if (!deletion) return 'บริษัทนี้ไม่ได้ขอลบข้อมูล';
  if (today < deletion.purgeAfter) {
    const d = fromIsoDate(deletion.purgeAfter);
    return `ลบข้อมูลได้ตั้งแต่วันที่ ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;
  }
  return null;
}
