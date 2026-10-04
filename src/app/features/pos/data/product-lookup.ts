import { Product, canSell } from '@core/models';

/** A sellable unit of a SKU: the base unit (factor 1) or one of its packs. */
export interface SellUnit {
  product: Product;
  factor: number;
}

/**
 * Exact match of a scanned / typed code: any barcode (base or pack, unique across SKUs) or the
 * SKU code (case-insensitive, base unit). Only sellable SKUs.
 */
export function findByCode(code: string, products: readonly Product[]): SellUnit | null {
  const text = code.trim();
  if (!text) return null;
  const upper = text.toUpperCase();
  for (const product of products) {
    if (!canSell(product)) continue;
    if (product.barcode === text || product.sku.toUpperCase() === upper) {
      return { product, factor: 1 };
    }
    const pack = product.packUnits.find((u) => u.barcode === text);
    if (pack) return { product, factor: pack.factor };
  }
  return null;
}

/** Sellable SKUs whose code / name / short name / brand / model contains every word. */
export function searchProducts(text: string, products: readonly Product[], limit = 20): Product[] {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return products
    .filter((p) => canSell(p))
    .filter((p) => {
      const haystack = [p.sku, p.name, p.shortName, p.brand, p.model, p.barcode]
        .join(' ')
        .toLowerCase();
      return words.every((w) => haystack.includes(w));
    })
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .slice(0, limit);
}
