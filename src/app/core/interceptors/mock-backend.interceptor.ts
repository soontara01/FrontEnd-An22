import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpParams,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, delay, dematerialize, materialize, of, throwError } from 'rxjs';
import { environment } from '@env/environment';
import {
  CATEGORY_MAX_LEVEL,
  Category,
  CategoryLevel,
  CategoryPayload,
  LoginRequest,
  LoginResponse,
  PRODUCT_DEFAULTS,
  PROMOTION_DEFAULTS,
  Product,
  ProductPayload,
  Promotion,
  PromotionPayload,
  Sale,
  SaleStatus,
  SkuSupplier,
  SerialNumber,
  SerialReceiveResult,
  SERIAL_STATUS_LABEL,
  StockMovement,
  MovementType,
  SerialRemoveStatus,
  SkuPrice,
  SHORT_NAME_MAX,
  SKU_STATUS_LABEL,
  SUPPLIER_DEFAULTS,
  SkuPricePayload,
  Supplier,
  SupplierPayload,
  User,
  UserPayload,
  allBarcodes,
  canPurchase,
  categoryPath,
  isService,
  withServiceRules,
  buildStockCard,
  costValue,
  movingAverage,
  round2,
  effectivePrice,
  findOverlap,
  formatDateRange,
  isLeaf,
  isValidThaiTaxId,
  promotionError,
  promotionStatus,
  hasStarted,
  serialFormatError,
  todayIso,
} from '../models';
import { StorageService } from '../services/storage.service';

interface MockDb {
  users: User[];
  nextId: number;
  products: Product[];
  nextProductId: number;
  sales: Sale[];
  /** Serial numbers of serial-controlled SKUs (history kept; removal changes status). */
  serials: SerialNumber[];
  nextSerialId: number;
  /** Sale price periods per SKU (never overlapping for the same SKU). */
  prices: SkuPrice[];
  nextPriceId: number;
  /** Product category tree (master data), max 3 levels. */
  categories: Category[];
  nextCategoryId: number;
  /** Suppliers (master data); SKUs link them via Product.suppliers. */
  suppliers: Supplier[];
  nextSupplierId: number;
  /** Stock card lines (inventory ledger with running cost balance). */
  movements: StockMovement[];
  nextMovementId: number;
  /** Promotion master (discounts / free goods by period), used by the future POS. */
  promotions: Promotion[];
  nextPromotionId: number;
}

/** Mock data is kept in localStorage so it survives full page reloads (menu switches). */
const DB_KEY = 'mock.db';

const SEED_USERS: User[] = [
  {
    id: 1,
    name: 'Admin',
    email: 'admin@example.com',
    role: 'admin',
    active: true,
    createdAt: '2026-01-05T09:00:00Z',
  },
  {
    id: 2,
    name: 'สมชาย ใจดี',
    email: 'somchai@example.com',
    role: 'user',
    active: true,
    createdAt: '2026-02-11T10:30:00Z',
  },
  {
    id: 3,
    name: 'สมหญิง รักงาน',
    email: 'somying@example.com',
    role: 'user',
    active: false,
    createdAt: '2026-03-20T14:15:00Z',
  },
  {
    id: 4,
    name: 'John Doe',
    email: 'john@example.com',
    role: 'user',
    active: true,
    createdAt: '2026-05-02T08:45:00Z',
  },
];

const cat = (
  id: number,
  code: string,
  name: string,
  parentId: number | null,
  level: CategoryLevel,
): Category => ({ id, code, name, parentId, level, active: true, productCount: 0 });

/** IT / electrical-appliance store category tree: แผนก > หมวด > หมวดย่อย. */
const SEED_CATEGORIES: Category[] = [
  cat(1, 'IT', 'ไอที', null, 1),
  cat(2, 'IT-COM', 'คอมพิวเตอร์', 1, 2),
  cat(3, 'IT-COM-NB', 'โน้ตบุ๊ก', 2, 3),
  cat(4, 'IT-COM-MON', 'จอภาพ', 2, 3),
  cat(5, 'IT-ACC', 'อุปกรณ์เสริม', 1, 2),
  cat(6, 'IT-ACC-MKB', 'เมาส์และคีย์บอร์ด', 5, 3),
  cat(7, 'IT-ACC-CBL', 'สายและอะแดปเตอร์', 5, 3),
  cat(8, 'IT-STO', 'อุปกรณ์จัดเก็บข้อมูล', 1, 2),
  cat(9, 'IT-STO-SSD', 'SSD', 8, 3),
  cat(10, 'EA', 'เครื่องใช้ไฟฟ้า', null, 1),
  cat(11, 'EA-AUD', 'เครื่องเสียง', 10, 2),
  cat(12, 'EA-AUD-HP', 'หูฟัง', 11, 3),
  cat(13, 'SV', 'บริการ', null, 1),
  cat(14, 'SV-IT', 'บริการไอที', 13, 2),
  cat(15, 'SV-IT-SET', 'ติดตั้งและตั้งค่า', 14, 3),
  cat(16, 'SV-MOB', 'บริการมือถือ', 13, 2),
  cat(17, 'SV-MOB-ESIM', 'eSIM', 16, 3),
];

const supplier = (
  s: Pick<Supplier, 'id' | 'code' | 'name' | 'taxId'> & Partial<Supplier>,
): Supplier => ({
  ...SUPPLIER_DEFAULTS,
  productCount: 0,
  ...s,
});

/** Sample distributors (fictional names, checksum-valid tax IDs). */
const SEED_SUPPLIERS: Supplier[] = [
  supplier({
    id: 1,
    code: 'SUP-ITD',
    name: 'บริษัท ไอทีดิสทริบิวชั่น จำกัด',
    taxId: '0105550123451',
    address: '99 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310',
    contactName: 'คุณวิภา',
    phone: '02-000-1111',
    email: 'sales@itd.example.com',
    creditDays: 30,
    bankName: 'กสิกรไทย',
    bankAccountNo: '123-4-56789-0',
    bankAccountName: 'บจก. ไอทีดิสทริบิวชั่น',
  }),
  supplier({
    id: 2,
    code: 'SUP-CPS',
    name: 'บริษัท คอมพาร์ทซัพพลาย จำกัด',
    taxId: '0105560789011',
    branchType: 'branch',
    branchNo: '00001',
    address: '15 ถนนบางนา-ตราด แขวงบางนา เขตบางนา กรุงเทพฯ 10260',
    contactName: 'คุณธนา',
    phone: '02-000-2222',
    email: 'order@cps.example.com',
    creditDays: 60,
    bankName: 'กรุงเทพ',
    bankAccountNo: '234-5-67890-1',
    bankAccountName: 'บจก. คอมพาร์ทซัพพลาย',
  }),
  supplier({
    id: 3,
    code: 'SUP-ACC',
    name: 'ห้างหุ้นส่วนจำกัด แอคเซสเซอรี่ เทรดดิ้ง',
    taxId: '0105540345672',
    address: '8 ถนนเพชรบุรี แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพฯ 10400',
    contactName: 'คุณมานพ',
    phone: '081-000-3333',
    creditDays: 0,
    note: 'จ่ายเงินสดเมื่อรับของ',
  }),
  supplier({
    id: 4,
    code: 'SUP-AV',
    name: 'บริษัท ออดิโอวิชั่น จำกัด',
    taxId: '0105550987651',
    address: '120 ถนนรัชดาภิเษก แขวงดินแดง เขตดินแดง กรุงเทพฯ 10400',
    contactName: 'คุณสุดา',
    phone: '02-000-4444',
    email: 'b2b@av.example.com',
    creditDays: 30,
  }),
];

/** Supplier link helper for seed products. */
const link = (
  supplierId: number,
  supplierSku: string,
  cost: number,
  leadTimeDays: number,
  moq: number,
  isMain = false,
): SkuSupplier => ({ supplierId, supplierSku, cost, leadTimeDays, moq, isMain });

/** Fills SKU master fields not given in the seed. */
const seedProduct = (p: Pick<Product, 'id' | 'sku' | 'name'> & Partial<Product>): Product => ({
  ...PRODUCT_DEFAULTS,
  ...p,
});

const SEED_PRODUCTS: Product[] = [
  seedProduct({
    id: 1,
    sku: 'NB-001',
    maxStock: 20,
    suppliers: [link(1, 'LN-IPS5-14', 19500, 7, 5, true), link(2, 'NB14-LEN', 19900, 10, 1)],
    name: 'โน้ตบุ๊ก 14 นิ้ว',
    categoryId: 3,
    shortName: 'NB Lenovo Slim5 14"',
    brand: 'Lenovo',
    model: 'IdeaPad Slim 5',
    barcode: '8850000000010',
    cost: 19900,
    stock: 12,
    minStock: 5,
    warrantyMonths: 24,
    serialControl: true,
    serialPrefix: 'NB',
    serialLength: 12,
  }),
  seedProduct({
    id: 2,
    sku: 'MS-010',
    maxStock: 40,
    suppliers: [link(3, 'LG-M240', 330, 3, 20, true)],
    name: 'เมาส์ไร้สาย',
    categoryId: 6,
    shortName: 'เมาส์ไร้สาย M240',
    packUnits: [{ unit: 'กล่อง', factor: 20, barcode: '8850000000126' }],
    brand: 'Logitech',
    model: 'M240',
    barcode: '8850000000027',
    cost: 350,
    stock: 3,
    minStock: 10,
    warrantyMonths: 12,
  }),
  seedProduct({
    id: 3,
    sku: 'KB-020',
    maxStock: 20,
    suppliers: [link(3, 'KC-K2', 1600, 5, 5, true)],
    name: 'คีย์บอร์ดแมคคานิคอล',
    categoryId: 6,
    shortName: 'คีย์บอร์ด K2',
    saleStatus: 'no_purchase',
    brand: 'Keychron',
    model: 'K2',
    barcode: '8850000000034',
    cost: 1650,
    stock: 18,
    minStock: 5,
    warrantyMonths: 12,
  }),
  seedProduct({
    id: 4,
    sku: 'MN-024',
    maxStock: 10,
    suppliers: [link(2, 'DL-P2422H', 3850, 7, 2, true)],
    name: 'จอมอนิเตอร์ 24 นิ้ว',
    categoryId: 4,
    shortName: 'จอ Dell 24" P2422H',
    brand: 'Dell',
    model: 'P2422H',
    barcode: '8850000000041',
    cost: 3900,
    stock: 0,
    minStock: 3,
    warrantyMonths: 36,
    serialControl: true,
    serialPrefix: 'MN',
    serialLength: 10,
  }),
  seedProduct({
    id: 5,
    sku: 'HD-100',
    maxStock: 40,
    suppliers: [link(4, 'SN-CH520', 820, 5, 10, true)],
    name: 'หูฟังบลูทูธ',
    categoryId: 12,
    shortName: 'หูฟัง Sony CH520',
    brand: 'Sony',
    model: 'WH-CH520',
    barcode: '8850000000058',
    cost: 850,
    stock: 25,
    minStock: 8,
    warrantyMonths: 12,
    serialControl: true,
    serialPrefix: 'HD',
    serialLength: null,
  }),
  seedProduct({
    id: 6,
    sku: 'SSD-1T',
    maxStock: 15,
    suppliers: [link(1, 'SS-990E-1T', 1550, 3, 5, true), link(2, 'SSD1T-SAM', 1590, 5, 1)],
    name: 'SSD 1TB',
    categoryId: 9,
    shortName: 'SSD 1TB 990EVO',
    brand: 'Samsung',
    model: '990 EVO',
    barcode: '8850000000065',
    cost: 1590,
    stock: 7,
    minStock: 6,
    warrantyMonths: 60,
    serialControl: true,
    serialPrefix: 'S',
    serialLength: 15,
  }),
  seedProduct({
    id: 7,
    sku: 'CB-USB',
    maxStock: 100,
    suppliers: [link(3, 'USBC-1M', 75, 2, 100, true)],
    name: 'สาย USB-C',
    categoryId: 7,
    shortName: 'สาย USB-C',
    unit: 'เส้น',
    packUnits: [{ unit: 'แพ็ค', factor: 10, barcode: '8850000000133' }],
    barcode: '8850000000072',
    cost: 80,
    stock: 60,
    minStock: 20,
  }),
  // Service SKUs: sold at the POS, never stocked (see ItemType).
  seedProduct({
    id: 8,
    sku: 'SV-ESIM',
    name: 'บริการเปิดเบอร์ eSIM',
    shortName: 'บริการ eSIM',
    itemType: 'service',
    categoryId: 17,
    unit: 'ครั้ง',
    cost: 50,
  }),
  seedProduct({
    id: 9,
    sku: 'SV-SETUP',
    name: 'บริการติดตั้งโปรแกรมและตั้งค่าเครื่อง',
    shortName: 'ค่าติดตั้งโปรแกรม',
    itemType: 'service',
    categoryId: 15,
    unit: 'ครั้ง',
    warrantyMonths: 1,
  }),
];

/** Sale price periods (as of the seed: notebook has expired/active/scheduled, USB cable only expired). */
const SEED_PRICES: SkuPrice[] = [
  {
    id: 1,
    productId: 1,
    price: 26900,
    startDate: '2026-01-01',
    endDate: '2026-06-30',
    note: 'ราคาเปิดตัว',
  },
  { id: 2, productId: 1, price: 24900, startDate: '2026-07-01', endDate: '2026-12-31', note: '' },
  {
    id: 3,
    productId: 1,
    price: 23900,
    startDate: '2027-01-01',
    endDate: null,
    note: 'ปรับราคาปีใหม่',
  },
  { id: 4, productId: 2, price: 590, startDate: '2026-01-01', endDate: null, note: '' },
  { id: 5, productId: 3, price: 2490, startDate: '2026-01-01', endDate: null, note: '' },
  { id: 6, productId: 4, price: 4990, startDate: '2026-01-01', endDate: '2026-10-31', note: '' },
  {
    id: 7,
    productId: 4,
    price: 4590,
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    note: 'โปร 11.11',
  },
  { id: 8, productId: 5, price: 1290, startDate: '2026-01-01', endDate: null, note: '' },
  { id: 9, productId: 6, price: 2190, startDate: '2026-03-01', endDate: null, note: '' },
  {
    id: 10,
    productId: 7,
    price: 199,
    startDate: '2026-01-01',
    endDate: '2026-09-30',
    note: 'รอราคาใหม่',
  },
  { id: 11, productId: 8, price: 199, startDate: '2026-01-01', endDate: null, note: '' },
  { id: 12, productId: 9, price: 500, startDate: '2026-01-01', endDate: null, note: '' },
];

const promo = (
  p: Pick<Promotion, 'id' | 'code' | 'name' | 'type' | 'startDate'> & Partial<Promotion>,
): Promotion => ({ ...PROMOTION_DEFAULTS, ...p });

const SCOPE = (productIds: number[], categoryIds: number[] = []) => ({
  all: false,
  productIds,
  categoryIds,
});

/** Sample promotions as of the seed date (2026-10): active, scheduled and expired ones. */
const SEED_PROMOTIONS: Promotion[] = [
  promo({
    id: 1,
    code: 'PRO-MSKB10',
    name: 'เมาส์และคีย์บอร์ดลด 10%',
    type: 'item_discount',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    priority: 10,
    scope: SCOPE([], [6]),
    discount: { kind: 'percent', value: 10, maxDiscount: null },
  }),
  promo({
    id: 2,
    code: 'PRO-BILL5K',
    name: 'ซื้อครบ ฿5,000 ลด ฿300',
    type: 'bill_discount',
    startDate: '2026-10-01',
    endDate: '2026-12-31',
    stackable: true,
    scope: { all: true, productIds: [], categoryIds: [] },
    minQty: 0,
    minAmount: 5000,
    discount: { kind: 'amount', value: 300, maxDiscount: null },
  }),
  promo({
    id: 3,
    code: 'PRO-NB-GIFT',
    name: 'ซื้อโน้ตบุ๊ก แถมเมาส์ + ลงโปรแกรมฟรี',
    type: 'free_goods',
    startDate: '2026-09-15',
    priority: 20,
    stackable: true,
    scope: SCOPE([1]),
    minQty: 1,
    discount: null,
    freeGoods: {
      items: [
        { productId: 2, qty: 1 },
        { productId: 9, qty: 1 },
      ],
      repeat: true,
      maxSets: null,
    },
  }),
  promo({
    id: 4,
    code: 'PRO-USB-2F1',
    name: 'สาย USB-C ซื้อ 2 แถม 1',
    type: 'free_goods',
    startDate: '2026-09-15',
    scope: SCOPE([7]),
    minQty: 2,
    discount: null,
    freeGoods: { items: [{ productId: 7, qty: 1 }], repeat: true, maxSets: 5 },
  }),
  promo({
    id: 5,
    code: 'PRO-1111',
    name: '11.11 หูฟังลด 15% (สูงสุด ฿300)',
    type: 'item_discount',
    startDate: '2026-11-11',
    endDate: '2026-11-11',
    priority: 30,
    scope: SCOPE([5]),
    discount: { kind: 'percent', value: 15, maxDiscount: 300 },
  }),
  promo({
    id: 6,
    code: 'PRO-SUMMER',
    name: 'ซัมเมอร์ จอ 24 นิ้วลด ฿500',
    type: 'item_discount',
    startDate: '2026-04-01',
    endDate: '2026-05-31',
    scope: SCOPE([4]),
    discount: { kind: 'amount', value: 500, maxDiscount: null },
  }),
];

const SEED_SALES: Sale[] = [
  {
    id: 1,
    orderNo: 'SO-2026-0001',
    customer: 'บริษัท เอ จำกัด',
    date: '2026-09-01T09:15:00Z',
    itemCount: 3,
    total: 52370,
    status: 'paid',
  },
  {
    id: 2,
    orderNo: 'SO-2026-0002',
    customer: 'ร้านบีคอม',
    date: '2026-09-05T13:40:00Z',
    itemCount: 10,
    total: 5900,
    status: 'paid',
  },
  {
    id: 3,
    orderNo: 'SO-2026-0003',
    customer: 'คุณสมศักดิ์',
    date: '2026-09-12T10:05:00Z',
    itemCount: 1,
    total: 4990,
    status: 'cancelled',
  },
  {
    id: 4,
    orderNo: 'SO-2026-0004',
    customer: 'บริษัท ซี เทรดดิ้ง',
    date: '2026-09-20T16:20:00Z',
    itemCount: 5,
    total: 12450,
    status: 'pending',
  },
  {
    id: 5,
    orderNo: 'SO-2026-0005',
    customer: 'คุณมาลี',
    date: '2026-09-28T11:00:00Z',
    itemCount: 2,
    total: 2580,
    status: 'paid',
  },
  {
    id: 6,
    orderNo: 'SO-2026-0006',
    customer: 'ร้านดีไอที',
    date: '2026-10-01T08:30:00Z',
    itemCount: 4,
    total: 8760,
    status: 'pending',
  },
  {
    id: 7,
    orderNo: 'SO-2026-0007',
    customer: 'บริษัท เอ จำกัด',
    date: '2026-10-02T14:45:00Z',
    itemCount: 2,
    total: 49800,
    status: 'paid',
  },
];

const seedDb = (): MockDb => ({
  users: [...SEED_USERS],
  nextId: SEED_USERS.length + 1,
  products: [...SEED_PRODUCTS],
  nextProductId: SEED_PRODUCTS.length + 1,
  sales: [...SEED_SALES],
  serials: [],
  nextSerialId: 1,
  prices: [...SEED_PRICES],
  nextPriceId: SEED_PRICES.length + 1,
  categories: SEED_CATEGORIES.map((c) => ({ ...c })),
  nextCategoryId: SEED_CATEGORIES.length + 1,
  suppliers: SEED_SUPPLIERS.map((x) => ({ ...x })),
  nextSupplierId: SEED_SUPPLIERS.length + 1,
  movements: [],
  nextMovementId: 1,
  promotions: SEED_PROMOTIONS.map((x) => structuredClone(x)),
  nextPromotionId: SEED_PROMOTIONS.length + 1,
});

const LATENCY_MS = 300;

/**
 * Fake backend for development without a real API.
 * Registered only when `environment.useMock` is true (see app.config.ts).
 */
export const mockBackendInterceptor: HttpInterceptorFn = (original, next) => {
  const base = environment.apiUrl.replace(/\/$/, '');
  if (!original.url.startsWith(base + '/')) return next(original);
  // Accept a query string written into the URL as well as HttpParams (like a real server).
  const [url, query] = original.url.split('?');
  const fromUrl = new HttpParams({ fromString: query ?? '' });
  const params = fromUrl
    .keys()
    .reduce((acc, key) => acc.set(key, fromUrl.get(key) ?? ''), original.params);
  const req = original.clone({ url, params });

  const storage = inject(StorageService);
  // Merge with seed so collections added later still exist in an older stored db.
  const db: MockDb = { ...seedDb(), ...storage.get<Partial<MockDb>>(DB_KEY) };
  // Products stored before the SKU master fields existed get defaults filled in.
  db.products = db.products.map((p) => ({ ...PRODUCT_DEFAULTS, ...p }));
  db.nextProductId = Math.max(db.nextProductId, ...db.products.map((p) => p.id + 1));
  db.promotions = db.promotions.map((p) => ({ ...PROMOTION_DEFAULTS, ...p }));
  migrateLegacyPrices(db);
  migrateLegacySkuFields(db);
  refreshCurrentPrices(db);
  refreshCategoryInfo(db);
  refreshSupplierInfo(db);
  // Serial SKUs with stock but no serials (seed / older data) get sample serials.
  const generated = syncSerials(db);
  const costed = migrateCosting(db);
  const path = req.url.slice(base.length + 1);
  const response$ = handle(req, path, db);
  if (generated || costed || req.method !== 'GET') storage.set(DB_KEY, db);

  return response$.pipe(materialize(), delay(LATENCY_MS), dematerialize());
};

/** Routes one request to its handler; `db` is mutated in place for writes. */
function handle(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  if (path === 'auth/login' && req.method === 'POST') {
    return login(req.body as LoginRequest, db.users);
  }
  if (path === 'users' || path.startsWith('users/')) return handleUsers(req, path, db);
  if (path === 'products' || path.startsWith('products/')) return handleProducts(req, path, db);
  if (path === 'prices' || path.startsWith('prices/')) return handlePrices(req, path, db);
  if (path === 'suppliers' || path.startsWith('suppliers/')) {
    return handleSuppliers(req, path, db);
  }
  if (path === 'categories' || path.startsWith('categories/')) {
    return handleCategories(req, path, db);
  }
  if (path === 'sales' || path.startsWith('sales/')) return handleSales(req, path, db);
  if (path === 'promotions' || path.startsWith('promotions/')) {
    return handlePromotions(req, path, db);
  }
  return notFound(req, path);
}

function handleUsers(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const { users } = db;
  if (path === 'users' && req.method === 'GET') {
    return ok([...users]);
  }
  if (path === 'users' && req.method === 'POST') {
    const user: User = {
      ...(req.body as UserPayload),
      id: db.nextId++,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    return ok(user);
  }
  const idMatch = /^users\/(\d+)$/.exec(path);
  if (idMatch) {
    const index = users.findIndex((u) => u.id === Number(idMatch[1]));
    if (index < 0) return error(404, 'ไม่พบผู้ใช้');
    switch (req.method) {
      case 'GET':
        return ok(users[index]);
      case 'PUT':
        users[index] = { ...users[index], ...(req.body as UserPayload) };
        return ok(users[index]);
      case 'DELETE':
        users.splice(index, 1);
        return ok(null);
    }
  }
  return notFound(req, path);
}

/**
 * SKU master + stock:
 * GET/POST /products, GET/PUT/DELETE /products/:id, PUT /products/:id/stock { delta, unitCost?, note? },
 * (service SKUs: stock fields are cleared on save and stock endpoints are rejected)
 * GET /products/:id/movements?from&to (stock card for a date range → StockCardResult),
 * and /products/:id/serials… (see handleSerials)
 */
function handleProducts(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const { products } = db;
  if (path === 'products' && req.method === 'GET') {
    return ok([...products]);
  }
  if (path === 'products' && req.method === 'POST') {
    const payload = withServiceRules(withoutDerived(req.body as ProductPayload));
    const problem = validateSku(payload, db);
    if (problem) return error(400, problem);
    const product: Product = {
      ...payload,
      id: db.nextProductId++,
      stock: 0,
      avgCost: 0,
      currentPrice: null,
      categoryPath: categoryPath(db.categories, payload.categoryId),
    };
    products.push(product);
    return ok(product);
  }
  const movementMatch = /^products\/(\d+)\/movements$/.exec(path);
  if (movementMatch && req.method === 'GET') {
    const productId = Number(movementMatch[1]);
    if (!products.some((p) => p.id === productId)) return error(404, 'ไม่พบ SKU');
    const from = req.params.get('from') || null;
    const to = req.params.get('to') || null;
    const isDate = (d: string | null) => d === null || /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (!isDate(from) || !isDate(to)) return error(400, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD');
    if (from && to && from > to) return error(400, 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
    const own = db.movements.filter((m) => m.productId === productId);
    return ok(buildStockCard(own, from, to));
  }
  const serialMatch = /^products\/(\d+)\/serials(?:\/(\w+))?$/.exec(path);
  if (serialMatch) return handleSerials(req, Number(serialMatch[1]), serialMatch[2], db);

  const idMatch = /^products\/(\d+)$/.exec(path);
  if (idMatch) {
    const id = Number(idMatch[1]);
    const index = products.findIndex((p) => p.id === id);
    if (index < 0) return error(404, 'ไม่พบ SKU');
    switch (req.method) {
      case 'GET':
        return ok(products[index]);
      case 'PUT': {
        const payload = withServiceRules(withoutDerived(req.body as ProductPayload));
        const problem = validateSku(payload, db, id);
        if (problem) return error(400, problem);
        if (payload.serialControl !== products[index].serialControl && products[index].stock > 0) {
          return error(400, 'ยังมีสต็อกคงเหลือ เปลี่ยนการคุม Serial ไม่ได้');
        }
        if (payload.itemType !== products[index].itemType && products[index].stock > 0) {
          return error(400, 'ยังมีสต็อกคงเหลือ เปลี่ยนเป็นสินค้าบริการไม่ได้');
        }
        // Stock is owned by the Inventory menu; never overwritten from the SKU form.
        products[index] = {
          ...products[index],
          ...payload,
          id,
          stock: products[index].stock,
          categoryPath: categoryPath(db.categories, payload.categoryId),
        };
        return ok(products[index]);
      }
      case 'DELETE': {
        if (products[index].stock > 0) return error(400, 'ยังมีสต็อกคงเหลือ ลบไม่ได้');
        const usedBy = promotionsUsing(db, (p) => promotionRefersToProduct(p, id));
        if (usedBy) return error(400, `SKU นี้อยู่ในโปรโมชั่น ${usedBy} ลบไม่ได้`);
        products.splice(index, 1);
        return ok(null);
      }
    }
  }
  const stockMatch = /^products\/(\d+)\/stock$/.exec(path);
  if (stockMatch && req.method === 'PUT') {
    const index = products.findIndex((p) => p.id === Number(stockMatch[1]));
    if (index < 0) return error(404, 'ไม่พบสินค้า');
    if (isService(products[index])) return error(400, 'สินค้าบริการไม่มีสต็อก');
    if (products[index].serialControl) {
      return error(400, 'สินค้าคุม Serial ต้องรับเข้า/ตัดออกด้วย Serial');
    }
    const {
      delta,
      unitCost,
      note = '',
    } = req.body as {
      delta: number;
      unitCost?: number;
      note?: string;
    };
    if (!Number.isInteger(delta) || delta === 0) return error(400, 'จำนวนไม่ถูกต้อง');
    const current = products[index];
    if (delta > 0) {
      const blocked = purchaseBlocked(current);
      if (blocked) return blocked;
      // Moving weighted average: every receipt re-averages the cost.
      const cost = unitCost ?? current.cost;
      if (!(cost >= 0)) return error(400, 'ต้นทุนต้องไม่ติดลบ');
      products[index] = {
        ...current,
        stock: current.stock + delta,
        avgCost: movingAverage(current.stock, current.avgCost, delta, cost),
      };
      recordMovement(db, products[index], 'receive', delta, cost, delta * cost, [], note);
    } else {
      if (current.stock + delta < 0) return error(400, 'สต็อกคงเหลือไม่พอ');
      // Issues go out at the current average; the average itself does not change.
      products[index] = { ...current, stock: current.stock + delta };
      const total = delta * current.avgCost;
      recordMovement(db, products[index], 'issue', delta, current.avgCost, total, [], note);
    }
    return ok(products[index]);
  }
  return notFound(req, path);
}

/** Serial SKU: stock = in-stock serials, avgCost = mean of their own costs (kept when none). */
function withSerialStock(product: Product, db: MockDb): Product {
  const inStock = db.serials.filter((s) => s.productId === product.id && s.status === 'in_stock');
  const avgCost = inStock.length
    ? Math.round((inStock.reduce((sum, s) => sum + s.cost, 0) / inStock.length) * 10000) / 10000
    : product.avgCost;
  return { ...product, stock: inStock.length, avgCost };
}

/** Appends a stock-card line; balances come from the product *after* the movement. */
function recordMovement(
  db: MockDb,
  product: Product,
  type: MovementType,
  qty: number,
  unitCost: number,
  totalCost: number,
  serials: string[],
  note: string,
): void {
  db.movements.push({
    id: db.nextMovementId++,
    productId: product.id,
    date: new Date().toISOString(),
    type,
    qty,
    unitCost: round2(unitCost),
    totalCost: round2(totalCost),
    balanceQty: product.stock,
    balanceAvgCost: product.avgCost,
    balanceValue: costValue(product),
    serials,
    note,
  });
}

/**
 * Data stored before costing existed: serials get the SKU cost, non-serial SKUs with stock
 * start their average at the standard cost, and every SKU with stock gets an opening line.
 */
function migrateCosting(db: MockDb): boolean {
  let changed = false;
  for (const serial of db.serials as (SerialNumber & { cost?: number })[]) {
    if (serial.cost === undefined) {
      serial.cost = db.products.find((p) => p.id === serial.productId)?.cost ?? 0;
      changed = true;
    }
  }
  db.products = db.products.map((p) => {
    let product = p;
    if (p.serialControl) {
      product = withSerialStock(p, db);
    } else if (p.stock > 0 && p.avgCost === 0 && p.cost > 0) {
      product = { ...p, avgCost: p.cost };
    }
    if (product.avgCost !== p.avgCost) changed = true;
    if (product.stock > 0 && !db.movements.some((m) => m.productId === product.id)) {
      const serials = product.serialControl
        ? db.serials
            .filter((s) => s.productId === product.id && s.status === 'in_stock')
            .map((s) => s.serial)
        : [];
      recordMovement(
        db,
        product,
        'opening',
        product.stock,
        product.avgCost,
        costValue(product),
        serials,
        'ยอดยกมา',
      );
      changed = true;
    }
    return product;
  });
  return changed;
}

/** Generates deterministic sample serials so serial SKUs always have stock = in-stock serials. */
function syncSerials(db: MockDb): boolean {
  let changed = false;
  for (const product of db.products) {
    if (!product.serialControl) continue;
    const owned = db.serials.filter((s) => s.productId === product.id);
    let inStock = owned.filter((s) => s.status === 'in_stock').length;
    let seq = owned.length;
    while (inStock < product.stock) {
      const serial = sampleSerial(product, ++seq);
      if (db.serials.some((s) => s.serial === serial)) continue;
      db.serials.push({
        id: db.nextSerialId++,
        productId: product.id,
        serial,
        status: 'in_stock',
        receivedAt: new Date().toISOString(),
        removedAt: null,
        note: 'ข้อมูลตัวอย่าง',
        cost: product.avgCost || product.cost,
      });
      inStock++;
      changed = true;
    }
  }
  return changed;
}

/** e.g. prefix NB, length 12, product 1, seq 7 → 'NB-100000007' */
function sampleSerial(product: Product, seq: number): string {
  const head = product.serialPrefix ? `${product.serialPrefix}-` : '';
  const id = String(product.id);
  const bodyLength = product.serialLength
    ? Math.max(product.serialLength - head.length, id.length + 1)
    : id.length + 4;
  return head + id + String(seq).padStart(bodyLength - id.length, '0');
}

/**
 * Serial numbers of one SKU:
 * GET /products/:id/serials, POST /products/:id/serials { serials },
 * POST /products/:id/serials/remove { ids, status, note }
 */
function handleSerials(
  req: HttpRequest<unknown>,
  productId: number,
  action: string | undefined,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const index = db.products.findIndex((p) => p.id === productId);
  if (index < 0) return error(404, 'ไม่พบ SKU');
  const product = db.products[index];
  if (!product.serialControl) return error(400, `${product.sku} ไม่ได้ควบคุม Serial`);

  /** Serial SKU stock = in-stock serials; avgCost = mean of their own costs. */
  const recount = (): Product => {
    db.products[index] = withSerialStock(product, db);
    return db.products[index];
  };

  if (!action && req.method === 'GET') {
    return ok(db.serials.filter((s) => s.productId === productId));
  }

  if (!action && req.method === 'POST') {
    const blocked = purchaseBlocked(product);
    if (blocked) return blocked;
    const body = req.body as { serials: string[]; unitCost?: number; note?: string };
    const serials = body.serials.map((s) => s.trim().toUpperCase());
    if (!serials.length) return error(400, 'ไม่มี Serial ที่จะรับเข้า');
    // Specific identification: every received unit carries its own purchase cost.
    const unitCost = body.unitCost ?? product.cost;
    if (!(unitCost >= 0)) return error(400, 'ต้นทุนต้องไม่ติดลบ');
    const problems: string[] = [];
    serials.forEach((serial, i) => {
      const formatError = serialFormatError(serial, product);
      if (formatError) problems.push(`${serial}: ${formatError}`);
      else if (serials.indexOf(serial) !== i) problems.push(`${serial}: ซ้ำในรายการ`);
      else if (db.serials.some((s) => s.serial === serial && s.status === 'in_stock')) {
        problems.push(`${serial}: มีอยู่ในคลังแล้ว`);
      }
    });
    if (problems.length) return error(400, `รับเข้าไม่ได้ — ${problems.join(', ')}`);

    const now = new Date().toISOString();
    const received = serials.map((serial) => {
      const existing = db.serials.find((s) => s.serial === serial);
      if (existing) {
        // A previously removed unit coming back (e.g. customer return).
        Object.assign(existing, {
          productId,
          status: 'in_stock',
          receivedAt: now,
          removedAt: null,
          note: 'รับคืนเข้าคลัง',
          cost: unitCost,
        });
        return existing;
      }
      const created: SerialNumber = {
        id: db.nextSerialId++,
        productId,
        serial,
        status: 'in_stock',
        receivedAt: now,
        removedAt: null,
        note: '',
        cost: unitCost,
      };
      db.serials.push(created);
      return created;
    });
    const updated = recount();
    recordMovement(
      db,
      updated,
      'receive',
      received.length,
      unitCost,
      received.length * unitCost,
      received.map((s) => s.serial),
      body.note ?? '',
    );
    const result: SerialReceiveResult = { product: updated, received };
    return ok(result);
  }

  if (action === 'remove' && req.method === 'POST') {
    const { ids, status, note } = req.body as {
      ids: number[];
      status: SerialRemoveStatus;
      note: string;
    };
    if (!ids.length) return error(400, 'ไม่ได้เลือก Serial');
    const targets = ids.map((id) =>
      db.serials.find((s) => s.id === id && s.productId === productId && s.status === 'in_stock'),
    );
    if (targets.some((t) => !t)) return error(400, 'มี Serial ที่ไม่อยู่ในคลังแล้ว กรุณาโหลดใหม่');
    const now = new Date().toISOString();
    const removed = targets as SerialNumber[];
    for (const serial of removed) {
      Object.assign(serial, { status, removedAt: now, note });
    }
    // Issue cost = the removed units' own costs (specific identification).
    const total = removed.reduce((sum, s) => sum + s.cost, 0);
    const updated = recount();
    recordMovement(
      db,
      updated,
      'issue',
      -removed.length,
      total / removed.length,
      -total,
      removed.map((s) => s.serial),
      [SERIAL_STATUS_LABEL[status], note].filter(Boolean).join(' · '),
    );
    return ok(updated);
  }

  return notFound(req, `products/${productId}/serials${action ? '/' + action : ''}`);
}

/** Sets `currentPrice` on every product from today's effective price period. */
function refreshCurrentPrices(db: MockDb): void {
  const today = todayIso();
  for (const product of db.products) {
    const own = db.prices.filter((p) => p.productId === product.id);
    product.currentPrice = effectivePrice(own, today)?.price ?? null;
  }
}

/**
 * Older stored products carried a single `price`; turn it into an open-ended
 * period (if that SKU has none yet) and drop the field.
 */
function migrateLegacyPrices(db: MockDb): void {
  for (const product of db.products as (Product & { price?: number })[]) {
    if (product.price === undefined) continue;
    if (!db.prices.some((p) => p.productId === product.id)) {
      db.prices.push({
        id: db.nextPriceId++,
        productId: product.id,
        price: product.price,
        startDate: '2026-01-01',
        endDate: null,
        note: 'ย้ายจากราคาเดิมใน SKU',
      });
    }
    delete product.price;
  }
}

/** GET /prices[?productId=], POST /prices, PUT/DELETE /prices/:id */
function handlePrices(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const { prices } = db;

  const validate = (payload: SkuPricePayload, exceptId?: number): string | null => {
    if (!db.products.some((p) => p.id === payload.productId)) return 'ไม่พบ SKU';
    if (!(payload.price >= 0)) return 'ราคาต้องไม่ติดลบ';
    if (!payload.startDate) return 'กรุณาระบุวันที่เริ่ม';
    if (payload.endDate && payload.endDate < payload.startDate) {
      return 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม';
    }
    const overlap = findOverlap(prices, payload, exceptId);
    return overlap
      ? `ช่วงวันที่ทับกับราคา ฿${overlap.price.toLocaleString('en-US')} (${formatDateRange(overlap)})`
      : null;
  };

  if (path === 'prices' && req.method === 'GET') {
    const productId = Number(req.params.get('productId')) || null;
    return ok(prices.filter((p) => productId === null || p.productId === productId));
  }
  if (path === 'prices' && req.method === 'POST') {
    const payload = req.body as SkuPricePayload;
    const problem = validate(payload);
    if (problem) return error(400, problem);
    const created: SkuPrice = {
      ...payload,
      endDate: payload.endDate || null,
      id: db.nextPriceId++,
    };
    prices.push(created);
    refreshCurrentPrices(db);
    return ok(created);
  }
  const idMatch = /^prices\/(\d+)$/.exec(path);
  if (idMatch) {
    const id = Number(idMatch[1]);
    const index = prices.findIndex((p) => p.id === id);
    if (index < 0) return error(404, 'ไม่พบช่วงราคา');
    switch (req.method) {
      case 'PUT': {
        const payload = req.body as SkuPricePayload;
        const problem = validate(payload, id);
        if (problem) return error(400, problem);
        prices[index] = { ...payload, endDate: payload.endDate || null, id };
        refreshCurrentPrices(db);
        return ok(prices[index]);
      }
      case 'DELETE':
        prices.splice(index, 1);
        refreshCurrentPrices(db);
        return ok(null);
    }
  }
  return notFound(req, path);
}

/**
 * Older stored products had `category` (free text) and `active` (boolean).
 * Map them to `categoryId` / `saleStatus`; unknown text categories fall back to the
 * seed SKU with the same code, else null ("ยังไม่ระบุหมวด").
 */
function migrateLegacySkuFields(db: MockDb): void {
  type Legacy = Product & { category?: string; active?: boolean };
  for (const product of db.products as Legacy[]) {
    if (product.category !== undefined) {
      const seed = SEED_PRODUCTS.find((s) => s.sku === product.sku);
      const leaf = db.categories.find(
        (c) => c.name === product.category && isLeaf(db.categories, c.id),
      );
      product.categoryId = leaf?.id ?? seed?.categoryId ?? null;
      if (seed && !product.shortName) product.shortName = seed.shortName;
      if (seed && !product.packUnits.length && !product.serialControl) {
        product.packUnits = seed.packUnits;
      }
      delete product.category;
    }
    if (product.active !== undefined) {
      product.saleStatus = product.active ? 'active' : 'discontinued';
      delete product.active;
    }
  }
}

/** Server-derived fields: product.categoryPath and category.productCount. */
function refreshCategoryInfo(db: MockDb): void {
  for (const product of db.products) {
    product.categoryPath = categoryPath(db.categories, product.categoryId);
  }
  for (const category of db.categories) {
    category.productCount = db.products.filter((p) => p.categoryId === category.id).length;
  }
}

/** SKU master validation shared by create/update. Returns a Thai message or null. */
function validateSku(payload: ProductPayload, db: MockDb, exceptId?: number): string | null {
  const others = db.products.filter((p) => p.id !== exceptId);
  if (payload.itemType !== 'stock' && payload.itemType !== 'service') {
    return 'ประเภทสินค้าไม่ถูกต้อง';
  }
  if (others.some((p) => p.sku.toUpperCase() === payload.sku.toUpperCase())) {
    return `รหัส SKU ${payload.sku} ซ้ำ`;
  }
  const category = db.categories.find((c) => c.id === payload.categoryId);
  if (!category) return 'กรุณาเลือกหมวดหมู่';
  if (!category.active || !isLeaf(db.categories, category.id)) {
    return 'ต้องเลือกหมวดหมู่ย่อยสุดที่เปิดใช้งาน';
  }
  if ((payload.shortName ?? '').length > SHORT_NAME_MAX) {
    return `ชื่อย่อต้องไม่เกิน ${SHORT_NAME_MAX} ตัวอักษร`;
  }
  const packs = payload.packUnits ?? [];
  if (payload.serialControl && packs.length) return 'สินค้าคุม Serial มีได้หน่วยเดียว';
  const units = packs.map((u) => u.unit.trim());
  if (packs.some((u) => !Number.isInteger(u.factor) || u.factor <= 1)) {
    return 'ตัวคูณของหน่วยต้องเป็นจำนวนเต็มมากกว่า 1';
  }
  if (units.some((u, i) => !u || u === payload.unit || units.indexOf(u) !== i)) {
    return 'ชื่อหน่วยต้องไม่ว่าง ไม่ซ้ำกัน และไม่ซ้ำหน่วยฐาน';
  }
  const own = allBarcodes(payload);
  const taken = own.filter(
    (code, i) => own.indexOf(code) !== i || others.some((p) => allBarcodes(p).includes(code)),
  );
  if (taken.length) return `บาร์โค้ดซ้ำ: ${[...new Set(taken)].join(', ')}`;
  return validateSkuSuppliers(payload, db);
}

/** Drops server-derived / foreign fields a client may send with SKU master data. */
function withoutDerived(payload: ProductPayload): ProductPayload {
  const rest = { ...payload } as ProductPayload & {
    price?: number;
    currentPrice?: number | null;
    categoryPath?: string;
  };
  delete rest.price;
  delete rest.currentPrice;
  delete rest.categoryPath;
  delete (rest as { avgCost?: number }).avgCost;
  return rest;
}

/** Rejects receiving stock for SKUs whose status forbids purchasing. */
function purchaseBlocked(product: Product): Observable<never> | null {
  return canPurchase(product)
    ? null
    : error(400, `สถานะ "${SKU_STATUS_LABEL[product.saleStatus]}" ห้ามรับเข้าสินค้า`);
}

/** GET/POST /categories, PUT/DELETE /categories/:id */
function handleCategories(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const { categories } = db;

  const validate = (payload: CategoryPayload, exceptId?: number): string | null => {
    if (!/^[A-Z0-9-]+$/.test(payload.code ?? '')) return 'รหัสใช้ได้เฉพาะ A-Z, 0-9 และ -';
    if (!payload.name?.trim()) return 'กรุณากรอกชื่อหมวดหมู่';
    if (categories.some((c) => c.id !== exceptId && c.code === payload.code)) {
      return `รหัส ${payload.code} ซ้ำ`;
    }
    return null;
  };

  if (path === 'categories' && req.method === 'GET') {
    return ok([...categories]);
  }
  if (path === 'categories' && req.method === 'POST') {
    const payload = req.body as CategoryPayload;
    const problem = validate(payload);
    if (problem) return error(400, problem);
    const parent = categories.find((c) => c.id === payload.parentId);
    if (payload.parentId !== null && !parent) return error(400, 'ไม่พบหมวดหมู่แม่');
    if (parent && parent.level >= CATEGORY_MAX_LEVEL) {
      return error(400, `แบ่งหมวดหมู่ได้ไม่เกิน ${CATEGORY_MAX_LEVEL} ระดับ`);
    }
    if (parent?.productCount) {
      return error(
        400,
        `${parent.name} มี SKU อยู่ ${parent.productCount} รายการ แบ่งหมวดย่อยไม่ได้`,
      );
    }
    const created: Category = {
      ...payload,
      name: payload.name.trim(),
      id: db.nextCategoryId++,
      level: (parent ? parent.level + 1 : 1) as CategoryLevel,
      productCount: 0,
    };
    categories.push(created);
    return ok(created);
  }
  const idMatch = /^categories\/(\d+)$/.exec(path);
  if (idMatch) {
    const id = Number(idMatch[1]);
    const index = categories.findIndex((c) => c.id === id);
    if (index < 0) return error(404, 'ไม่พบหมวดหมู่');
    switch (req.method) {
      case 'PUT': {
        const payload = req.body as CategoryPayload;
        const problem = validate(payload, id);
        if (problem) return error(400, problem);
        // Moving between parents is not supported; parent/level stay as they are.
        categories[index] = {
          ...categories[index],
          code: payload.code,
          name: payload.name.trim(),
          active: payload.active,
        };
        return ok(categories[index]);
      }
      case 'DELETE': {
        if (!isLeaf(categories, id)) return error(400, 'ยังมีหมวดหมู่ย่อย ลบไม่ได้');
        if (categories[index].productCount) {
          return error(400, `ยังมี SKU ${categories[index].productCount} รายการในหมวดนี้ ลบไม่ได้`);
        }
        const usedBy = promotionsUsing(db, (p) => p.scope.categoryIds.includes(id));
        if (usedBy) return error(400, `หมวดหมู่นี้อยู่ในโปรโมชั่น ${usedBy} ลบไม่ได้`);
        categories.splice(index, 1);
        return ok(null);
      }
    }
  }
  return notFound(req, path);
}

/** Server-derived supplier.productCount (SKUs linking the supplier). */
function refreshSupplierInfo(db: MockDb): void {
  for (const supplier of db.suppliers) {
    supplier.productCount = db.products.filter((p) =>
      p.suppliers.some((l) => l.supplierId === supplier.id),
    ).length;
  }
}

/** SKU ↔ supplier link rules. Returns a Thai message or null. */
function validateSkuSuppliers(payload: ProductPayload, db: MockDb): string | null {
  const links = payload.suppliers ?? [];
  if ((payload.maxStock ?? 0) > 0 && payload.maxStock < payload.minStock) {
    return 'สต็อกสูงสุดต้องไม่น้อยกว่าจุดสั่งซื้อ';
  }
  if (!links.length) return null;
  const ids = links.map((l) => l.supplierId);
  if (new Set(ids).size !== ids.length) return 'ผู้จำหน่ายซ้ำกันใน SKU นี้';
  if (links.filter((l) => l.isMain).length !== 1) return 'ต้องเลือกผู้จำหน่ายหลัก 1 ราย';
  if (ids.some((id) => !db.suppliers.some((s) => s.id === id))) return 'ไม่พบผู้จำหน่าย';
  if (links.some((l) => l.cost < 0 || l.leadTimeDays < 0 || l.moq < 0)) {
    return 'ราคาซื้อ / lead time / MOQ ต้องไม่ติดลบ';
  }
  return null;
}

/** GET/POST /suppliers, GET/PUT/DELETE /suppliers/:id */
function handleSuppliers(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const { suppliers } = db;

  const validate = (p: SupplierPayload, exceptId?: number): string | null => {
    if (!/^[A-Z0-9-]+$/.test(p.code ?? '')) return 'รหัสใช้ได้เฉพาะ A-Z, 0-9 และ -';
    if (!p.name?.trim()) return 'กรุณากรอกชื่อผู้จำหน่าย';
    if (!isValidThaiTaxId(p.taxId)) return 'เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง';
    if (p.branchType === 'branch' && !/^\d{5}$/.test(p.branchNo))
      return 'เลขสาขาต้องเป็นตัวเลข 5 หลัก';
    if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) return 'อีเมลไม่ถูกต้อง';
    if (!(p.creditDays >= 0)) return 'เครดิตเทอมต้องไม่ติดลบ';
    const others = suppliers.filter((s) => s.id !== exceptId);
    if (others.some((s) => s.code === p.code)) return `รหัส ${p.code} ซ้ำ`;
    if (
      others.some(
        (s) => s.taxId === p.taxId && s.branchType === p.branchType && s.branchNo === p.branchNo,
      )
    ) {
      return 'เลขผู้เสียภาษีและสาขานี้มีอยู่แล้ว';
    }
    return null;
  };
  const normalize = (p: SupplierPayload): SupplierPayload => ({
    ...SUPPLIER_DEFAULTS,
    ...p,
    name: p.name.trim(),
    branchNo: p.branchType === 'head' ? '' : p.branchNo,
  });

  if (path === 'suppliers' && req.method === 'GET') {
    return ok([...suppliers]);
  }
  if (path === 'suppliers' && req.method === 'POST') {
    const payload = normalize(req.body as SupplierPayload);
    const problem = validate(payload);
    if (problem) return error(400, problem);
    const created: Supplier = { ...payload, id: db.nextSupplierId++, productCount: 0 };
    suppliers.push(created);
    return ok(created);
  }
  const idMatch = /^suppliers\/(\d+)$/.exec(path);
  if (idMatch) {
    const id = Number(idMatch[1]);
    const index = suppliers.findIndex((s) => s.id === id);
    if (index < 0) return error(404, 'ไม่พบผู้จำหน่าย');
    switch (req.method) {
      case 'GET':
        return ok(suppliers[index]);
      case 'PUT': {
        const payload = normalize(req.body as SupplierPayload);
        const problem = validate(payload, id);
        if (problem) return error(400, problem);
        suppliers[index] = { ...suppliers[index], ...payload, id };
        return ok(suppliers[index]);
      }
      case 'DELETE':
        if (suppliers[index].productCount) {
          return error(
            400,
            `ยังผูกกับ SKU ${suppliers[index].productCount} รายการ ลบไม่ได้ (ปิดใช้งานแทน)`,
          );
        }
        suppliers.splice(index, 1);
        return ok(null);
    }
  }
  return notFound(req, path);
}

/** True when the promotion lists the SKU as a qualifying or free item. */
function promotionRefersToProduct(p: Promotion, productId: number): boolean {
  return (
    p.scope.productIds.includes(productId) ||
    !!p.freeGoods?.items.some((i) => i.productId === productId)
  );
}

/** Codes of not-yet-expired promotions matching `test` (expired ones are history only). */
function promotionsUsing(db: MockDb, test: (p: Promotion) => boolean): string {
  const today = todayIso();
  return db.promotions
    .filter((p) => promotionStatus(p, today) !== 'expired' && test(p))
    .map((p) => p.code)
    .join(', ');
}

/** GET/POST /promotions, GET/PUT/DELETE /promotions/:id */
function handlePromotions(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const { promotions } = db;
  const ctx = () => ({
    products: db.products,
    categories: db.categories,
    promotions,
    today: todayIso(),
  });
  const normalize = (p: PromotionPayload): PromotionPayload => ({
    ...PROMOTION_DEFAULTS,
    ...p,
    code: (p.code ?? '').trim().toUpperCase(),
    name: (p.name ?? '').trim(),
    endDate: p.endDate || null,
    // Bill discounts apply to the whole bill: no item scope.
    scope:
      p.type === 'bill_discount'
        ? { all: true, productIds: [], categoryIds: [] }
        : (p.scope ?? PROMOTION_DEFAULTS.scope),
  });

  if (path === 'promotions' && req.method === 'GET') {
    return ok([...promotions]);
  }
  if (path === 'promotions' && req.method === 'POST') {
    const payload = normalize(req.body as PromotionPayload);
    const problem = promotionError(payload, ctx());
    if (problem) return error(400, problem);
    const created: Promotion = { ...payload, id: db.nextPromotionId++ };
    promotions.push(created);
    return ok(created);
  }
  const idMatch = /^promotions\/(\d+)$/.exec(path);
  if (idMatch) {
    const id = Number(idMatch[1]);
    const index = promotions.findIndex((p) => p.id === id);
    if (index < 0) return error(404, 'ไม่พบโปรโมชั่น');
    switch (req.method) {
      case 'GET':
        return ok(promotions[index]);
      case 'PUT': {
        const payload = normalize(req.body as PromotionPayload);
        const problem = promotionError(payload, ctx(), promotions[index]);
        if (problem) return error(400, problem);
        promotions[index] = { ...payload, id };
        return ok(promotions[index]);
      }
      case 'DELETE':
        if (hasStarted(promotions[index], todayIso())) {
          return error(400, 'โปรที่เริ่มแล้วลบไม่ได้ (ปิดใช้งานแทน)');
        }
        promotions.splice(index, 1);
        return ok(null);
    }
  }
  return notFound(req, path);
}

/** GET /sales, PUT /sales/:id/status { status } */
function handleSales(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const { sales } = db;
  if (path === 'sales' && req.method === 'GET') {
    return ok([...sales]);
  }
  const statusMatch = /^sales\/(\d+)\/status$/.exec(path);
  if (statusMatch && req.method === 'PUT') {
    const index = sales.findIndex((s) => s.id === Number(statusMatch[1]));
    if (index < 0) return error(404, 'ไม่พบคำสั่งขาย');
    const { status } = req.body as { status: SaleStatus };
    sales[index] = { ...sales[index], status };
    return ok(sales[index]);
  }
  return notFound(req, path);
}

function login(
  { username, password }: LoginRequest,
  users: User[],
): Observable<HttpResponse<LoginResponse>> {
  if (username === 'admin' && password === 'admin') {
    return ok({ token: 'mock-jwt-token', user: users[0] });
  }
  return error(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
}

function ok<T>(body: T): Observable<HttpResponse<T>> {
  return of(new HttpResponse({ status: 200, body }));
}

function notFound(req: HttpRequest<unknown>, path: string): Observable<never> {
  return error(404, `Mock: ไม่มี endpoint ${req.method} ${path}`);
}

function error(status: number, message: string): Observable<never> {
  return throwError(
    () => new HttpErrorResponse({ status, error: { message }, statusText: message }),
  );
}
