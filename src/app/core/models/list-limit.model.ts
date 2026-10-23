import { addDaysIso } from './price.model';

/**
 * Response size limits of list endpoints (decided 2026-10-23, api plan "จำกัดขนาดคำตอบ"): lists
 * have no paging, so dated lists need a range of at most `MAX_RANGE_DAYS` and every list stops at
 * `MAX_LIST_ROWS` rows with a 400 (never cut silently — a report would be wrong unnoticed).
 */
export const MAX_RANGE_DAYS = 366;
export const MAX_LIST_ROWS = 20_000;

/**
 * A dated list's range (after the format / order checks): both ends required, at most
 * `MAX_RANGE_DAYS` days counting both ends. null = fine.
 */
export function dateRangeError(from: string | null, to: string | null): string | null {
  if (!from || !to) return `กรุณาเลือกช่วงวันที่ (ไม่เกิน ${MAX_RANGE_DAYS} วัน)`;
  return addDaysIso(from, MAX_RANGE_DAYS - 1) < to
    ? `ช่วงวันที่ต้องไม่เกิน ${MAX_RANGE_DAYS} วัน`
    : null;
}

/** 400 when a list has more than `MAX_LIST_ROWS` rows; `dated` = the list takes a date range. */
export const tooManyRowsError = (dated: boolean): string =>
  `ข้อมูลมากกว่า ${MAX_LIST_ROWS.toLocaleString('en-US')} รายการ กรุณา${
    dated ? 'เลือกช่วงวันที่ให้สั้นลง' : 'กรองให้แคบลง'
  }`;

/** The rows, or the 400 message when there are too many. */
export function rowLimitError(rows: readonly unknown[], dated: boolean): string | null {
  return rows.length > MAX_LIST_ROWS ? tooManyRowsError(dated) : null;
}
