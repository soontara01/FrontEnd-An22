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
  active: boolean;
}

export const POS_TERMINAL_DEFAULTS: PosTerminal = { id: 1, name: '', posId: '', active: true };

/** Trims the text fields (form + mock). */
export function normalizePosTerminal(t: PosTerminal): PosTerminal {
  return { ...t, name: t.name.trim(), posId: t.posId.trim() };
}

/** Single rule for the form and the server; `others` = every other terminal. */
export function posTerminalError(
  t: Pick<PosTerminal, 'id' | 'name' | 'posId'>,
  others: readonly Pick<PosTerminal, 'id' | 'posId'>[],
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
  return null;
}

/** 'เครื่อง 2 · แคชเชียร์หน้าร้าน' (just 'เครื่อง 2' when the name is unknown). */
export function terminalLabel(id: number, terminals: readonly PosTerminal[] = []): string {
  const name = terminals.find((t) => t.id === id)?.name;
  return name ? `เครื่อง ${id} · ${name}` : `เครื่อง ${id}`;
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
