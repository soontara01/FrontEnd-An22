import type { Branch } from './company.model';
import type { Product } from './product.model';
import type { SerialNumber } from './serial.model';

/**
 * Stock transfer between branches (ใบโอนสินค้า, SaaS step 5, saas-plan section 4, E26–E32).
 * Created at the source branch: goods leave its stock at its cost (non-serial: current average,
 * serial: each unit's own cost) and are `in_transit` (sold by neither branch). The destination
 * receives once: the whole quantity comes in at that cost (`movingAverage()` there), then any
 * shortfall is written off there with a reason (E28). The source's admin may cancel it before it
 * is received: the goods go back at the same cost (E29).
 */
export type TransferStatus = 'in_transit' | 'received' | 'cancelled';

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  in_transit: 'ระหว่างโอน',
  received: 'รับแล้ว',
  cancelled: 'ยกเลิก',
};

export const TRANSFER_STATUS_BADGE: Record<TransferStatus, string> = {
  in_transit: 'badge-warn',
  received: 'badge-success',
  cancelled: 'badge-error',
};

export interface TransferLine {
  productId: number;
  sku: string;
  name: string;
  unit: string;
  /** Base units sent */
  qty: number;
  /** Serial SKUs: the units sent (qty = their count) */
  serials: string[];
  /** Transfer cost per base unit, excl. VAT (serial: mean of the units' own costs) */
  unitCost: number;
  /** Base units that arrived; null until received */
  receivedQty: number | null;
  /** Serial SKUs: the units that arrived */
  receivedSerials: string[];
}

export interface Transfer {
  id: number;
  /** 'TR-<source branch>-YYYYMMDD-NNNN', issued by the server (E21) */
  transferNo: string;
  fromBranchId: number;
  toBranchId: number;
  status: TransferStatus;
  createdAt: string;
  createdBy: string;
  note: string;
  lines: TransferLine[];
  receivedAt: string | null;
  receivedBy: string | null;
  /** Why some goods did not arrive ('' = everything arrived) */
  shortReason: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string;
}

export interface TransferLineInput {
  productId: number;
  qty: number;
  serials: string[];
}

/** `POST /transfers` at the source branch (`X-Branch-Id`). */
export interface TransferPayload {
  toBranchId: number;
  lines: TransferLineInput[];
  note: string;
}

/** `POST /transfers/:id/receive` at the destination branch: what really arrived, per line. */
export interface TransferReceivePayload {
  lines: { productId: number; receivedQty: number; receivedSerials: string[] }[];
  /** Required when anything is short */
  shortReason: string;
}

export interface TransferContext {
  fromBranchId: number;
  branches: readonly Pick<Branch, 'id' | 'code' | 'active'>[];
  /** Stock of the source branch */
  products: readonly Pick<
    Product,
    'id' | 'sku' | 'stock' | 'unit' | 'serialControl' | 'itemType'
  >[];
  /** Serials of the SKUs on the transfer (all branches) */
  serials: readonly Pick<SerialNumber, 'serial' | 'productId' | 'branchId' | 'status'>[];
}

/** Units that did not arrive on a received line. */
export const shortQty = (line: Pick<TransferLine, 'qty' | 'receivedQty'>): number =>
  line.receivedQty === null ? 0 : line.qty - line.receivedQty;

/** The single rule for a new transfer (form + server). */
export function transferError(p: TransferPayload, ctx: TransferContext): string | null {
  const to = ctx.branches.find((b) => b.id === p.toBranchId);
  if (!to) return 'กรุณาเลือกสาขาปลายทาง';
  if (to.id === ctx.fromBranchId) return 'สาขาปลายทางต้องไม่ใช่สาขาต้นทาง';
  if (!to.active) return `สาขา ${to.code} ปิดใช้งานแล้ว`;
  if (!p.lines.length) return 'ยังไม่มีรายการสินค้าที่จะโอน';
  const seen = new Set<number>();
  for (const line of p.lines) {
    const product = ctx.products.find((x) => x.id === line.productId);
    if (!product) return 'ไม่พบ SKU ในรายการโอน';
    if (seen.has(product.id)) return `${product.sku} ซ้ำในรายการ`;
    seen.add(product.id);
    if (product.itemType === 'service') return `${product.sku} เป็นสินค้าบริการ ไม่มีสต็อก`;
    if (product.serialControl) {
      if (!line.serials.length) return `${product.sku}: กรุณาเลือก Serial ที่จะโอน`;
      if (new Set(line.serials).size !== line.serials.length) {
        return `${product.sku}: Serial ซ้ำในรายการ`;
      }
      if (line.qty !== line.serials.length) return `${product.sku}: จำนวนต้องเท่ากับจำนวน Serial`;
      for (const serial of line.serials) {
        const unit = ctx.serials.find((s) => s.serial === serial);
        if (
          unit?.productId !== product.id ||
          unit.status !== 'in_stock' ||
          unit.branchId !== ctx.fromBranchId
        ) {
          return `ซีเรียล ${serial} ไม่อยู่ในคลังของ ${product.sku} ที่สาขานี้`;
        }
      }
      continue;
    }
    if (line.serials.length) return `${product.sku} ไม่ได้ควบคุม Serial`;
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      return `${product.sku}: จำนวนต้องเป็นจำนวนเต็มมากกว่า 0`;
    }
    if (line.qty > product.stock) {
      return `${product.sku} มีสต็อกไม่พอ (คงเหลือ ${product.stock} ${product.unit})`;
    }
  }
  return null;
}

/** Receiving at the destination (E27): once, every line, shortfall needs a reason. */
export function receiveTransferError(
  t: Pick<Transfer, 'status' | 'toBranchId' | 'lines'>,
  p: TransferReceivePayload,
  branchId: number | null,
): string | null {
  if (t.status !== 'in_transit') return 'ใบโอนนี้รับหรือยกเลิกไปแล้ว';
  if (branchId !== t.toBranchId) return 'รับของได้ที่สาขาปลายทางเท่านั้น';
  let short = false;
  for (const line of t.lines) {
    const got = p.lines.find((l) => l.productId === line.productId);
    if (!got) return `${line.sku}: ไม่ได้ระบุจำนวนที่รับ`;
    if (!Number.isInteger(got.receivedQty) || got.receivedQty < 0 || got.receivedQty > line.qty) {
      return `${line.sku}: จำนวนที่รับต้องอยู่ระหว่าง 0–${line.qty}`;
    }
    if (line.serials.length) {
      const unknown = got.receivedSerials.find((s) => !line.serials.includes(s));
      if (unknown) return `ซีเรียล ${unknown} ไม่อยู่ในใบโอนนี้`;
      if (new Set(got.receivedSerials).size !== got.receivedQty) {
        return `${line.sku}: จำนวนที่รับต้องเท่ากับจำนวน Serial ที่ติ๊ก`;
      }
    }
    if (got.receivedQty < line.qty) short = true;
  }
  if (short && !p.shortReason.trim()) return 'กรุณาระบุเหตุผลของสินค้าที่ขาด / เสียหาย';
  return null;
}

/** Cancelling (E29): still in transit, at the source branch, by its admin, with a reason. */
export function cancelTransferError(
  t: Pick<Transfer, 'status' | 'fromBranchId'>,
  branchId: number | null,
  isAdmin: boolean,
  reason: string,
): string | null {
  if (t.status !== 'in_transit') return 'ยกเลิกได้เฉพาะใบโอนที่ยังไม่ได้รับ';
  if (branchId !== t.fromBranchId) return 'ยกเลิกได้ที่สาขาต้นทางเท่านั้น';
  if (!isAdmin) return 'ยกเลิกใบโอนได้เฉพาะผู้ดูแลระบบ';
  if (!reason.trim()) return 'กรุณาระบุเหตุผลการยกเลิก';
  return null;
}
