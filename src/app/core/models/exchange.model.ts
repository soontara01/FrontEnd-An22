import { CreditNote, remainingQty } from './credit-note.model';
import { addDaysIso, fromIsoDate, toIsoDate } from './price.model';
import type { Product } from './product.model';
import { Sale, currentSerial, saleDay } from './sale.model';
import type { StoreInfo } from './store-info.model';

/**
 * Product exchanges (ใบเปลี่ยนสินค้า, decided 2026-10-05): the customer swaps units of a paid POS
 * bill for other units of the **same SKU and unit**. The price is the same, so no money moves and
 * no tax document changes (no credit note, no new invoice); the bill never changes. Only stock
 * moves: the old unit comes back (into stock, or written off as damaged) and a new one goes out
 * (serial: the customer now holds another serial — see `currentSerial()`). Any staff member, within
 * `StoreInfo.exchangeDays` of the sale day (0 = no limit; admins any time). A serial's warranty keeps
 * counting from the original sale day. `exchangeError()` is the single rule (form + server).
 */
export interface ExchangeLine {
  /** Index of the line in `sale.lines` */
  saleLineIndex: number;
  productId: number;
  sku: string;
  name: string;
  shortName: string;
  unit: string;
  factor: number;
  /** In sold units (serial lines: 1) */
  qty: number;
  /** Serial handed back (serial SKUs only) */
  oldSerial: string | null;
  /** Serial handed out instead */
  newSerial: string | null;
  /** Old unit back into stock (false = written off, serial → damaged) */
  restock: boolean;
  /** Cost of the returned units (serial: its own cost; others: the line's sale COGS share) */
  costIn: number;
  /** Cost of the units handed out (serial: its own cost; others: the average at exchange time) */
  costOut: number;
}

export interface Exchange {
  id: number;
  /** 'EX-YYYYMMDD-NNNN', issued by the server on the exchange day */
  exNo: string;
  saleId: number;
  orderNo: string;
  saleDate: string;
  /** ISO timestamp */
  date: string;
  cashier: string;
  reason: string;
  lines: ExchangeLine[];
}

export interface ExchangeLineInput {
  saleLineIndex: number;
  qty: number;
  /** Required for serial lines */
  newSerial: string | null;
  restock: boolean;
}

/** POST /sales/:id/exchanges body. */
export interface ExchangePayload {
  lines: ExchangeLineInput[];
  reason: string;
}

export interface ExchangeContext {
  creditNotes: readonly CreditNote[];
  exchanges: readonly Exchange[];
  store: Pick<StoreInfo, 'exchangeDays'>;
  isAdmin: boolean;
  today: string;
  /** Current stock of the bill's SKUs: replacements must be in stock *before* the exchange */
  products: readonly Pick<Product, 'id' | 'sku' | 'stock' | 'unit'>[];
}

/** Last day (inclusive) a staff member may exchange goods of the bill; null = no limit. */
export function exchangeDeadline(
  sale: Pick<Sale, 'date'>,
  store: Pick<StoreInfo, 'exchangeDays'>,
): string | null {
  return store.exchangeDays > 0 ? addDaysIso(saleDay(sale), store.exchangeDays) : null;
}

/** Why nothing of this bill can be exchanged now (null = some line can). */
export function exchangeBlocker(sale: Sale, ctx: Omit<ExchangeContext, 'products'>): string | null {
  if (sale.status !== 'paid' || !sale.lines.length) {
    return 'เปลี่ยนสินค้าได้เฉพาะบิลขายหน้าร้านที่ชำระแล้ว';
  }
  const deadline = exchangeDeadline(sale, ctx.store);
  if (deadline && ctx.today > deadline && !ctx.isAdmin) {
    return `เกินกำหนดเปลี่ยนสินค้า ${ctx.store.exchangeDays} วัน — ให้ผู้ดูแลระบบทำรายการ`;
  }
  const open = sale.lines.some(
    (l, i) => l.itemType !== 'service' && remainingQty(sale, ctx.creditNotes, i) > 0,
  );
  return open ? null : 'ไม่มีสินค้าในบิลที่เปลี่ยนได้';
}

/** The single rule for the exchange form and the server (serial stock is checked by the server). */
export function exchangeError(
  sale: Sale,
  payload: ExchangePayload,
  ctx: ExchangeContext,
): string | null {
  const blocker = exchangeBlocker(sale, ctx);
  if (blocker) return blocker;
  const chosen = payload.lines.filter((l) => l.qty > 0);
  if (!chosen.length) return 'กรุณาเลือกสินค้าที่เปลี่ยน';
  if (new Set(chosen.map((l) => l.saleLineIndex)).size !== chosen.length) return 'เลือกรายการซ้ำ';
  const newSerials = chosen.flatMap((l) => (l.newSerial ? [l.newSerial.trim()] : []));
  if (new Set(newSerials).size !== newSerials.length) return 'ซีเรียลใหม่ซ้ำกัน';

  for (const input of chosen) {
    const line = sale.lines[input.saleLineIndex];
    if (!line) return `ไม่พบรายการที่ ${input.saleLineIndex + 1} ในบิล`;
    if (line.itemType === 'service') return `${line.sku} เป็นบริการ เปลี่ยนไม่ได้`;
    const held = remainingQty(sale, ctx.creditNotes, input.saleLineIndex);
    if (!Number.isInteger(input.qty) || input.qty > held) {
      return `${line.sku} เปลี่ยนได้ไม่เกิน ${held} ${line.unit}`;
    }
    if (line.serial) {
      const serial = (input.newSerial ?? '').trim();
      if (!serial) return `${line.sku}: กรุณาเลือกซีเรียลเครื่องใหม่`;
      if (serial === currentSerial(sale, input.saleLineIndex, ctx.exchanges)) {
        return `${line.sku}: ซีเรียลใหม่ต้องไม่ใช่เครื่องเดิม`;
      }
    }
  }

  // Non-serial replacements come off the shelf first (returned units never count), like the POS.
  const needed = new Map<number, number>();
  for (const input of chosen) {
    const line = sale.lines[input.saleLineIndex];
    if (line.serial) continue; // serials: the chosen unit must be in stock (server)
    needed.set(line.productId, (needed.get(line.productId) ?? 0) + input.qty * line.factor);
  }
  for (const [productId, qty] of needed) {
    const product = ctx.products.find((p) => p.id === productId);
    if (!product) {
      const sku = sale.lines.find((l) => l.productId === productId)?.sku ?? productId;
      return `ไม่พบ SKU ${sku} เปลี่ยนไม่ได้`;
    }
    if (qty > product.stock) {
      return `${product.sku} สต็อกไม่พอเปลี่ยน (คงเหลือ ${product.stock} ${product.unit})`;
    }
  }
  if (!payload.reason.trim()) return 'กรุณาระบุเหตุผลการเปลี่ยนสินค้า';
  return null;
}

/** Last day of a sale line's warranty ('YYYY-MM-DD', counted from the sale day), null = none. */
export function warrantyEnd(sale: Pick<Sale, 'date'>, months: number): string | null {
  if (months <= 0) return null;
  const start = fromIsoDate(saleDay(sale));
  const target = new Date(start.getFullYear(), start.getMonth() + months, 1);
  const lastOfMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(start.getDate(), lastOfMonth));
  return toIsoDate(target);
}

/** Exchange numbers of a bill, oldest first (server-derived `Sale.exchangeNos`). */
export const exchangeNos = (exchanges: readonly Exchange[]): string[] =>
  [...exchanges].sort((a, b) => a.date.localeCompare(b.date)).map((x) => x.exNo);
