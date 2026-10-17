import type { Branch } from './company.model';

/**
 * POS terminal registry (docs/terminal-plan.md, decided 2026-10-12): one entry per cash drawer /
 * POS device. `id` is the terminal number sent as `X-Terminal-Id`; `posId` is the Revenue
 * Department's POS ID printed on the abbreviated tax invoices of that terminal (T1–T3).
 */
export interface PosTerminal {
  /** Terminal number 1, 2, 3 … — unique, cannot change once created */
  id: number;
  /** e.g. 'แคชเชียร์หน้าร้าน' */
  name: string;
  /** Revenue Department POS ID ('' = none); unique when set */
  posId: string;
  /** The branch the drawer stands in (T5 / E8); numbers stay unique company-wide */
  branchId: number;
  active: boolean;
}

export const POS_TERMINAL_DEFAULTS: PosTerminal = {
  id: 1,
  name: '',
  posId: '',
  branchId: 1,
  active: true,
};

/** Trims the text fields (form + mock). */
export function normalizePosTerminal(t: PosTerminal): PosTerminal {
  return { ...t, name: t.name.trim(), posId: t.posId.trim() };
}

/**
 * Single rule for the form and the server; `others` = every other terminal of the company. An
 * active terminal needs an active branch.
 */
export function posTerminalError(
  t: Pick<PosTerminal, 'id' | 'name' | 'posId' | 'branchId' | 'active'>,
  others: readonly Pick<PosTerminal, 'id' | 'posId'>[],
  branches: readonly Pick<Branch, 'id' | 'active'>[],
): string | null {
  if (!Number.isInteger(t.id) || t.id <= 0 || t.id > 999) {
    return 'เลขเครื่องต้องเป็นจำนวนเต็ม 1–999';
  }
  if (others.some((o) => o.id === t.id)) return `มีเครื่อง ${t.id} อยู่แล้ว`;
  const name = t.name.trim();
  if (!name) return 'กรุณากรอกชื่อเครื่อง';
  if (name.length > 40) return 'ชื่อเครื่องต้องไม่เกิน 40 ตัวอักษร';
  const posId = t.posId.trim();
  if (posId.length > 30) return 'POS ID ต้องไม่เกิน 30 ตัวอักษร';
  if (posId && others.some((o) => o.posId.trim() === posId)) {
    return `POS ID ${posId} ใช้กับเครื่องอื่นแล้ว`;
  }
  const branch = branches.find((b) => b.id === t.branchId);
  if (!branch) return 'กรุณาเลือกสาขาของเครื่อง';
  if (t.active && !branch.active)
    return 'สาขานี้ปิดใช้งานแล้ว เครื่องที่ใช้งานต้องอยู่สาขาที่ใช้งาน';
  return null;
}

/** 'เครื่อง 2 · แคชเชียร์หน้าร้าน' (just 'เครื่อง 2' when the name is unknown). */
export function terminalLabel(id: number, terminals: readonly PosTerminal[] = []): string {
  const name = terminals.find((t) => t.id === id)?.name;
  return name ? `เครื่อง ${id} · ${name}` : `เครื่อง ${id}`;
}

/**
 * Why this device cannot sell or open a shift (T2): it must be set to an active terminal of the
 * registry (Settings → "เครื่องนี้") standing in the working branch (E8; `branchId` null = not sent,
 * not checked). `branches` names the terminal's branch in the message (usually the wrong branch was
 * chosen); one the caller doesn't know is "สาขาอื่น". Single rule for the POS and the server; null = OK.
 */
export function terminalError(
  id: number | null,
  terminals: readonly Pick<PosTerminal, 'id' | 'active' | 'branchId'>[],
  branchId: number | null,
  branches: readonly Pick<Branch, 'id' | 'code' | 'name'>[] = [],
): string | null {
  if (id === null) {
    return 'เครื่องนี้ยังไม่ได้ตั้งเลขเครื่อง POS กรุณาให้ผู้ดูแลตั้งค่าที่เมนูตั้งค่า';
  }
  const terminal = terminals.find((t) => t.id === id);
  if (!terminal) return `ไม่พบเครื่อง ${id} ในทะเบียนเครื่อง POS กรุณาให้ผู้ดูแลตั้งค่าใหม่`;
  if (!terminal.active) return `เครื่อง ${id} ถูกปิดใช้งาน กรุณาให้ผู้ดูแลตั้งค่าใหม่`;
  if (branchId !== null && terminal.branchId !== branchId) {
    const own = branches.find((b) => b.id === terminal.branchId);
    return own
      ? `เครื่อง ${id} เป็นเครื่องของสาขา ${own.code} · ${own.name} — สลับไปสาขานั้น หรือให้ผู้ดูแลตั้งเครื่องนี้ใหม่`
      : `เครื่อง ${id} เป็นเครื่องของสาขาอื่น — สลับไปสาขาของเครื่อง หรือให้ผู้ดูแลตั้งเครื่องนี้ใหม่`;
  }
  return null;
}

/** A VAT-registered store's active terminal should have a POS ID (warning only). */
export const missingPosId = (t: PosTerminal, vatRegistered: boolean): boolean =>
  vatRegistered && t.active && !t.posId.trim();

/**
 * Bill number prefix, numbered per terminal and day (T4): `POS<terminal>-YYYYMMDD-`.
 * Bills from before the registry keep their old `POS-YYYYMMDD-NNNN` numbers.
 */
export const terminalOrderPrefix = (terminalId: number, day: string): string =>
  `POS${terminalId}-${day.replaceAll('-', '')}-`;
