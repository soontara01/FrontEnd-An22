import { isValidThaiTaxId } from './supplier.model';

/**
 * Payment method master (decided 2026-10-04): the tender buttons of the future POS.
 * One bill may be split over several methods; only cash may exceed its share (= change).
 */
export type PaymentType =
  'cash' | 'card' | 'qr' | 'transfer' | 'e_wallet' | 'installment' | 'other';

/** Cash rounding of the cash part of a bill: none, to 0.25 baht or to whole baht (nearest). */
export type CashRounding = 'none' | '0.25' | '1';

export interface PaymentMethod {
  id: number;
  /** Unique, A-Z 0-9 - */
  code: string;
  /** POS button / receipt text, at most 20 characters */
  name: string;
  type: PaymentType;
  active: boolean;
  /** POS button order (ascending) */
  sortOrder: number;
  /** Cashier must enter a reference (approval code, transfer ref, …) */
  requireReference: boolean;
  /** Label of that reference field, e.g. 'เลขอนุมัติ' */
  referenceLabel: string;
  /** Per payment line, VAT-inclusive baht (0 = none) */
  minAmount: number;
  /** null = no limit */
  maxAmount: number | null;
  /** Fee charged to the store (MDR) in %, for net-received reports; 0 for cash */
  feePercent: number;
  /** cash only */
  cashRounding: CashRounding;
  /** qr only: PromptPay mobile (10 digits) or tax ID (13 digits) */
  promptPayId: string;
  /** qr / transfer: receiving account, for reconciliation */
  bankAccount: string;
  /** installment only: selectable terms in months */
  installmentMonths: number[];
  note: string;
}

export type PaymentMethodPayload = Omit<PaymentMethod, 'id'>;

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  cash: 'เงินสด',
  card: 'บัตรเครดิต/เดบิต',
  qr: 'QR พร้อมเพย์',
  transfer: 'โอนเงิน',
  e_wallet: 'e-Wallet',
  installment: 'ผ่อนชำระ',
  other: 'อื่น ๆ',
};

export const PAYMENT_TYPE_ICON: Record<PaymentType, string> = {
  cash: 'payments',
  card: 'credit_card',
  qr: 'qr_code_2',
  transfer: 'account_balance',
  e_wallet: 'account_balance_wallet',
  installment: 'calendar_month',
  other: 'more_horiz',
};

export const CASH_ROUNDING_LABEL: Record<CashRounding, string> = {
  none: 'ไม่ปัดเศษ',
  '0.25': 'ปัดเป็น 25 สตางค์',
  '1': 'ปัดเป็นบาท',
};

export const PAYMENT_NAME_MAX = 20;
export const PAYMENT_FEE_MAX = 10;

/** Defaults for a new method and for fields missing from older stored data. */
export const PAYMENT_METHOD_DEFAULTS: Omit<PaymentMethod, 'id' | 'code' | 'name' | 'type'> = {
  active: true,
  sortOrder: 0,
  requireReference: false,
  referenceLabel: '',
  minAmount: 0,
  maxAmount: null,
  feePercent: 0,
  cashRounding: 'none',
  promptPayId: '',
  bankAccount: '',
  installmentMonths: [],
  note: '',
};

/** Only cash can be over-tendered; the excess is change. */
export const allowsChange = (m: Pick<PaymentMethod, 'type'>): boolean => m.type === 'cash';

/** The cash drawer opens for cash payments only. */
export const opensDrawer = (m: Pick<PaymentMethod, 'type'>): boolean => m.type === 'cash';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Rounds a cash amount to the nearest step of the rounding rule. */
export function roundCash(amount: number, rounding: CashRounding): number {
  if (rounding === 'none') return round2(amount);
  const step = rounding === '1' ? 1 : 0.25;
  return round2(Math.round(amount / step) * step);
}

/** Amount the store actually receives after the method's fee. */
export const netReceived = (amount: number, m: Pick<PaymentMethod, 'feePercent'>): number =>
  round2(amount * (1 - m.feePercent / 100));

/** PromptPay ID: mobile number (10 digits starting with 0) or a valid 13-digit tax ID. */
export function isValidPromptPayId(id: string): boolean {
  const digits = id.replace(/[\s-]/g, '');
  return /^0\d{9}$/.test(digits) || (digits.length === 13 && isValidThaiTaxId(digits));
}

/**
 * Clears fields the type does not use (cash: no fee/reference; only qr has a PromptPay ID; …).
 * Shared by the form and the mock so stored data never carries stale type-specific values.
 */
export function withPaymentTypeRules<T extends PaymentMethodPayload>(p: T): T {
  const cash = p.type === 'cash';
  return {
    ...p,
    feePercent: cash ? 0 : p.feePercent,
    requireReference: cash ? false : p.requireReference,
    referenceLabel: !cash && p.requireReference ? p.referenceLabel.trim() : '',
    cashRounding: cash ? p.cashRounding : 'none',
    promptPayId: p.type === 'qr' ? p.promptPayId.replace(/[\s-]/g, '') : '',
    bankAccount: p.type === 'qr' || p.type === 'transfer' ? p.bankAccount.trim() : '',
    installmentMonths:
      p.type === 'installment' ? [...new Set(p.installmentMonths)].sort((a, b) => a - b) : [],
  };
}

const isActiveCash = (m: Pick<PaymentMethod, 'type' | 'active'>) => m.type === 'cash' && m.active;

/**
 * True when `id` is the only active cash method — it may not be deactivated, retyped or
 * deleted (the POS always needs cash, e.g. for change).
 */
export const isLastActiveCash = (methods: readonly PaymentMethod[], id: number): boolean => {
  const target = methods.find((m) => m.id === id);
  return !!target && isActiveCash(target) && !methods.some((m) => m.id !== id && isActiveCash(m));
};

/**
 * The single validation rule (form + mock). `methods` = all stored methods, `exceptId` = the one
 * being edited. Expects a payload already passed through `withPaymentTypeRules`.
 */
export function paymentMethodError(
  p: PaymentMethodPayload,
  methods: readonly PaymentMethod[],
  exceptId?: number,
): string | null {
  if (!/^[A-Z0-9-]{1,20}$/.test(p.code ?? ''))
    return 'รหัสใช้ได้เฉพาะ A-Z, 0-9 และ - (ไม่เกิน 20 ตัว)';
  if (methods.some((m) => m.id !== exceptId && m.code === p.code)) return `รหัส ${p.code} ซ้ำ`;
  const name = (p.name ?? '').trim();
  if (!name) return 'กรุณากรอกชื่อช่องทางชำระเงิน';
  if (name.length > PAYMENT_NAME_MAX) return `ชื่อต้องไม่เกิน ${PAYMENT_NAME_MAX} ตัวอักษร`;
  if (!(p.type in PAYMENT_TYPE_LABEL)) return 'ประเภทไม่ถูกต้อง';
  if (!(p.minAmount >= 0)) return 'ยอดขั้นต่ำต้องไม่ติดลบ';
  if (p.maxAmount !== null && !(p.maxAmount > 0 && p.maxAmount >= p.minAmount)) {
    return 'ยอดสูงสุดต้องมากกว่า 0 และไม่น้อยกว่ายอดขั้นต่ำ';
  }
  if (!(p.feePercent >= 0 && p.feePercent <= PAYMENT_FEE_MAX)) {
    return `ค่าธรรมเนียมต้องอยู่ระหว่าง 0 - ${PAYMENT_FEE_MAX}%`;
  }
  if (p.requireReference && !p.referenceLabel) return 'กรุณาระบุชื่อช่องเลขอ้างอิง';
  if (p.type === 'qr' && !isValidPromptPayId(p.promptPayId)) {
    return 'PromptPay ID ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขผู้เสียภาษี 13 หลักที่ถูกต้อง';
  }
  if (p.type === 'installment') {
    if (!p.installmentMonths.length) return 'กรุณาระบุจำนวนเดือนที่ผ่อนได้อย่างน้อย 1 ตัวเลือก';
    if (p.installmentMonths.some((n) => !Number.isInteger(n) || n < 2 || n > 60)) {
      return 'จำนวนเดือนผ่อนต้องเป็นจำนวนเต็ม 2 - 60';
    }
  }
  if (exceptId !== undefined && isLastActiveCash(methods, exceptId) && !isActiveCash(p)) {
    return 'ต้องมีช่องทางเงินสดที่เปิดใช้งานอย่างน้อย 1 ช่องทาง';
  }
  return null;
}
