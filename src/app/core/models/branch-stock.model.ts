import type { Product } from './product.model';

/**
 * Stock of one SKU in one branch (SaaS step 3, D1): 1 branch = 1 warehouse with its own moving
 * average. The API still answers `Product` as before, with these fields filled in for the branch
 * of `X-Branch-Id`; `Product.cost` (standard cost) stays company-wide.
 */
export interface BranchStock {
  branchId: number;
  productId: number;
  /** Base units (serial SKUs: in-stock serials of this branch) */
  stock: number;
  /** Moving average of this branch (serial SKUs: mean cost of its in-stock serials) */
  avgCost: number;
  /** Reorder point of this branch (a branch without a row starts at 0 = no suggestion, E13) */
  minStock: number;
  maxStock: number;
}

export type BranchStockFields = Pick<Product, 'stock' | 'avgCost' | 'minStock' | 'maxStock'>;

/** A branch the SKU has no row in yet: nothing in stock, no reorder levels (E13). */
export const BRANCH_STOCK_DEFAULTS: BranchStockFields = {
  stock: 0,
  avgCost: 0,
  minStock: 0,
  maxStock: 0,
};

/** The SKU as seen from one branch: the branch's stock fields over the company record. */
export const withBranchStock = <T extends BranchStockFields>(
  product: T,
  row: Partial<BranchStockFields> | undefined,
): T => ({
  ...product,
  ...BRANCH_STOCK_DEFAULTS,
  ...(row && {
    stock: row.stock ?? 0,
    avgCost: row.avgCost ?? 0,
    minStock: row.minStock ?? 0,
    maxStock: row.maxStock ?? 0,
  }),
});

/**
 * One line of `GET /products/:id/branch-stock` (every active branch of the company). Everyone sees
 * the quantities; `avgCost` is sent to admins only, else null (E14).
 */
export interface BranchStockRow {
  branchId: number;
  stock: number;
  avgCost: number | null;
}
