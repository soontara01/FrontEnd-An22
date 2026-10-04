/** VAT treatment of a SKU. Sale prices are always VAT-inclusive. */
export type VatType = 'vat7' | 'exempt';

/**
 * Lifecycle of a SKU in the store:
 * - active: sell + purchase
 * - no_sale: hidden from POS, can still be purchased (e.g. not launched yet)
 * - no_purchase: sell remaining stock, no new purchases/receiving
 * - discontinued: neither; hidden from Inventory / Pricing
 */
export type SkuStatus = 'active' | 'no_sale' | 'no_purchase' | 'discontinued';

/** A larger selling/purchasing unit, e.g. 1 ลัง = 24 ชิ้น, with its own barcode. */
export interface PackUnit {
  unit: string;
  /** Base units per pack (> 1) */
  factor: number;
  barcode: string;
}

/** Purchasing terms of one supplier for a SKU. Exactly one link per SKU is the main supplier. */
export interface SkuSupplier {
  supplierId: number;
  /** The supplier's own item code (for purchase orders) */
  supplierSku: string;
  /** Purchase cost per base unit, excluding VAT */
  cost: number;
  /** Days from order to delivery */
  leadTimeDays: number;
  /** Minimum order quantity in base units (0 = none) */
  moq: number;
  isMain: boolean;
}

/**
 * SKU master record. One collection is shared by the SKU menu (master data),
 * the Inventory menu (stock levels) and the Pricing menu (sale prices by period).
 */
export interface Product {
  id: number;
  sku: string;
  name: string;
  /** Receipt / POS name, at most 20 characters */
  shortName: string;
  /** Leaf category (level 3) from the master-data menu; null = not set */
  categoryId: number | null;
  /** Read-only, server-derived, e.g. 'ไอที > คอมพิวเตอร์ > โน้ตบุ๊ก' */
  categoryPath: string;
  /** Base unit of measure (stock is counted in this unit), e.g. 'ชิ้น' */
  unit: string;
  /** Barcode of the base unit */
  barcode: string;
  /** Extra units with their own barcodes; always [] for serial-controlled SKUs */
  packUnits: PackUnit[];
  brand: string;
  model: string;
  /** Data URL thumbnail ('' = no image) */
  imageUrl: string;
  vatType: VatType;
  /**
   * Standard cost per base unit, excluding VAT: default when receiving and the estimate
   * when there is no stock. Never use it for inventory value — see `avgCost`.
   */
  cost: number;
  /**
   * Actual cost per base unit (read-only, server-derived): moving average for normal SKUs,
   * mean cost of in-stock serials for serial SKUs (see costing.model.ts).
   */
  avgCost: number;
  /**
   * VAT-inclusive sale price in effect today (read-only, derived by the server from
   * `SkuPrice` periods). null = no price in effect today ("ยังไม่กำหนดราคา").
   */
  currentPrice: number | null;
  /** Changed only from the Inventory menu; a new SKU starts at 0. */
  stock: number;
  /** Reorder point: stock at or below this level is "low stock" and should be reordered */
  minStock: number;
  /** Target stock level when reordering (0 = not set → 2 × minStock) */
  maxStock: number;
  /** Suppliers of this SKU (one marked isMain when not empty) */
  suppliers: SkuSupplier[];
  /** 0 = no warranty */
  warrantyMonths: number;
  /** Whether units of this SKU are tracked by serial number */
  serialControl: boolean;
  /** Optional serial format (used when serialControl is on) */
  serialPrefix: string;
  serialLength: number | null;
  saleStatus: SkuStatus;
}

/** Fields editable from the SKU form (stock → Inventory, sale price → Pricing). */
export type ProductPayload = Omit<
  Product,
  'id' | 'stock' | 'currentPrice' | 'categoryPath' | 'avgCost'
>;

/** Defaults for fields missing from older stored data. */
export const PRODUCT_DEFAULTS: Omit<Product, 'id' | 'sku' | 'name'> = {
  shortName: '',
  categoryId: null,
  categoryPath: '',
  unit: 'ชิ้น',
  barcode: '',
  packUnits: [],
  brand: '',
  model: '',
  imageUrl: '',
  vatType: 'vat7',
  cost: 0,
  avgCost: 0,
  currentPrice: null,
  stock: 0,
  minStock: 0,
  maxStock: 0,
  suppliers: [],
  warrantyMonths: 0,
  serialControl: false,
  serialPrefix: '',
  serialLength: null,
  saleStatus: 'active',
};

export const SHORT_NAME_MAX = 20;
export const VAT_RATE = 0.07;

export const VAT_TYPE_LABEL: Record<VatType, string> = {
  vat7: 'VAT 7%',
  exempt: 'ยกเว้น VAT',
};

export const SKU_STATUS_LABEL: Record<SkuStatus, string> = {
  active: 'ขายได้',
  no_sale: 'ห้ามขาย',
  no_purchase: 'ห้ามสั่งซื้อ',
  discontinued: 'เลิกจำหน่าย',
};

export const SKU_STATUS_HINT: Record<SkuStatus, string> = {
  active: 'ขายและสั่งซื้อได้ตามปกติ',
  no_sale: 'ซ่อนจากหน้าขาย แต่ยังสั่งซื้อ/รับเข้าได้',
  no_purchase: 'ขายสต็อกที่เหลือได้ แต่ห้ามสั่งซื้อ/รับเข้าเพิ่ม',
  discontinued: 'ไม่ขายและไม่สั่งซื้อ ซ่อนจากคลังสินค้าและราคา',
};

/** Badge class per status (global `.badge-*` classes). */
export const SKU_STATUS_BADGE: Record<SkuStatus, string> = {
  active: 'badge-success',
  no_sale: 'badge-warn',
  no_purchase: 'badge-warn',
  discontinued: 'badge-error',
};

export const canSell = (p: Pick<Product, 'saleStatus'>): boolean =>
  p.saleStatus === 'active' || p.saleStatus === 'no_purchase';

export const canPurchase = (p: Pick<Product, 'saleStatus'>): boolean =>
  p.saleStatus === 'active' || p.saleStatus === 'no_sale';

export const isDiscontinued = (p: Pick<Product, 'saleStatus'>): boolean =>
  p.saleStatus === 'discontinued';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Splits a VAT-inclusive price into net (before VAT) + VAT, rounded to satang. */
export function vatBreakdown(priceInclVat: number, vatType: VatType): { net: number; vat: number } {
  if (vatType === 'exempt') return { net: priceInclVat, vat: 0 };
  const net = round2(priceInclVat / (1 + VAT_RATE));
  return { net, vat: round2(priceInclVat - net) };
}

/** Gross margin % of a VAT-inclusive price over cost (cost excludes VAT). */
export function marginPercent(
  priceInclVat: number | null | undefined,
  cost: number,
  vatType: VatType,
): number | null {
  if (!priceInclVat) return null;
  const { net } = vatBreakdown(priceInclVat, vatType);
  return net > 0 ? ((net - cost) / net) * 100 : null;
}

/** Every non-empty barcode of a SKU (base + packs). */
export const allBarcodes = (p: Pick<Product, 'barcode' | 'packUnits'>): string[] =>
  [p.barcode, ...p.packUnits.map((u) => u.barcode)].filter(Boolean);

/** Stock expressed in the largest packs first, e.g. 52 ชิ้น with ลัง×24 → '2 ลัง 4 ชิ้น'. */
export function stockInPacks(p: Pick<Product, 'stock' | 'unit' | 'packUnits'>): string {
  if (!p.packUnits.length || p.stock === 0) return `${p.stock} ${p.unit}`;
  let rest = p.stock;
  const parts: string[] = [];
  for (const pack of [...p.packUnits].sort((a, b) => b.factor - a.factor)) {
    const count = Math.floor(rest / pack.factor);
    if (count > 0) {
      parts.push(`${count} ${pack.unit}`);
      rest -= count * pack.factor;
    }
  }
  if (rest > 0 || !parts.length) parts.push(`${rest} ${p.unit}`);
  return parts.join(' ');
}

export type StockLevel = 'ok' | 'low' | 'out';

/** Stock status of a SKU: out (0), low (≤ minStock) or ok. */
export const stockLevel = (p: Pick<Product, 'stock' | 'minStock'>): StockLevel =>
  p.stock === 0 ? 'out' : p.stock <= p.minStock ? 'low' : 'ok';

export const mainSupplier = (p: Pick<Product, 'suppliers'>): SkuSupplier | undefined =>
  p.suppliers.find((s) => s.isMain);

/** Smallest pack factor (order in whole packs when the SKU has packs), else 1. */
export const orderMultiple = (p: Pick<Product, 'packUnits'>): number =>
  p.packUnits.length ? Math.min(...p.packUnits.map((u) => u.factor)) : 1;

/**
 * Suggested purchase quantity in base units (0 = no need):
 * only when purchasable and stock ≤ reorder point; fills up to maxStock
 * (or 2 × reorder point when maxStock is not set), at least the main supplier MOQ,
 * rounded up to whole packs.
 */
export function suggestReorderQty(
  p: Pick<Product, 'stock' | 'minStock' | 'maxStock' | 'packUnits' | 'suppliers' | 'saleStatus'>,
): number {
  if (!canPurchase(p) || p.minStock <= 0 || p.stock > p.minStock) return 0;
  const target = p.maxStock > p.minStock ? p.maxStock : p.minStock * 2;
  const needed = Math.max(target - p.stock, mainSupplier(p)?.moq ?? 0, 1);
  const multiple = orderMultiple(p);
  return Math.ceil(needed / multiple) * multiple;
}
