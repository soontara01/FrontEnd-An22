import type { Category } from '../category.model';
import { PAYMENT_METHOD_DEFAULTS, PaymentMethod } from '../payment-method.model';
import { PaymentSummary, paymentError, paymentSummary } from '../pos-payment.model';
import {
  PricedCart,
  PricingContext,
  cartError,
  manualDiscountError,
  priceCart,
} from '../pos-pricing.model';
import { PRODUCT_DEFAULTS, Product } from '../product.model';
import { PROMOTION_DEFAULTS, Promotion } from '../promotion.model';
import {
  CreditNote,
  CreditNoteDraft,
  CreditNotePayload,
  creditNoteError,
  draftCreditNote,
  refundOptions,
  returnSummary,
  toRefunds,
} from '../credit-note.model';
import type { Exchange } from '../exchange.model';
import {
  SALE_DEFAULTS,
  type BranchHere,
  type CartItem,
  type FreeSerial,
  type ManualDiscount,
  type PaymentInput,
  type Sale,
  type SaleLine,
  type SalePayment,
} from '../sale.model';

/**
 * Golden fixtures (`docs/backend/fixtures/`): inputs → the exact outputs of the shared rules, so
 * the real API (Java) can test its port against the same numbers and Thai messages.
 * Cases live here; `npm run fixtures` writes the JSON and `golden-fixtures.spec.ts` fails when
 * the JSON no longer matches the code. Every case must be deterministic (no "today").
 */

export interface PriceCartFixture {
  name: string;
  input: {
    items: CartItem[];
    context: PricingContext;
    freeSerials: FreeSerial[];
    billManualDiscount: ManualDiscount | null;
    /** Checkout's manual-discount rule (`manualDiscountError()`) */
    manualDiscountRule: { reason: string; isAdmin: boolean; maxPercent: number };
  };
  expected: {
    cart: PricedCart;
    cartError: string | null;
    manualDiscountError: string | null;
  };
}

export interface CreditNoteFixture {
  name: string;
  input: {
    sale: Sale;
    /** Earlier credit notes of the bill */
    notes: CreditNote[];
    payload: CreditNotePayload;
    promotions: Promotion[];
    methods: PaymentMethod[];
    /** Local 'YYYY-MM-DD' (the bill is 2026-10-01 10:00 +07) */
    today: string;
    exchanges: Exchange[];
    here: BranchHere | null;
  };
  expected: {
    /** `draftCreditNote(sale, notes, payload.lines, promotions, exchanges)` */
    draft: CreditNoteDraft;
    /** `creditNoteError()` = 400 at POST /sales/:id/credit-notes */
    error: string | null;
    /** `refundOptions()` as { methodId, max } */
    refundOptions: { methodId: number; max: number | null }[];
    /** `toRefunds(payload.refunds, methods)` — stored refund lines */
    refunds: SalePayment[];
    /** `returnSummary(sale, notes)` — derived Sale fields from the earlier notes */
    returnSummary: Pick<Sale, 'returnStatus' | 'creditedTotal' | 'creditNoteNos'>;
  };
}

export interface PaymentFixture {
  name: string;
  input: { total: number; payments: PaymentInput[]; methods: PaymentMethod[] };
  expected: { summary: PaymentSummary; error: string | null };
}

// ---------------------------------------------------------------- priceCart

const DATE = '2026-10-04';

const product = (id: number, over: Partial<Product> = {}): Product => ({
  ...PRODUCT_DEFAULTS,
  id,
  sku: `SKU-${id}`,
  name: `สินค้า ${id}`,
  shortName: `สินค้า ${id}`,
  categoryId: 3,
  currentPrice: 107,
  stock: 100,
  ...over,
});

const promo = (id: number, over: Partial<Promotion> = {}): Promotion => ({
  ...PROMOTION_DEFAULTS,
  id,
  code: `P${id}`,
  name: `โปร ${id}`,
  startDate: '2026-10-01',
  scope: { all: true, productIds: [], categoryIds: [] },
  ...over,
});

const percent = (value: number, maxDiscount: number | null = null) => ({
  kind: 'percent' as const,
  value,
  maxDiscount,
});
const amount = (value: number) => ({ kind: 'amount' as const, value, maxDiscount: null });

const freePromo = (id: number, over: Partial<Promotion> = {}): Promotion =>
  promo(id, {
    type: 'free_goods',
    discount: null,
    minQty: 2,
    freeGoods: { items: [{ productId: 9, qty: 1 }], repeat: true, maxSets: null },
    ...over,
  });

const billPromo = (id: number, over: Partial<Promotion> = {}): Promotion =>
  promo(id, {
    type: 'bill_discount',
    minQty: 0,
    minAmount: 1000,
    discount: amount(100),
    ...over,
  });

const categories: Category[] = [
  { id: 1, code: 'IT', name: 'ไอที', parentId: null, level: 1, active: true, productCount: 0 },
  { id: 2, code: 'IT-A', name: 'อุปกรณ์', parentId: 1, level: 2, active: true, productCount: 0 },
  { id: 3, code: 'IT-A-M', name: 'เมาส์', parentId: 2, level: 3, active: true, productCount: 0 },
];

const item = (productId: number, qty = 1, over: Partial<CartItem> = {}): CartItem => ({
  productId,
  factor: 1,
  qty,
  serial: null,
  manualDiscount: null,
  ...over,
});

const STAFF = { reason: 'ลูกค้าประจำ', isAdmin: false, maxPercent: 5 };

interface CartCase {
  name: string;
  items: CartItem[];
  products: Product[];
  promotions?: Promotion[];
  vatRegistered?: boolean;
  /** Branch of the sale (default 1) */
  branchId?: number | null;
  freeSerials?: FreeSerial[];
  billManualDiscount?: ManualDiscount | null;
  manualDiscountRule?: PriceCartFixture['input']['manualDiscountRule'];
}

const CART_CASES: CartCase[] = [
  {
    name: 'list price × pack factor, VAT per line',
    items: [item(1, 2), item(1, 1, { factor: 10 })],
    products: [
      product(1, {
        currentPrice: 10.7,
        packUnits: [{ unit: 'กล่อง', factor: 10, barcode: 'B10' }],
      }),
    ],
  },
  {
    name: 'store not VAT-registered: same prices, VAT 0 (B20)',
    items: [item(1, 2)],
    products: [product(1, { currentPrice: 10.7 })],
    vatRegistered: false,
  },
  {
    name: 'VAT rounding on odd prices, vat7 + exempt',
    items: [item(1, 3), item(2, 7), item(3, 1)],
    products: [
      product(1, { currentPrice: 99.99 }),
      product(2, { currentPrice: 12.35, vatType: 'exempt' }),
      product(3, { currentPrice: 0.01 }),
    ],
  },
  {
    name: 'promotions limited to other branches do not apply (D2)',
    items: [item(1, 2)],
    products: [product(1, { currentPrice: 1000 })],
    branchId: 2,
    promotions: [
      promo(1, { priority: 5, discount: percent(20), branchIds: [1] }),
      promo(2, { discount: percent(10), branchIds: [2, 3] }),
      billPromo(3, { branchIds: [1] }),
    ],
  },
  {
    name: 'a limited promotion never applies when the branch is unknown',
    items: [item(1, 1)],
    products: [product(1, { currentPrice: 1000 })],
    branchId: null,
    promotions: [promo(1, { discount: percent(10), branchIds: [2] })],
  },
  {
    name: 'item % discount capped per unit (maxDiscount), minQty reached',
    items: [item(1, 3)],
    products: [product(1, { currentPrice: 1000 })],
    promotions: [promo(1, { minQty: 2, discount: percent(10, 50) })],
  },
  {
    name: 'item discount not reached (minQty)',
    items: [item(1, 1)],
    products: [product(1, { currentPrice: 1000 })],
    promotions: [promo(1, { minQty: 2, discount: percent(10, 50) })],
  },
  {
    name: 'priority walk: stackable ones compound, non-stackable lower one skipped',
    items: [item(1)],
    products: [product(1, { currentPrice: 1000 })],
    promotions: [
      promo(3, { priority: 1, stackable: true, discount: percent(10) }),
      promo(2, { priority: 5, discount: percent(50) }),
      promo(1, { priority: 9, stackable: true, discount: percent(10) }),
    ],
  },
  {
    name: 'priority walk: a non-stackable top promotion stops the rest',
    items: [item(1)],
    products: [product(1, { currentPrice: 1000 })],
    promotions: [
      promo(2, { priority: 10, discount: percent(50) }),
      promo(1, { priority: 9, stackable: true, discount: percent(10) }),
      promo(3, { priority: 1, stackable: true, discount: percent(10) }),
    ],
  },
  {
    name: 'disabled / expired / not started / out of scope ignored; category scope covers children',
    items: [item(1)],
    products: [product(1, { currentPrice: 1000 })],
    promotions: [
      promo(1, { enabled: false }),
      promo(2, { endDate: '2026-10-03' }),
      promo(3, { startDate: '2026-10-05' }),
      promo(4, { scope: { all: false, productIds: [2], categoryIds: [] } }),
      promo(5, { scope: { all: false, productIds: [], categoryIds: [1] } }),
    ],
  },
  {
    name: 'free goods per set of pieces, repeat',
    items: [item(1, 5)],
    products: [product(1), product(9, { stock: 50 })],
    promotions: [freePromo(1)],
  },
  {
    name: 'free goods without repeat: one set',
    items: [item(1, 5)],
    products: [product(1), product(9, { stock: 50 })],
    promotions: [
      freePromo(1, {
        freeGoods: { items: [{ productId: 9, qty: 1 }], repeat: false, maxSets: null },
      }),
    ],
  },
  {
    name: 'free goods capped by maxSets',
    items: [item(1, 9)],
    products: [product(1), product(9, { stock: 50 })],
    promotions: [
      freePromo(1, { freeGoods: { items: [{ productId: 9, qty: 1 }], repeat: true, maxSets: 3 } }),
    ],
  },
  {
    name: 'free goods by amount counted after item discounts (not reached)',
    items: [item(1, 2)],
    products: [product(1, { currentPrice: 1000 }), product(9)],
    promotions: [
      freePromo(1, { minQty: 0, minAmount: 2000, stackable: true }),
      promo(2, { stackable: true, priority: 5 }),
    ],
  },
  {
    name: 'free goods by amount counted after item discounts (reached)',
    items: [item(1, 3)],
    products: [product(1, { currentPrice: 1000 }), product(9)],
    promotions: [
      freePromo(1, { minQty: 0, minAmount: 2000, stackable: true }),
      promo(2, { stackable: true, priority: 5 }),
    ],
  },
  {
    name: 'free items capped at stock left after paid lines (warning only)',
    items: [item(1, 6), item(9, 2)],
    products: [product(1), product(9, { stock: 3 })],
    promotions: [freePromo(1, { scope: { all: false, productIds: [1], categoryIds: [] } })],
  },
  {
    name: 'free serial item without scanned serial (blocking)',
    items: [item(1, 4)],
    products: [product(1), product(9, { serialControl: true, stock: 5 })],
    promotions: [freePromo(1)],
  },
  {
    name: 'free serial item with scanned serials',
    items: [item(1, 4)],
    products: [product(1), product(9, { serialControl: true, stock: 5 })],
    promotions: [freePromo(1)],
    freeSerials: [
      { promotionId: 1, productId: 9, serial: 'SN1' },
      { promotionId: 1, productId: 9, serial: 'SN2' },
    ],
  },
  {
    name: 'bill discount on the total after item discounts (reached)',
    items: [item(1, 2)],
    products: [product(1, { currentPrice: 600 })],
    promotions: [promo(1, { discount: amount(100) }), billPromo(2)],
  },
  {
    name: 'bill discount on the total after item discounts (not reached)',
    items: [item(1, 2)],
    products: [product(1, { currentPrice: 600 })],
    promotions: [promo(1, { discount: amount(150) }), billPromo(2)],
  },
  {
    name: 'stackable bill discounts compound, non-stackable skipped',
    items: [item(1)],
    products: [product(1, { currentPrice: 2000 })],
    promotions: [
      billPromo(3, { priority: 1 }),
      billPromo(2, { priority: 3, stackable: true }),
      billPromo(1, { priority: 5, stackable: true, discount: percent(10) }),
    ],
  },
  {
    name: 'bill discount pro rata, remainder on the largest line, vat7 + exempt',
    items: [item(1), item(2), item(3)],
    products: [
      product(1, { currentPrice: 700 }),
      product(2, { currentPrice: 300, vatType: 'exempt' }),
      product(3, { currentPrice: 300 }),
    ],
    promotions: [billPromo(9)],
  },
  {
    name: 'items that cannot be sold (blocking issues, in order)',
    items: [
      item(1),
      item(2),
      item(3, 2),
      item(4, 1, { serial: 'A' }),
      item(4, 1, { serial: 'A' }),
      item(4),
      item(5, 3),
      item(99),
      item(3, 1, { factor: 6 }),
    ],
    products: [
      product(1, { currentPrice: null }),
      product(2, { saleStatus: 'no_sale' }),
      product(3, { stock: 1 }),
      product(4, { serialControl: true, stock: 2 }),
      product(5, { itemType: 'service', stock: 0, cost: 50 }),
    ],
  },
  {
    name: 'empty cart',
    items: [],
    products: [],
  },
  {
    name: 'manual line discounts (% and baht) after promotions',
    items: [
      item(1, 1, { manualDiscount: { kind: 'percent', value: 10 } }),
      item(2, 1, { manualDiscount: { kind: 'amount', value: 50 } }),
    ],
    products: [product(1, { currentPrice: 1000 }), product(2, { currentPrice: 500 })],
    promotions: [
      promo(1, { scope: { all: false, productIds: [1], categoryIds: [] }, discount: percent(10) }),
    ],
    manualDiscountRule: { ...STAFF, isAdmin: true },
  },
  {
    name: 'manual bill discount pro rata over what is left (satang)',
    items: [item(1, 1, { manualDiscount: { kind: 'percent', value: 10 } }), item(2)],
    products: [product(1, { currentPrice: 1000 }), product(2, { currentPrice: 500 })],
    promotions: [
      promo(1, { scope: { all: false, productIds: [1], categoryIds: [] }, discount: percent(10) }),
    ],
    billManualDiscount: { kind: 'amount', value: 100 },
    manualDiscountRule: { ...STAFF, isAdmin: true },
  },
  {
    name: 'manual discount larger than the line is capped at 0',
    items: [item(1, 1, { manualDiscount: { kind: 'amount', value: 2000 } })],
    products: [product(1, { currentPrice: 900 })],
    manualDiscountRule: { ...STAFF, isAdmin: true },
  },
  {
    name: 'invalid manual % (blocking)',
    items: [item(1, 1, { manualDiscount: { kind: 'percent', value: 150 } })],
    products: [product(1, { currentPrice: 900 })],
  },
  {
    name: 'invalid manual bill amount, more than 2 decimals (blocking)',
    items: [item(1)],
    products: [product(1, { currentPrice: 900 })],
    billManualDiscount: { kind: 'amount', value: 1.234 },
  },
  {
    name: 'below cost after manual discount (warning only)',
    items: [item(1, 1, { manualDiscount: { kind: 'percent', value: 20 } })],
    products: [product(1, { currentPrice: 1070, avgCost: 900 })],
    manualDiscountRule: { ...STAFF, isAdmin: true },
  },
  {
    name: 'manual discount keeps promotion eligibility',
    items: [item(1, 1, { manualDiscount: { kind: 'percent', value: 50 } })],
    products: [product(1, { currentPrice: 1000 })],
    promotions: [billPromo(5)],
    manualDiscountRule: { ...STAFF, isAdmin: true },
  },
  {
    name: 'staff manual discount within the ceiling',
    items: [item(1, 1, { manualDiscount: { kind: 'percent', value: 5 } })],
    products: [product(1, { currentPrice: 1000 })],
  },
  {
    name: 'staff manual discount over the ceiling',
    items: [item(1, 1, { manualDiscount: { kind: 'percent', value: 6 } })],
    products: [product(1, { currentPrice: 1000 })],
  },
  {
    name: 'manual discount without a reason',
    items: [item(1, 1, { manualDiscount: { kind: 'percent', value: 5 } })],
    products: [product(1, { currentPrice: 1000 })],
    manualDiscountRule: { ...STAFF, reason: ' ' },
  },
  {
    name: 'everything together: item %, free goods, bill %, manual line + bill',
    items: [
      item(1, 3, { manualDiscount: { kind: 'amount', value: 33.33 } }),
      item(2, 2),
      item(3, 1, { factor: 12 }),
    ],
    products: [
      product(1, { currentPrice: 1290 }),
      product(2, { currentPrice: 459, vatType: 'exempt' }),
      product(3, {
        currentPrice: 17.5,
        packUnits: [{ unit: 'โหล', factor: 12, barcode: 'B12' }],
      }),
      product(9, { stock: 10 }),
    ],
    promotions: [
      promo(1, {
        scope: { all: false, productIds: [1], categoryIds: [] },
        stackable: true,
        discount: percent(7.5, 80),
      }),
      freePromo(2, { minQty: 3, scope: { all: false, productIds: [1], categoryIds: [] } }),
      billPromo(3, { minAmount: 3000, discount: percent(3, 150) }),
    ],
    billManualDiscount: { kind: 'percent', value: 2 },
    manualDiscountRule: { ...STAFF, isAdmin: true },
  },
];

function priceCartFixture(c: CartCase): PriceCartFixture {
  const context: PricingContext = {
    products: c.products,
    promotions: c.promotions ?? [],
    categories,
    date: DATE,
    vatRegistered: c.vatRegistered ?? true,
    branchId: c.branchId === undefined ? 1 : c.branchId,
  };
  const freeSerials = c.freeSerials ?? [];
  const billManualDiscount = c.billManualDiscount ?? null;
  const manualDiscountRule = c.manualDiscountRule ?? STAFF;
  const cart = priceCart(c.items, context, freeSerials, billManualDiscount);
  return {
    name: c.name,
    input: { items: c.items, context, freeSerials, billManualDiscount, manualDiscountRule },
    expected: {
      cart,
      cartError: cartError(cart),
      manualDiscountError: manualDiscountError(cart, manualDiscountRule),
    },
  };
}

// ---------------------------------------------------------------- payment

const method = (id: number, over: Partial<PaymentMethod>): PaymentMethod => ({
  ...PAYMENT_METHOD_DEFAULTS,
  id,
  code: `M${id}`,
  name: `ช่องทาง ${id}`,
  type: 'cash',
  sortOrder: id,
  ...over,
});

const METHODS: PaymentMethod[] = [
  method(1, { name: 'เงินสด', type: 'cash', cashRounding: '0.25' }),
  method(2, {
    name: 'บัตร',
    type: 'card',
    requireReference: true,
    referenceLabel: 'เลขอนุมัติ',
    minAmount: 100,
    feePercent: 1.5,
  }),
  method(3, { name: 'QR', type: 'qr', maxAmount: 5000 }),
  method(4, { name: 'ผ่อน', type: 'installment', installmentMonths: [3, 6] }),
  method(5, { name: 'ปิด', type: 'transfer', active: false }),
  method(6, { name: 'เงินสดปัดบาท', type: 'cash', cashRounding: '1' }),
  method(7, { name: 'เงินสดไม่ปัด', type: 'cash', cashRounding: 'none' }),
];

const pay = (methodId: number, amt: number, over: Partial<PaymentInput> = {}): PaymentInput => ({
  methodId,
  amount: amt,
  reference: '',
  installmentMonths: null,
  ...over,
});

const PAYMENT_CASES: { name: string; total: number; payments: PaymentInput[] }[] = [
  { name: 'cash rounded to 0.25 with change', total: 100.1, payments: [pay(1, 500)] },
  { name: 'cash rounded up to 0.25', total: 100.13, payments: [pay(1, 100.25)] },
  { name: 'cash rounded to the baht', total: 199.5, payments: [pay(6, 200)] },
  { name: 'cash not rounded, exact', total: 57.37, payments: [pay(7, 57.37)] },
  {
    name: 'card + cash for the rest (rounded)',
    total: 1250.13,
    payments: [pay(2, 1000, { reference: 'A1' }), pay(1, 300)],
  },
  { name: 'QR exact', total: 1999, payments: [pay(3, 1999)] },
  {
    name: 'installment with months',
    total: 4590,
    payments: [pay(4, 4590, { installmentMonths: 6 })],
  },
  { name: 'installment without months', total: 4590, payments: [pay(4, 4590)] },
  { name: 'card without reference', total: 500, payments: [pay(2, 500)] },
  {
    name: 'card reference is a full card number (PCI DSS)',
    total: 500,
    payments: [pay(2, 500, { reference: '4111-1111-1111-1111' })],
  },
  {
    name: 'card reference of 16 digits failing Luhn (not a card number)',
    total: 500,
    payments: [pay(2, 500, { reference: '4111111111111112' })],
  },
  { name: 'card under its minimum', total: 50, payments: [pay(2, 50, { reference: 'X' })] },
  { name: 'QR over its maximum', total: 6000, payments: [pay(3, 6000)] },
  { name: 'inactive method', total: 100, payments: [pay(5, 100)] },
  { name: 'unknown method', total: 100, payments: [pay(42, 100)] },
  { name: 'cash short', total: 100.1, payments: [pay(1, 90)] },
  { name: 'non-cash over the total', total: 100, payments: [pay(3, 150)] },
  { name: 'two cash lines', total: 100, payments: [pay(1, 50), pay(6, 50)] },
  {
    name: 'cash line with nothing left to pay in cash',
    total: 300,
    payments: [pay(3, 300), pay(1, 20)],
  },
  { name: 'amount with more than 2 decimals', total: 100, payments: [pay(3, 99.999)] },
  { name: 'no payment', total: 100, payments: [] },
  { name: 'zero bill, no payment', total: 0, payments: [] },
  { name: 'zero bill with a payment', total: 0, payments: [pay(1, 10)] },
  {
    name: 'split over three methods',
    total: 12345.67,
    payments: [pay(2, 5000, { reference: 'APP1' }), pay(3, 5000), pay(1, 3000)],
  },
];

const paymentFixture = (c: (typeof PAYMENT_CASES)[number]): PaymentFixture => ({
  name: c.name,
  input: { total: c.total, payments: c.payments, methods: METHODS },
  expected: {
    summary: paymentSummary(c.total, c.payments, METHODS),
    error: paymentError(c.total, c.payments, METHODS),
  },
});

// ---------------------------------------------------------------- credit note

const saleLine = (over: Partial<SaleLine>): SaleLine => ({
  productId: 1,
  sku: 'SKU',
  name: 'สินค้า',
  shortName: 'สินค้า',
  unit: 'ชิ้น',
  factor: 1,
  qty: 1,
  unitPrice: 0,
  listPrice: 0,
  itemDiscount: 0,
  billDiscount: 0,
  manualDiscount: 0,
  amount: 0,
  vatType: 'vat7',
  itemType: 'stock',
  vat: 0,
  promotionIds: [],
  freeOfPromotionId: null,
  serial: null,
  warrantyMonths: 0,
  cogs: 0,
  ...over,
});

const salePay = (methodId: number, name: string, type: PaymentMethod['type'], amt: number) => ({
  methodId,
  name,
  type,
  amount: amt,
  tendered: amt,
  reference: '',
  installmentMonths: null,
});

/** Notebook (earns a free mouse + setup service), 3 mice at −10%, paid by card + cash, at HQ. */
const CN_SALE: Sale = {
  ...SALE_DEFAULTS,
  id: 1,
  orderNo: 'POS-HQ-1-20261001-0001',
  date: '2026-10-01T03:00:00.000Z',
  customer: '',
  status: 'paid',
  lines: [
    saleLine({
      productId: 1,
      sku: 'NB',
      unitPrice: 24900,
      listPrice: 24900,
      billDiscount: 300,
      amount: 24600,
      vat: 1609.35,
      cogs: 19900,
      serial: 'NB-1',
      promotionIds: [3],
    }),
    saleLine({
      productId: 2,
      sku: 'MS',
      qty: 3,
      unitPrice: 590,
      listPrice: 590,
      itemDiscount: 177,
      amount: 1593,
      vat: 104.21,
      cogs: 1050,
      promotionIds: [1],
    }),
    saleLine({
      productId: 2,
      sku: 'MS',
      listPrice: 590,
      cogs: 350,
      promotionIds: [3],
      freeOfPromotionId: 3,
    }),
    saleLine({
      productId: 9,
      sku: 'SETUP',
      unit: 'ครั้ง',
      listPrice: 500,
      itemType: 'service',
      promotionIds: [3],
      freeOfPromotionId: 3,
    }),
  ],
  payments: [
    { ...salePay(2, 'บัตร', 'card', 20000), reference: 'A' },
    { ...salePay(1, 'เงินสด', 'cash', 6193), tendered: 6200 },
  ],
  subtotal: 26670,
  itemDiscount: 177,
  billDiscount: 300,
  total: 26193,
  itemCount: 6,
  branchId: 1,
  vatRegistered: true,
};

/** A cheap main item earning an expensive free item: returning it alone would refund below 0. */
const CN_CHEAP_SALE: Sale = {
  ...CN_SALE,
  id: 2,
  orderNo: 'POS-HQ-1-20261001-0002',
  lines: [
    saleLine({
      productId: 5,
      sku: 'CABLE',
      unitPrice: 100,
      listPrice: 100,
      amount: 100,
      vat: 6.54,
      cogs: 40,
      promotionIds: [4],
    }),
    saleLine({
      productId: 6,
      sku: 'BAG',
      listPrice: 590,
      cogs: 200,
      promotionIds: [4],
      freeOfPromotionId: 4,
    }),
  ],
  payments: [salePay(1, 'เงินสด', 'cash', 100)],
  subtotal: 100,
  itemDiscount: 0,
  billDiscount: 0,
  total: 100,
  itemCount: 2,
};

const CN_PROMOTIONS: Promotion[] = [
  promo(3, {
    code: 'NB-GIFT',
    startDate: '2026-09-01',
    type: 'free_goods',
    minQty: 1,
    discount: null,
    scope: { all: false, productIds: [1], categoryIds: [] },
    freeGoods: {
      items: [
        { productId: 2, qty: 1 },
        { productId: 9, qty: 1 },
      ],
      repeat: true,
      maxSets: null,
    },
  }),
  promo(4, {
    code: 'BAG-GIFT',
    startDate: '2026-09-01',
    type: 'free_goods',
    minQty: 1,
    discount: null,
    scope: { all: false, productIds: [5], categoryIds: [] },
    freeGoods: { items: [{ productId: 6, qty: 1 }], repeat: false, maxSets: null },
  }),
];

const CN_METHODS: PaymentMethod[] = [
  method(1, { code: 'CASH', name: 'เงินสด', type: 'cash' }),
  method(2, {
    code: 'CARD',
    name: 'บัตร',
    type: 'card',
    requireReference: true,
    referenceLabel: 'เลขอนุมัติ',
  }),
  method(3, { code: 'QR', name: 'QR', type: 'qr' }),
];

const ret = (saleLineIndex: number, qty = 1, restock = true) => ({ saleLineIndex, qty, restock });
const refund = (methodId: number, amt: number, reference = ''): PaymentInput => ({
  methodId,
  amount: amt,
  reference,
  installmentMonths: null,
});

/** An earlier credit note of CN_SALE holding the given draft. */
const earlierNote = (
  cnNo: string,
  date: string,
  draft: CreditNoteDraft,
  refunds: SalePayment[],
): CreditNote => ({
  id: 1,
  cnNo,
  saleId: CN_SALE.id,
  orderNo: CN_SALE.orderNo,
  taxInvoiceNo: null,
  buyer: null,
  saleDate: CN_SALE.date,
  date,
  cashier: 'admin',
  reason: 'ชำรุด',
  lines: draft.lines,
  deductions: draft.deductions,
  subtotal: draft.subtotal,
  deduction: draft.deduction,
  total: draft.total,
  vat: draft.vat,
  refunds,
});

const ONE_MOUSE = earlierNote(
  'CN-HQ-20261002-0001',
  '2026-10-02T03:00:00.000Z',
  draftCreditNote(CN_SALE, [], [ret(1)], CN_PROMOTIONS),
  [{ ...salePay(1, 'เงินสด', 'cash', 531) }],
);
const NOTEBOOK_BACK = earlierNote(
  'CN-HQ-20261002-0002',
  '2026-10-02T04:00:00.000Z',
  draftCreditNote(CN_SALE, [], [ret(0)], CN_PROMOTIONS),
  [
    { ...salePay(2, 'บัตร', 'card', 5000), reference: 'R' },
    { ...salePay(1, 'เงินสด', 'cash', 18510) },
  ],
);

const NOT_VAT_SALE: Sale = {
  ...CN_SALE,
  vatRegistered: false,
  vat: 0,
  lines: CN_SALE.lines.map((l) => ({ ...l, vat: 0 })),
};

const SWAPPED: Exchange = {
  id: 1,
  exNo: 'EX-HQ-20261002-0001',
  saleId: CN_SALE.id,
  orderNo: CN_SALE.orderNo,
  saleDate: CN_SALE.date,
  date: '2026-10-02T03:00:00.000Z',
  cashier: 'admin',
  reason: 'เครื่องเสีย',
  lines: [
    {
      saleLineIndex: 0,
      productId: 1,
      sku: 'NB',
      name: 'สินค้า',
      shortName: 'สินค้า',
      unit: 'ชิ้น',
      factor: 1,
      qty: 1,
      oldSerial: 'NB-1',
      newSerial: 'NB-7',
      restock: false,
      costIn: 19900,
      costOut: 19950,
    },
  ],
};

interface CreditNoteCase {
  name: string;
  sale?: Sale;
  notes?: CreditNote[];
  payload: Partial<CreditNotePayload>;
  today?: string;
  exchanges?: Exchange[];
  here?: BranchHere;
}

const CN_CASES: CreditNoteCase[] = [
  { name: 'one of three discounted mice back, cash refund', payload: {} },
  {
    name: 'card refund with its reference goes back to the card',
    payload: { refunds: [refund(2, 531, 'R1')] },
  },
  { name: 'card refund without its reference', payload: { refunds: [refund(2, 531)] } },
  {
    name: 'last units take the exact remainder (amount / VAT / cost)',
    notes: [ONE_MOUSE],
    payload: { lines: [ret(1, 2)], refunds: [refund(1, 1062)], expectedTotal: 1062 },
  },
  {
    name: 'more than what is left to return',
    notes: [ONE_MOUSE],
    payload: { lines: [ret(1, 3)], refunds: [refund(1, 1593)], expectedTotal: 1593 },
  },
  { name: 'nothing chosen', payload: { lines: [ret(1, 0)] } },
  { name: 'same line twice', payload: { lines: [ret(1), ret(1)] } },
  {
    name: 'main item back: kept free goods deducted at list price, card capped at what it took',
    payload: {
      lines: [ret(0)],
      refunds: [refund(2, 20000, 'R'), refund(1, 3510)],
      expectedTotal: 23510,
    },
  },
  {
    name: 'main item back, all to the card: over its cap',
    payload: { lines: [ret(0)], refunds: [refund(2, 23510, 'R')], expectedTotal: 23510 },
  },
  {
    name: 'main item with its free goods back: no deduction, the service never restocks',
    payload: {
      lines: [ret(0), ret(2), ret(3)],
      refunds: [refund(1, 24600)],
      expectedTotal: 24600,
    },
  },
  {
    name: 'kept free goods already charged by an earlier note are not charged again',
    notes: [NOTEBOOK_BACK],
    payload: {},
  },
  {
    name: 'card refund cap after earlier refunds',
    notes: [NOTEBOOK_BACK],
    payload: { refunds: [refund(2, 531, 'R2')] },
  },
  {
    name: 'returns: partial then full (derived Sale fields)',
    notes: [ONE_MOUSE, NOTEBOOK_BACK],
    payload: {
      lines: [ret(1, 2), ret(2), ret(3)],
      refunds: [refund(1, 1062)],
      expectedTotal: 1062,
    },
  },
  {
    name: 'free item worth more than the refund: return it too',
    sale: CN_CHEAP_SALE,
    payload: { lines: [ret(0)], refunds: [refund(1, 100)], expectedTotal: 100 },
  },
  {
    name: 'bill sold while not VAT-registered: no VAT back, also on deductions',
    sale: NOT_VAT_SALE,
    payload: { lines: [ret(0)], refunds: [refund(1, 23510)], expectedTotal: 23510 },
  },
  {
    name: 'serial line after an exchange returns the serial the customer holds now',
    exchanges: [SWAPPED],
    payload: { lines: [ret(0, 1, false)], refunds: [refund(1, 23510)], expectedTotal: 23510 },
  },
  { name: 'bill of today: void instead', today: '2026-10-01', payload: {} },
  {
    name: 'bill sold at another branch (D3)',
    here: { branchId: 2, branches: [{ id: 1, code: 'HQ' }] },
    payload: {},
  },
  { name: 'cancelled bill', sale: { ...CN_SALE, status: 'cancelled' }, payload: {} },
  { name: 'pre-POS order without lines', sale: { ...CN_SALE, lines: [] }, payload: {} },
  { name: 'missing reason', payload: { reason: '  ' } },
  { name: 'total changed since the screen', payload: { expectedTotal: 590 } },
  {
    name: 'refund through a method the bill was not paid with',
    payload: { refunds: [refund(3, 531)] },
  },
  { name: 'same refund method twice', payload: { refunds: [refund(1, 300), refund(1, 231)] } },
  { name: 'refund amount with more than 2 decimals', payload: { refunds: [refund(1, 530.999)] } },
  { name: 'refunds do not add up to the note', payload: { refunds: [refund(1, 500)] } },
  {
    name: 'full card number in a refund reference (PCI DSS)',
    payload: { refunds: [refund(2, 531, '4111 1111 1111 1111')] },
  },
];

const creditNoteFixture = (c: CreditNoteCase): CreditNoteFixture => {
  const sale = c.sale ?? CN_SALE;
  const notes = c.notes ?? [];
  const exchanges = c.exchanges ?? [];
  const payload: CreditNotePayload = {
    lines: [ret(1)],
    refunds: [refund(1, 531)],
    reason: 'ชำรุด',
    expectedTotal: 531,
    ...c.payload,
  };
  const today = c.today ?? '2026-10-04';
  return {
    name: c.name,
    input: {
      sale,
      notes,
      payload,
      promotions: CN_PROMOTIONS,
      methods: CN_METHODS,
      today,
      exchanges,
      here: c.here ?? null,
    },
    expected: {
      draft: draftCreditNote(sale, notes, payload.lines, CN_PROMOTIONS, exchanges),
      error: creditNoteError(sale, notes, payload, {
        promotions: CN_PROMOTIONS,
        methods: CN_METHODS,
        today,
        exchanges,
        here: c.here,
      }),
      refundOptions: refundOptions(sale, notes, CN_METHODS).map((o) => ({
        methodId: o.method.id,
        max: o.max,
      })),
      refunds: toRefunds(payload.refunds, CN_METHODS),
      returnSummary: returnSummary(sale, notes),
    },
  };
};

/** File name (without `.json`) → its cases, as written to `docs/backend/fixtures/`. */
export const buildGoldenFixtures = (): Record<string, unknown[]> => ({
  'price-cart': CART_CASES.map(priceCartFixture),
  payment: PAYMENT_CASES.map(paymentFixture),
  'credit-note': CN_CASES.map(creditNoteFixture),
});
