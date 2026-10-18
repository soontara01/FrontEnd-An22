import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpParams,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, delay, dematerialize, map, materialize, of, throwError } from 'rxjs';
import { environment } from '@env/environment';
import {
  CATEGORY_MAX_LEVEL,
  Category,
  CategoryLevel,
  CategoryPayload,
  Branch,
  BranchHere,
  BranchStock,
  branchDocPrefix,
  BranchStockRow,
  Company,
  HEAD_OFFICE_BRANCH_NO,
  withBranchStock,
  Transfer,
  TransferLine,
  TransferPayload,
  TransferReceivePayload,
  cancelTransferError,
  receiveTransferError,
  transferError,
  branchScopeError,
  parseBranchScope,
  BRANCH_DEFAULTS,
  BranchDetails,
  BranchPayload,
  CompanyInfo,
  COMPANY_INFO_DEFAULTS,
  branchDetailsError,
  branchError,
  companyInfoError,
  companyInfoOf,
  normalizeBranch,
  normalizeCompanyInfo,
  storeInfoOf,
  LoginRequest,
  MeResponse,
  normalizeCompanyCode,
  LoginResponse,
  PAYMENT_METHOD_DEFAULTS,
  PRODUCT_DEFAULTS,
  PROMOTION_DEFAULTS,
  Product,
  PaymentMethod,
  PaymentMethodPayload,
  ProductPayload,
  Promotion,
  PromotionPayload,
  CreditNote,
  CreditNotePayload,
  Exchange,
  ExchangeLine,
  ExchangePayload,
  TaxInvoice,
  TaxInvoiceBuyer,
  Sale,
  SaleLine,
  SalePayload,
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
  STORE_INFO_DEFAULTS,
  StoreInfo,
  SUPPLIER_DEFAULTS,
  SkuPricePayload,
  Supplier,
  SupplierPayload,
  User,
  NewUserPayload,
  UserPayload,
  normalizeUsername,
  canWorkIn,
  isCompanyAdmin,
  passwordError,
  userBranchError,
  userChangeError,
  hasAdminRights,
  isOwner,
  ROLE_LABEL,
  CompanyDeletion,
  CompanyExport,
  DELETION_WAIT_DAYS,
  DeletionRequest,
  EXPORT_SCHEMA_VERSION,
  deletionRequestError,
  purgeError,
  AuditActorKind,
  PlatformAdmin,
  PlatformEmail,
  PlatformCompanyDetail,
  PlatformCompanyRow,
  PlatformLoginResponse,
  payInvoiceError,
  reactivateCompanyError,
  suspendCompanyError,
  FORGOT_PASSWORD_ANSWER,
  OnboardingCounts,
  RESET_LINK_MINUTES,
  SignupPayload,
  TRIAL_DAYS,
  signupError,
  BillingInvoice,
  CompanySuspendReason,
  INVOICE_DUE_DAYS,
  Subscription,
  addMonthsIso,
  billingNotice,
  periodsToInvoice,
  subscriptionStatus,
  LimitKind,
  PLANS,
  PlanId,
  PlanUsage,
  SubscriptionInfo,
  planLimitError,
  planOf,
  planUsage,
  AuditEvent,
  AuditRef,
  filterAuditEvents,
  parseAuditQuery,
  ownerRoleError,
  ownerTransferError,
  userIdentityError,
  userScopeError,
  usernameError,
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
  isLastActiveCash,
  isValidThaiTaxId,
  paymentMethodError,
  withPaymentTypeRules,
  promotionBranchScopeError,
  promotionError,
  promotionStatus,
  hasStarted,
  serialFormatError,
  todayIso,
  addDaysIso,
  toIsoDate,
  cartError,
  paymentError,
  paymentSummary,
  priceCart,
  PricedCart,
  manualDiscountError,
  voidError,
  VoidPayload,
  saleDay,
  soldWithVat,
  moneyInputError,
  MenuAccess,
  DEFAULT_USER_MENUS,
  menuAccessError,
  moneyProblem,
  moneyProblemText,
  normalizeSale,
  normalizeShift,
  normalizeStoreInfo,
  creditNoteError,
  draftCreditNote,
  returnSummary,
  toRefunds,
  normalizeBuyer,
  taxInvoiceError,
  checkoutBuyerError,
  TAX_INVOICE_DEFAULTS,
  currentInvoice,
  reissueError,
  storeInfoError,
  currentSerial,
  exchangeError,
  CashMovement,
  CashMovementPayload,
  Shift,
  ShiftAction,
  ShiftClosePayload,
  ShiftContext,
  ShiftCountInput,
  ShiftOpenPayload,
  DrawerOpen,
  DrawerOpenPayload,
  ShiftAdjustment,
  ShiftAdjustmentPayload,
  drawerOpenError,
  shiftAdjustmentError,
  countCheck,
  countInputsError,
  approvalStatusFor,
  buildShiftCounts,
  cashMovementError,
  closeShiftError,
  drawerExpected,
  expectedByMethod,
  openShiftError,
  requireShiftChangeError,
  shiftBlocker,
  shiftDay,
  shiftSummary,
  varianceReport,
  exchangeNos,
  POS_TERMINAL_DEFAULTS,
  PosTerminal,
  normalizePosTerminal,
  posTerminalError,
  terminalError,
  terminalOrderPrefix,
  canSeeCost,
  hideCost,
  belowCostIssues,
} from '../models';
import { MENU } from '../navigation/menu.config';
import { StorageService } from '../services/storage.service';

interface MockDb {
  users: User[];
  nextId: number;
  /** SKU master (company level); stock / avgCost / min / max live in `branchStock`. */
  products: Product[];
  nextProductId: number;
  /**
   * Stock of each SKU per branch (SaaS step 3, D1). `products` is filled in with the request's
   * branch on read (`atBranch()`) and written back here before saving (`storeBranchStock()`).
   */
  branchStock: BranchStock[];
  /** Set once the single store-wide stock moved into the first branch (`migrateBranchStock()`). */
  branchStockMigrated?: boolean;
  /** Set once older documents got their terminal's branch (`fixDocumentBranches()`, E20). */
  docBranchFixed?: boolean;
  /** Stock transfers between branches (SaaS step 5). */
  transfers: Transfer[];
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
  /** Payment method master (POS tender buttons), ordered by sortOrder. */
  paymentMethods: PaymentMethod[];
  nextPaymentMethodId: number;
  /**
   * The details documents print for the request's branch: `storeInfoOf(companyInfo, branch)`, set
   * per request and never saved (E11). Older stored dbs kept the whole store here; it is split into
   * `companyInfo` + branch details once (`splitStoreInfo()`).
   */
  storeInfo: StoreInfo;
  /** Company settings (Settings → ข้อมูลบริษัท). */
  companyInfo: CompanyInfo;
  /** Menus the `user` role sees (admins see all); set on `/users/menu-access`. */
  menuAccess: MenuAccess;
  /** Credit notes (returns after the day of sale). */
  creditNotes: CreditNote[];
  /** Same-SKU exchanges (stock only, no money). */
  exchanges: Exchange[];
  /** Full tax invoices (one per bill, on request). */
  taxInvoices: TaxInvoice[];
  /** POS shifts (one open shift per terminal) and their cash in / out of the drawer. */
  shifts: Shift[];
  cashMovements: CashMovement[];
  /** Drawer opened without a sale (S7) and corrections of closed shifts (S8). */
  drawerOpens: DrawerOpen[];
  shiftAdjustments: ShiftAdjustment[];
  /** Set once shifts were switched on for this stored db (see `enableShifts()`). */
  shiftsEnabled?: boolean;
  /** POS terminal registry: number + Revenue Dept POS ID per cash drawer (terminal plan). */
  posTerminals: PosTerminal[];
  /**
   * The store-wide POS ID from before the registry (`StoreInfo.posId`): what older receipts /
   * Z reports printed, filled into their missing snapshots on read.
   */
  legacyPosId?: string;
  /** Branches of the company with their printed details (seed: HQ + BN). */
  branches: Branch[];
  nextBranchId: number;
  /** Passwords by user id (a real API keeps a hash); none = `admin` for the first user, else `1234` (E10). */
  passwords: Record<number, string>;
  /** Audit log (E40): appended by `recordAudit()` / `pushAudit()`, never edited or deleted. */
  auditLog: AuditEvent[];
  nextAuditId: number;
}

/**
 * A tenant in the platform registry with its package (E34); name and tax ID come from the
 * tenant's own `companyInfo`.
 */
type StoredCompany = Pick<Company, 'id' | 'code' | 'active'> & {
  planId: PlanId;
  /** Billing schedule (E35) */
  subscription: Subscription;
  /** Why `active` is false (null while active): overdue billing, the platform admin, deletion */
  suspendedReason: CompanySuspendReason | null;
  /** Its data was deleted (E39): the entry stays so the code is never reused */
  deletedAt?: string | null;
  /** Why the platform admin suspended it (`suspendedReason: 'platform'`) */
  suspendNote?: string;
  /** The owner's deletion request (E39; `suspendedReason: 'deletion'` while pending) */
  deletion?: CompanyDeletion | null;
  /** Name when its data was deleted (the registry keeps no other data of it) */
  deletedName?: string;
};

/**
 * Platform-level data (SaaS step 6): the registry of every company. Each company's own data is a
 * separate `MockDb` (`tenantKey()`), so handlers keep treating "the db" as the tenant — like the
 * real API, where RLS shows a request only its own company's rows (D7).
 */
interface MockPlatform {
  companies: StoredCompany[];
  nextCompanyId: number;
  /** Invoices of the SaaS to every company (E35) */
  invoices: BillingInvoice[];
  nextInvoiceId: number;
  /** Password reset links of owners (E41): single use, `RESET_LINK_MINUTES` */
  resetTokens: ResetToken[];
  /** E-mails the platform "sent" (the mock sends none — read on the platform pages) */
  outbox: PlatformEmail[];
  nextEmailId: number;
  /** The SaaS operator's admins (E36) — not users of any company */
  platformAdmins: PlatformAdmin[];
  /** Passwords by platform admin id; none = `platform` */
  platformPasswords: Record<number, string>;
}

interface ResetToken {
  token: string;
  companyId: number;
  userId: number;
  /** ISO time */
  expiresAt: string;
  usedAt: string | null;
}

/** The seed company; its data stays under the pre-SaaS key `mock.db` (older stored data). */
const DEMO_COMPANY: StoredCompany = {
  id: 1,
  code: 'DEMO',
  active: true,
  planId: 'pro',
  subscription: { trialEndsOn: null, nextInvoiceOn: '9999-12-31' },
  suspendedReason: null,
};

/** Mock data is kept in localStorage so it survives full page reloads (menu switches). */
const DB_KEY = 'mock.db';
const PLATFORM_KEY = 'mock.platform';

/** Storage key of a company's data: `mock.db` for DEMO, `mock.db.<id>` for the others. */
const tenantKey = (companyId: number): string =>
  companyId === DEMO_COMPANY.id ? DB_KEY : `${DB_KEY}.${companyId}`;

const SEED_USERS: User[] = [
  {
    id: 1,
    username: 'admin',
    name: 'Admin',
    email: 'admin@example.com',
    role: 'owner',
    active: true,
    branchIds: [],
    allBranches: true,
    createdAt: '2026-01-05T09:00:00Z',
  },
  {
    id: 2,
    username: 'somchai',
    name: 'สมชาย ใจดี',
    email: 'somchai@example.com',
    role: 'user',
    active: true,
    branchIds: [1],
    allBranches: false,
    createdAt: '2026-02-11T10:30:00Z',
  },
  {
    id: 3,
    username: 'somying',
    name: 'สมหญิง รักงาน',
    email: 'somying@example.com',
    role: 'user',
    active: false,
    branchIds: [1],
    allBranches: false,
    createdAt: '2026-03-20T14:15:00Z',
  },
  {
    id: 4,
    username: 'john',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'user',
    active: true,
    branchIds: [1],
    allBranches: false,
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

const payment = (
  m: Pick<PaymentMethod, 'id' | 'code' | 'name' | 'type'> & Partial<PaymentMethod>,
): PaymentMethod => ({ ...PAYMENT_METHOD_DEFAULTS, sortOrder: m.id, ...m });

/** Sample tenders of the store (fees are typical Thai MDR rates, for net-received reports). */
const SEED_PAYMENT_METHODS: PaymentMethod[] = [
  payment({ id: 1, code: 'CASH', name: 'เงินสด', type: 'cash', cashRounding: '0.25' }),
  payment({
    id: 2,
    code: 'CARD',
    name: 'บัตรเครดิต/เดบิต',
    type: 'card',
    requireReference: true,
    referenceLabel: 'เลขอนุมัติ',
    minAmount: 300,
    feePercent: 1.6,
  }),
  payment({
    id: 3,
    code: 'QR-PP',
    name: 'QR พร้อมเพย์',
    type: 'qr',
    promptPayId: '0105550123451',
    bankAccount: 'กสิกรไทย 123-4-56789-0',
  }),
  payment({
    id: 4,
    code: 'TRANSFER',
    name: 'โอนผ่านธนาคาร',
    type: 'transfer',
    requireReference: true,
    referenceLabel: 'เลขอ้างอิงการโอน',
    bankAccount: 'กสิกรไทย 123-4-56789-0',
  }),
  payment({ id: 5, code: 'TMW', name: 'TrueMoney Wallet', type: 'e_wallet', feePercent: 1.5 }),
  payment({
    id: 6,
    code: 'INST-0',
    name: 'ผ่อน 0%',
    type: 'installment',
    requireReference: true,
    referenceLabel: 'เลขอนุมัติ',
    minAmount: 3000,
    feePercent: 3,
    installmentMonths: [3, 6, 10],
    note: 'ผ่อนผ่านบัตรเครดิตที่ร่วมรายการ',
  }),
];

/** Orders from before the POS (no lines/payments). */
const SEED_SALES: Sale[] = (
  [
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
  ] satisfies Partial<Sale>[]
).map(withSaleDefaults);

/** Fills fields missing from sales stored before they existed (the same rule the app reads with). */
function withSaleDefaults(s: Pick<Sale, 'total'> & Partial<Sale>): Sale {
  return normalizeSale(s);
}

/** Exported for specs that start from a stored db. */
export const SEED_STORE_INFO: StoreInfo = {
  ...STORE_INFO_DEFAULTS,
  name: 'บริษัท ไอทีดี คอมพิวเตอร์ จำกัด',
  placeName: 'ร้านไอทีดี คอมพิวเตอร์',
  taxId: '0105550123451',
  address: '99/9 ถนนพหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพฯ 10400',
  phone: '02-123-4567',
  receiptFooter: 'ขอบคุณที่ใช้บริการ · เปลี่ยน/คืนสินค้าภายใน 7 วันพร้อมใบเสร็จ',
};

const SEED_BRANCHES: Branch[] = [
  {
    id: 1,
    code: 'HQ',
    name: SEED_STORE_INFO.placeName,
    branchNo: HEAD_OFFICE_BRANCH_NO,
    address: SEED_STORE_INFO.address,
    phone: SEED_STORE_INFO.phone,
    receiptFooter: SEED_STORE_INFO.receiptFooter,
    active: true,
  },
  {
    id: 2,
    code: 'BN',
    name: 'ร้านไอทีดี คอมพิวเตอร์ สาขาบางนา',
    branchNo: '00001',
    address: '1/23 ถนนบางนา-ตราด แขวงบางนาใต้ เขตบางนา กรุงเทพฯ 10260',
    phone: '02-765-4321',
    receiptFooter: SEED_STORE_INFO.receiptFooter,
    active: true,
  },
];

const SEED_POS_TERMINALS: PosTerminal[] = [
  { id: 1, name: 'แคชเชียร์หน้าร้าน', posId: 'E051234567890', branchId: 1, active: true },
  { id: 2, name: 'แคชเชียร์โซนมือถือ', posId: 'E051234567891', branchId: 1, active: true },
  { id: 3, name: 'แคชเชียร์สาขาบางนา', posId: 'E051234567892', branchId: 2, active: true },
];

const seedDb = (): MockDb => ({
  users: [...SEED_USERS],
  nextId: SEED_USERS.length + 1,
  products: [...SEED_PRODUCTS],
  nextProductId: SEED_PRODUCTS.length + 1,
  branchStock: [],
  transfers: [],
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
  paymentMethods: SEED_PAYMENT_METHODS.map((x) => structuredClone(x)),
  nextPaymentMethodId: SEED_PAYMENT_METHODS.length + 1,
  storeInfo: { ...SEED_STORE_INFO },
  companyInfo: companyInfoOf(SEED_STORE_INFO),
  menuAccess: { userMenus: [...DEFAULT_USER_MENUS] },
  creditNotes: [],
  exchanges: [],
  taxInvoices: [],
  shifts: [],
  cashMovements: [],
  drawerOpens: [],
  shiftAdjustments: [],
  posTerminals: SEED_POS_TERMINALS.map((t) => ({ ...t })),
  branches: SEED_BRANCHES.map((b) => ({ ...b })),
  nextBranchId: SEED_BRANCHES.length + 1,
  passwords: {},
  auditLog: [],
  nextAuditId: 1,
});

/**
 * Base of a company other than DEMO: no sample data, and the one-time migrations of pre-SaaS data
 * already count as done (such a company never had any). Its stored db holds at least its branches,
 * users and `companyInfo`.
 */
const blankDb = (): MockDb => ({
  users: [],
  nextId: 1,
  products: [],
  nextProductId: 1,
  branchStock: [],
  branchStockMigrated: true,
  docBranchFixed: true,
  transfers: [],
  sales: [],
  serials: [],
  nextSerialId: 1,
  prices: [],
  nextPriceId: 1,
  categories: [],
  nextCategoryId: 1,
  suppliers: [],
  nextSupplierId: 1,
  movements: [],
  nextMovementId: 1,
  promotions: [],
  nextPromotionId: 1,
  paymentMethods: [],
  nextPaymentMethodId: 1,
  storeInfo: { ...STORE_INFO_DEFAULTS },
  companyInfo: { ...COMPANY_INFO_DEFAULTS },
  menuAccess: { userMenus: [...DEFAULT_USER_MENUS] },
  creditNotes: [],
  exchanges: [],
  taxInvoices: [],
  shifts: [],
  cashMovements: [],
  drawerOpens: [],
  shiftAdjustments: [],
  shiftsEnabled: true,
  posTerminals: [],
  branches: [],
  nextBranchId: 1,
  passwords: {},
  auditLog: [],
  nextAuditId: 1,
});

/**
 * The platform registry. Stored dbs from before step 6 kept `companies` inside the DEMO db: they
 * move here once (`changed`); a fresh install starts with DEMO alone.
 */
function loadPlatform(storage: StorageService): { platform: MockPlatform; changed: boolean } {
  const stored = storage.get<Partial<MockPlatform>>(PLATFORM_KEY);
  // Companies registered before packages / billing (steps 6.4 – 6.5): DEMO gets Pro, any other
  // the smallest; no trial, first invoice on the 1st of next month; a suspended one = the platform.
  const firstOfNextMonth = addMonthsIso(`${todayIso().slice(0, 7)}-01`, 1);
  const filled = (c: Partial<StoredCompany> & Pick<StoredCompany, 'id' | 'active'>) =>
    ({
      ...c,
      planId: c.planId ?? (c.id === DEMO_COMPANY.id ? 'pro' : 'starter'),
      subscription: c.subscription ?? { trialEndsOn: null, nextInvoiceOn: firstOfNextMonth },
      suspendedReason:
        c.suspendedReason !== undefined ? c.suspendedReason : c.active ? null : 'platform',
    }) as StoredCompany;
  const legacy = storage.get<{ companies?: StoredCompany[] }>(DB_KEY)?.companies;
  const fresh = [{ id: DEMO_COMPANY.id, code: DEMO_COMPANY.code, active: true }];
  const raw: (Partial<StoredCompany> & Pick<StoredCompany, 'id' | 'active'>)[] =
    stored?.companies ?? (legacy?.length ? legacy : fresh);
  const companies = raw.map(filled);
  return {
    platform: {
      companies,
      nextCompanyId: stored?.nextCompanyId ?? Math.max(0, ...companies.map((c) => c.id)) + 1,
      invoices: stored?.invoices ?? [],
      nextInvoiceId: stored?.nextInvoiceId ?? 1,
      resetTokens: stored?.resetTokens ?? [],
      outbox: stored?.outbox ?? [],
      nextEmailId: stored?.nextEmailId ?? 1,
      platformAdmins: stored?.platformAdmins ?? [
        { id: 1, username: 'platform', name: 'ผู้ดูแลแพลตฟอร์ม' },
      ],
      platformPasswords: stored?.platformPasswords ?? {},
    },
    changed: !stored?.companies || raw.some((c) => !c.subscription || !c.planId),
  };
}

/**
 * Issues the invoices a company's schedule has reached by today (package price of the day, VAT
 * included) and suspends it once an unpaid one is past the grace period (E35). True = changed.
 */
function refreshBilling(platform: MockPlatform, company: StoredCompany, today: string): boolean {
  const { periods, nextInvoiceOn } = periodsToInvoice(company.subscription.nextInvoiceOn, today);
  for (const period of periods) {
    const prefix = `SUB-${period.start.slice(0, 4)}${period.start.slice(5, 7)}-`;
    const seq = platform.invoices.filter((i) => i.invoiceNo.startsWith(prefix)).length + 1;
    const plan = planOf(company.planId);
    platform.invoices.push({
      id: platform.nextInvoiceId++,
      companyId: company.id,
      invoiceNo: `${prefix}${String(seq).padStart(4, '0')}`,
      planId: plan.id,
      periodStart: period.start,
      periodEnd: period.end,
      amount: plan.monthlyPrice,
      issuedOn: period.start,
      dueDate: addDaysIso(period.start, INVOICE_DUE_DAYS),
      status: 'open',
      paidAt: null,
    });
  }
  company.subscription = { ...company.subscription, nextInvoiceOn };
  const status = subscriptionStatus(company.subscription, invoicesOf(platform, company.id), today);
  if (status === 'suspended' && company.active) {
    company.active = false;
    company.suspendedReason = 'overdue';
    return true;
  }
  return periods.length > 0;
}

const invoicesOf = (platform: MockPlatform, companyId: number): BillingInvoice[] =>
  platform.invoices.filter((i) => i.companyId === companyId);

/**
 * One company's data with defaults filled in and the one-time migrations of older stored data run
 * (`changed` = something was migrated, so the db is saved even on a GET). Only DEMO can hold
 * pre-SaaS data: the migrations that read the raw stored db get it only there.
 */
function loadTenantDb(
  storage: StorageService,
  companyId: number,
): { db: MockDb; changed: boolean } {
  const demo = companyId === DEMO_COMPANY.id;
  const stored = storage.get<Partial<MockDb>>(tenantKey(companyId));
  const legacy = demo ? stored : null;
  // Merge with seed so collections added later still exist in an older stored db.
  const db: MockDb = { ...(demo ? seedDb() : blankDb()), ...stored };
  // Company settings added later (e.g. `staffSeeCost`, E43) take their defaults.
  db.companyInfo = { ...COMPANY_INFO_DEFAULTS, ...db.companyInfo };
  // Products stored before the SKU master fields existed get defaults filled in.
  db.products = db.products.map((p) => ({ ...PRODUCT_DEFAULTS, ...p }));
  db.nextProductId = Math.max(db.nextProductId, ...db.products.map((p) => p.id + 1));
  db.promotions = db.promotions.map((p) => ({ ...PROMOTION_DEFAULTS, ...p }));
  db.paymentMethods = db.paymentMethods.map((m) => ({ ...PAYMENT_METHOD_DEFAULTS, ...m }));
  db.sales = db.sales.map(withSaleDefaults);
  db.shifts = db.shifts.map(normalizeShift);
  const branched = splitStoreInfo(db, legacy);
  fillUserDefaults(db);
  const owned = fillOwner(db);
  db.taxInvoices = db.taxInvoices.map((t) => ({
    ...TAX_INVOICE_DEFAULTS,
    ...t,
    atSale: t.atSale ?? false,
    issuedAt: t.issuedAt ?? t.date,
  }));
  // Notes stored before the buyer snapshot existed take it from the invoice they quote.
  db.creditNotes = db.creditNotes.map((n) => ({
    ...n,
    taxInvoiceNo: n.taxInvoiceNo ?? null,
    buyer:
      n.buyer !== undefined
        ? n.buyer
        : (db.taxInvoices.find((t) => t.invoiceNo === n.taxInvoiceNo)?.buyer ?? null),
  }));
  migrateLegacyPrices(db);
  migrateLegacySkuFields(db);
  refreshCurrentPrices(db);
  refreshCategoryInfo(db);
  refreshSupplierInfo(db);
  // Older stored data: one store-wide stock → the first branch (+ sample stock for BN), once.
  const stockMoved = migrateBranchStock(db);
  const shiftsOn = enableShifts(db);
  const registered = migrateTerminals(db, legacy);
  // Terminals registered before E8 stand in the first branch.
  db.posTerminals = db.posTerminals.map((t) => ({
    ...t,
    branchId: t.branchId ?? db.branches[0].id,
  }));
  fillTerminalSnapshots(db);
  const docsFixed = fixDocumentBranches(db);
  return { db, changed: stockMoved || docsFixed || shiftsOn || registered || branched || owned };
}

/** Saves one company's data; derived fields (`storeInfo`, the products' branch stock) never are. */
function saveTenantDb(storage: StorageService, companyId: number, db: MockDb): void {
  // `companies` moved to the platform registry (step 6); older stored dbs still carry it.
  storage.set(tenantKey(companyId), {
    ...db,
    products: storeBranchStock(db),
    storeInfo: undefined,
    companies: undefined,
  });
}

const LATENCY_MS = 300;

/**
 * The company of the request being handled (set before `handle()`, like `actor`): the registry's
 * own record, so a handler changes it in place and sets `platformChanged` to have it saved.
 */
let tenant: StoredCompany = DEMO_COMPANY;
/** The platform registry of this request (companies + billing). */
let platform: MockPlatform = {
  companies: [],
  nextCompanyId: 1,
  invoices: [],
  nextInvoiceId: 1,
  resetTokens: [],
  outbox: [],
  nextEmailId: 1,
  platformAdmins: [],
  platformPasswords: {},
};
let platformChanged = false;
/** The user of the request being handled (set by the interceptor before `handle()`). */
let actor: User | undefined;
/** Name recorded as cashier / issuer on documents. */
const actorName = (): string => actor?.name ?? '';
/** Admin-only rules (exchange window, manual-discount ceiling) follow the logged-in user. */
const actorIsAdmin = (): boolean => hasAdminRights(actor);
/** POS terminal (cash drawer) of the request: header `X-Terminal-Id`, null = not set on the device. */
let terminalId: number | null = null;
/**
 * Raw `X-Branch-Id` of the request (null = not sent — allowed in SaaS step 1, E2); checked against
 * the user's branches in `handle()` (403). Branch-level data uses it from step 3.
 */
let branchHeader: string | null = null;
/**
 * Branch whose stock this request reads and moves: `X-Branch-Id`, else the first branch (reads
 * only — stock writes without the header are refused, E17). Every write of step 3 happens there.
 */
let stockBranch = 1;

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
  const path = req.url.slice(base.length + 1);
  const loaded = loadPlatform(storage);
  platform = loaded.platform;
  const registryMoved = loaded.changed;
  platformChanged = false;
  const company = requestCompany(req, path, platform);
  if (company && refreshBilling(platform, company, todayIso())) platformChanged = true;
  const response$ =
    path === 'platform' || path.startsWith('platform/')
      ? platformResponse(req, path, storage)
      : (publicResponse(req, path, storage) ??
        (company ? tenantResponse(req, path, company, storage) : noTenant(req, path)));
  // A handler that changed the request's company (package …) sets `platformChanged`.
  if (registryMoved || platformChanged) storage.set(PLATFORM_KEY, platform);
  return response$.pipe(materialize(), delay(LATENCY_MS), dematerialize());
};

/**
 * The company a request belongs to: the one a login names by code, else the one in the token —
 * the tenant never comes from the URL / body (saas-plan section 2). Undefined = no such company.
 */
function requestCompany(
  req: HttpRequest<unknown>,
  path: string,
  registry: MockPlatform,
): StoredCompany | undefined {
  if (path === 'auth/login' && req.method === 'POST') {
    const code = normalizeCompanyCode(
      (req.body as Partial<LoginRequest> | null)?.companyCode ?? '',
    );
    return registry.companies.find((c) => c.code === code && !c.deletedAt);
  }
  // A deleted company (E39) has no data left: its code and tokens lead nowhere.
  const id = tokenIds(req)?.companyId;
  return registry.companies.find((c) => c.id === id && !c.deletedAt);
}

/**
 * Requests without a session that are not a login (E37 / E41): signing up, asking for a password
 * reset link, setting the new password. Null = not one of them.
 */
function publicResponse(
  req: HttpRequest<unknown>,
  path: string,
  storage: StorageService,
): Observable<HttpResponse<unknown>> | null {
  if (req.method !== 'POST') return null;
  terminalId = null;
  if (path === 'auth/signup') return signup(req.body as SignupPayload, storage);
  if (path === 'auth/forgot-password') return forgotPassword(req.body, storage);
  if (path === 'auth/reset-password') return resetPassword(req.body, storage);
  return null;
}

/**
 * A new company (E37): registry entry on a `TRIAL_DAYS` trial of the chosen package, and its own
 * data — first branch, the owner, one cash payment method, nothing else. Logs the owner in.
 */
function signup(
  body: SignupPayload | null,
  storage: StorageService,
): Observable<HttpResponse<LoginResponse>> {
  const p: SignupPayload = {
    companyCode: body?.companyCode ?? '',
    companyName: (body?.companyName ?? '').trim(),
    taxId: (body?.taxId ?? '').trim(),
    vatRegistered: !!body?.vatRegistered,
    branch: { code: '', name: '', branchNo: '', address: '', phone: '', ...body?.branch },
    owner: { name: '', username: '', email: '', password: '', ...body?.owner },
    planId: body?.planId ?? ('' as PlanId),
  };
  const problem = signupError(p);
  if (problem) return error(400, problem);
  const code = normalizeCompanyCode(p.companyCode);
  // Codes of deleted companies stay taken (E39): the registry keeps them.
  if (platform.companies.some((c) => c.code === code)) return error(400, 'รหัสบริษัทนี้ถูกใช้แล้ว');
  const today = todayIso();
  const trialEndsOn = addDaysIso(today, TRIAL_DAYS);
  const company: StoredCompany = {
    id: platform.nextCompanyId++,
    code,
    active: true,
    planId: p.planId,
    subscription: { trialEndsOn, nextInvoiceOn: addDaysIso(trialEndsOn, 1) },
    suspendedReason: null,
  };
  platform.companies.push(company);
  platformChanged = true;
  const owner: User = {
    id: 1,
    username: normalizeUsername(p.owner.username),
    name: p.owner.name.trim(),
    email: p.owner.email.trim(),
    role: 'owner',
    active: true,
    branchIds: [],
    allBranches: true,
    createdAt: new Date().toISOString(),
  };
  const cash = SEED_PAYMENT_METHODS.find((m) => m.type === 'cash') as PaymentMethod;
  const db: MockDb = {
    ...blankDb(),
    companyInfo: {
      ...COMPANY_INFO_DEFAULTS,
      name: p.companyName,
      taxId: p.taxId,
      vatRegistered: p.vatRegistered,
    },
    branches: [
      normalizeBranch({
        ...BRANCH_DEFAULTS,
        ...p.branch,
        code: p.branch.code.trim().toUpperCase(),
        id: 1,
        receiptFooter: 'ขอบคุณที่ใช้บริการ',
        active: true,
      }) as Branch,
    ],
    nextBranchId: 2,
    users: [owner],
    nextId: 2,
    passwords: { [owner.id]: p.owner.password },
    paymentMethods: [{ ...structuredClone(cash), id: 1, sortOrder: 1 }],
    nextPaymentMethodId: 2,
  };
  tenant = company;
  actor = owner;
  branchHeader = null;
  pushAudit(db, {
    action: 'signup',
    ref: { kind: 'company', id: company.id, label: code },
    detail: `สมัครใช้งาน แพ็กเกจ ${planOf(p.planId).name} ทดลองใช้ถึง ${trialEndsOn}`,
  });
  saveTenantDb(storage, company.id, db);
  return ok({ token: mockToken(company.id, owner.id), ...companySession(db, owner) });
}

/**
 * An owner who forgot their password (E41): a single-use link valid `RESET_LINK_MINUTES`, "sent"
 * to the owner's e-mail (the mock's outbox) when code + e-mail match — the answer is always the
 * same, so nobody learns which companies or e-mails exist.
 */
function forgotPassword(body: unknown, storage: StorageService): Observable<HttpResponse<unknown>> {
  const { companyCode, email } = (body ?? {}) as { companyCode?: string; email?: string };
  const answer = ok({ message: FORGOT_PASSWORD_ANSWER });
  const company = platform.companies.find(
    (c) => c.code === normalizeCompanyCode(companyCode ?? ''),
  );
  const wanted = (email ?? '').trim().toLowerCase();
  if (!company || company.deletedAt || !wanted) return answer;
  const { db } = loadTenantDb(storage, company.id);
  const owner = db.users.find((u) => isOwner(u) && u.active && u.email.toLowerCase() === wanted);
  if (!owner) return answer;
  const token = crypto.randomUUID();
  platform.resetTokens.push({
    token,
    companyId: company.id,
    userId: owner.id,
    expiresAt: new Date(Date.now() + RESET_LINK_MINUTES * 60_000).toISOString(),
    usedAt: null,
  });
  platform.outbox.push({
    id: platform.nextEmailId++,
    at: new Date().toISOString(),
    companyId: company.id,
    to: owner.email,
    subject: `ตั้งรหัสผ่านใหม่ — บริษัท ${company.code}`,
    body: `/auth/reset-password?token=${token}`,
  });
  platformChanged = true;
  return answer;
}

/** Sets the owner's new password with a reset link (once, before it expires). */
function resetPassword(body: unknown, storage: StorageService): Observable<HttpResponse<unknown>> {
  const { token, password } = (body ?? {}) as { token?: string; password?: string };
  const link = platform.resetTokens.find((t) => t.token === token);
  const invalid = 'ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง หมดอายุ หรือใช้ไปแล้ว — ขอลิงก์ใหม่';
  if (!link || link.usedAt || link.expiresAt < new Date().toISOString()) return error(400, invalid);
  const company = platform.companies.find((c) => c.id === link.companyId);
  if (!company || company.deletedAt) return error(400, invalid);
  const { db } = loadTenantDb(storage, company.id);
  const user = db.users.find((u) => u.id === link.userId && u.active);
  if (!user) return error(400, invalid);
  const problem = passwordError(password ?? '');
  if (problem) return error(400, problem);
  db.passwords[user.id] = password ?? '';
  link.usedAt = new Date().toISOString();
  platformChanged = true;
  tenant = company;
  pushAudit(
    db,
    {
      action: 'password_reset',
      ref: { kind: 'user', id: user.id, label: user.username },
      detail: 'ตั้งรหัสผ่านใหม่ด้วยลิงก์ทางอีเมล',
    },
    user,
  );
  saveTenantDb(storage, company.id, db);
  return ok(null);
}

/** A fake platform admin token (E36): another shape than a shop token, so neither passes for the other. */
export const mockPlatformToken = (adminId: number): string => `mock-platform-token.p${adminId}`;

/**
 * The SaaS operator's API (E36): `POST /platform/auth/login`, then with a platform token —
 * companies (list / detail / package / suspend / reactivate / owner password), invoices (paid)
 * and the mock outbox. Every action is written to the company's own audit log as `platform`.
 */
function platformResponse(
  req: HttpRequest<unknown>,
  path: string,
  storage: StorageService,
): Observable<HttpResponse<unknown>> {
  terminalId = null;
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (path === 'platform/auth/login' && req.method === 'POST') {
    const name = normalizeUsername(String(body['username'] ?? ''));
    const admin = platform.platformAdmins.find((a) => a.username === name);
    const password = admin ? (platform.platformPasswords[admin.id] ?? 'platform') : null;
    if (!admin || body['password'] !== password) return error(401, WRONG_LOGIN);
    return ok({ token: mockPlatformToken(admin.id), admin } satisfies PlatformLoginResponse);
  }
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/, '') ?? '';
  const match = /^mock-platform-token\.p(\d+)$/.exec(token);
  const admin = match && platform.platformAdmins.find((a) => a.id === Number(match[1]));
  if (!admin) return error(401, 'เซสชันผู้ให้บริการหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  const by = { id: null, name: admin.name, kind: 'platform' as const };
  const today = todayIso();
  for (const c of platform.companies) {
    if (!c.deletedAt && refreshBilling(platform, c, today)) platformChanged = true;
  }

  if (path === 'platform/me' && req.method === 'GET') return ok(admin);
  if (path === 'platform/outbox' && req.method === 'GET') {
    return ok([...platform.outbox].sort((a, b) => b.id - a.id));
  }
  if (path === 'platform/companies' && req.method === 'GET') {
    return ok(platform.companies.map((c) => platformRow(c, storage)));
  }
  const payMatch = /^platform\/invoices\/(\d+)\/pay$/.exec(path);
  if (payMatch && req.method === 'POST') {
    const invoice = platform.invoices.find((i) => i.id === Number(payMatch[1]));
    if (!invoice) return error(404, 'ไม่พบใบแจ้งหนี้');
    const problem = payInvoiceError(invoice);
    if (problem) return error(400, problem);
    invoice.status = 'paid';
    invoice.paidAt = new Date().toISOString();
    const company = platform.companies.find((c) => c.id === invoice.companyId) as StoredCompany;
    // Paid off: an overdue suspension ends by itself (E35).
    const status = subscriptionStatus(
      company.subscription,
      invoicesOf(platform, company.id),
      today,
    );
    if (company.suspendedReason === 'overdue' && status !== 'suspended') {
      company.active = true;
      company.suspendedReason = null;
    }
    platformChanged = true;
    withTenantDb(storage, company, (db) =>
      pushAudit(
        db,
        {
          action: 'invoice_paid',
          ref: { kind: 'company', id: company.id, label: invoice.invoiceNo },
          detail: `฿${invoice.amount}`,
        },
        by,
      ),
    );
    return ok(platformDetail(company, storage));
  }
  const m = /^platform\/companies\/(\d+)(?:\/([\w-]+))?$/.exec(path);
  const company = m ? platform.companies.find((c) => c.id === Number(m[1])) : undefined;
  if (!m || !company) return error(404, 'ไม่พบบริษัท');
  const action = m[2];
  if (!action && req.method === 'GET') return ok(platformDetail(company, storage));
  if (company.deletedAt) return error(400, 'บริษัทนี้ถูกลบข้อมูลแล้ว');
  const record = (entry: AuditEntry) =>
    withTenantDb(storage, company, (db) => pushAudit(db, entry, by));
  const ref: AuditRef = { kind: 'company', id: company.id, label: company.code };
  if (action === 'plan' && req.method === 'PUT') {
    const plan = PLANS.find((p) => p.id === body['planId']);
    if (!plan) return error(400, 'ไม่มีแพ็กเกจนี้');
    company.planId = plan.id;
    platformChanged = true;
    record({ action: 'plan_change', ref, detail: `ผู้ให้บริการเปลี่ยนเป็นแพ็กเกจ ${plan.name}` });
    return ok(platformDetail(company, storage));
  }
  if (action === 'suspend' && req.method === 'POST') {
    const note = String(body['note'] ?? '').trim();
    const problem = suspendCompanyError(
      { active: company.active, deletedAt: company.deletedAt ?? null },
      note,
    );
    if (problem) return error(400, problem);
    Object.assign(company, { active: false, suspendedReason: 'platform', suspendNote: note });
    platformChanged = true;
    record({ action: 'company_suspend', ref, detail: note });
    return ok(platformDetail(company, storage));
  }
  if (action === 'reactivate' && req.method === 'POST') {
    const problem = reactivateCompanyError({
      active: company.active,
      suspendedReason: company.suspendedReason,
      deletedAt: company.deletedAt ?? null,
    });
    if (problem) return error(400, problem);
    Object.assign(company, { active: true, suspendedReason: null, suspendNote: '' });
    platformChanged = true;
    record({ action: 'company_reactivate', ref, detail: '' });
    return ok(platformDetail(company, storage));
  }
  if (action === 'purge' && req.method === 'POST') {
    const problem = purgeError(company.deletion, today);
    if (problem) return error(400, problem);
    // The data goes for good (E39); the registry entry stays, so the code is never reused.
    const { db } = loadTenantDb(storage, company.id);
    storage.remove(tenantKey(company.id));
    platform.resetTokens = platform.resetTokens.filter((t) => t.companyId !== company.id);
    Object.assign(company, {
      deletedAt: new Date().toISOString(),
      deletedName: db.companyInfo.name,
      active: false,
      suspendedReason: 'deletion',
    });
    platformChanged = true;
    return ok(platformDetail(company, storage));
  }
  if (action === 'owner-password' && req.method === 'PUT') {
    const password = String(body['password'] ?? '');
    const problem = passwordError(password);
    if (problem) return error(400, problem);
    let owner: User | undefined;
    withTenantDb(storage, company, (db) => {
      owner = db.users.find((u) => isOwner(u));
      if (!owner) return;
      db.passwords[owner.id] = password;
      pushAudit(
        db,
        {
          action: 'user_password',
          ref: { kind: 'user', id: owner.id, label: owner.username },
          detail: 'ผู้ให้บริการตั้งรหัสผ่านใหม่ให้เจ้าของบริษัท',
        },
        by,
      );
    });
    if (!owner) return error(400, 'บริษัทนี้ไม่มีเจ้าของบริษัท');
    return ok(null);
  }
  return notFound(req, path);
}

/** Loads a company's data, lets `change` edit it and saves it back. */
function withTenantDb(
  storage: StorageService,
  company: StoredCompany,
  change: (db: MockDb) => void,
): void {
  const { db } = loadTenantDb(storage, company.id);
  const before = tenant;
  tenant = company;
  change(db);
  saveTenantDb(storage, company.id, db);
  tenant = before;
}

function platformRow(company: StoredCompany, storage: StorageService): PlatformCompanyRow {
  const invoices = invoicesOf(platform, company.id);
  const deletedAt = company.deletedAt ?? null;
  const db = deletedAt ? null : loadTenantDb(storage, company.id).db;
  return {
    id: company.id,
    code: company.code,
    name: db?.companyInfo.name ?? company.deletedName ?? '',
    taxId: db?.companyInfo.taxId ?? '',
    planId: company.planId,
    active: company.active,
    suspendedReason: company.suspendedReason,
    status: subscriptionStatus(company.subscription, invoices, todayIso()),
    usage: db ? usageOf(db) : { branches: 0, users: 0, terminals: 0 },
    subscription: company.subscription,
    openAmount: invoices.filter((i) => i.status === 'open').reduce((sum, i) => sum + i.amount, 0),
    deletedAt,
    deletion: company.deletion ?? null,
  };
}

function platformDetail(company: StoredCompany, storage: StorageService): PlatformCompanyDetail {
  const row = platformRow(company, storage);
  const owner = row.deletedAt
    ? undefined
    : loadTenantDb(storage, company.id).db.users.find((u) => isOwner(u));
  return {
    ...row,
    invoices: invoicesOf(platform, company.id).sort((a, b) => b.id - a.id),
    owner: owner
      ? { id: owner.id, name: owner.name, username: owner.username, email: owner.email }
      : null,
    suspendNote: company.suspendNote ?? '',
  };
}

/** Answer when no company is known: the same messages as a wrong login / an expired session. */
function noTenant(req: HttpRequest<unknown>, path: string): Observable<never> {
  if (path === 'auth/login' && req.method === 'POST') return error(401, WRONG_COMPANY_LOGIN);
  if (path === 'auth/verify' && req.method === 'POST') return error(400, WRONG_LOGIN);
  return error(401, SESSION_EXPIRED);
}

/** Loads the company's data, handles the request in it and saves it after a write / migration. */
function tenantResponse(
  req: HttpRequest<unknown>,
  path: string,
  company: StoredCompany,
  storage: StorageService,
): Observable<HttpResponse<unknown>> {
  const { db, changed } = loadTenantDb(storage, company.id);
  // `handle()` is synchronous, so the tenant and caller can be kept module-wide for this request.
  tenant = company;
  actor = requestUser(req, db);
  const terminal = Number(req.headers.get('X-Terminal-Id'));
  terminalId = Number.isInteger(terminal) && terminal > 0 ? terminal : null;
  branchHeader = req.headers.get('X-Branch-Id');
  db.storeInfo = storeInfoOf(db.companyInfo, requestBranch(db));
  stockBranch = requestBranch(db).id;
  db.products = db.products.map((p) => atBranch(db, p));
  // A deleted record's label is read before the handler removes it.
  const deleted = req.method === 'DELETE' ? deletedLabel(path, db) : '';
  const response$ = handle(req, path, db);
  // Writes, plus the one read that is an event of its own: downloading all the data (E38).
  if ((req.method !== 'GET' || path === 'company/export') && actor) {
    const done = syncResult(response$);
    if (done) recordAudit(req, path, db, done.body, deleted);
  }
  if (changed || req.method !== 'GET' || path === 'company/export') {
    saveTenantDb(storage, company.id, db);
  }
  // Cost / profit only for those who may see them (E43): one place, after the handler and audit.
  if (actor && !canSeeCost(actor, db.companyInfo)) {
    return response$.pipe(map((r) => (r.body == null ? r : r.clone({ body: hideCost(r.body) }))));
  }
  return response$;
}

/** The success response of a handler (handlers answer synchronously with `of()`); null = an error. */
function syncResult(response$: Observable<HttpResponse<unknown>>): HttpResponse<unknown> | null {
  let result: HttpResponse<unknown> | null = null;
  response$.subscribe({ next: (r) => (result = r), error: () => undefined });
  return result;
}

/** What an audit event says beyond who / when / where (`pushAudit()` fills the rest). */
type AuditEntry = Pick<AuditEvent, 'action' | 'ref' | 'detail'> & { branchId?: number | null };

/** Appends an event done by the request's user at its terminal (E40). */
function pushAudit(
  db: MockDb,
  entry: AuditEntry,
  by: { id: number | null; name: string; kind?: AuditActorKind } | null = actor ?? null,
): void {
  db.auditLog.push({
    id: db.nextAuditId++,
    at: new Date().toISOString(),
    actorKind: by?.kind ?? 'user',
    userId: by?.id ?? null,
    userName: by?.name ?? '',
    branchId: entry.branchId === undefined ? null : entry.branchId,
    // The device's terminal only when it is one of this company's (a device set up for another
    // company still sends its number).
    terminalId: db.posTerminals.some((t) => t.id === terminalId) ? terminalId : null,
    action: entry.action,
    ref: entry.ref,
    detail: entry.detail,
  });
}

/** Label of the record a `DELETE` removes (price / promotion / user / terminal), for its event. */
function deletedLabel(path: string, db: MockDb): string {
  const [kind, raw] = path.split('/');
  const id = Number(raw);
  if (kind === 'prices') {
    const price = db.prices.find((p) => p.id === id);
    return price ? `${skuOf(db, price.productId)} ฿${price.price} ตั้งแต่ ${price.startDate}` : '';
  }
  if (kind === 'promotions') {
    const promo = db.promotions.find((p) => p.id === id);
    return promo ? `${promo.code} ${promo.name}` : '';
  }
  if (kind === 'users') return db.users.find((u) => u.id === id)?.username ?? '';
  if (kind === 'pos-terminals') return id ? `เครื่อง ${id}` : '';
  return '';
}

const skuOf = (db: MockDb, productId: number): string =>
  db.products.find((p) => p.id === productId)?.sku ?? `#${productId}`;

/**
 * The audit events of a successful write (E40): which requests are "important" lives here, in one
 * place, instead of in every handler. `body` = the response, `deleted` = `deletedLabel()`.
 */
function recordAudit(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
  body: unknown,
  deleted: string,
): void {
  const input = (req.body ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const here = requestBranchId();
  const verb = req.method === 'POST' ? 'เพิ่ม' : req.method === 'DELETE' ? 'ลบ' : 'แก้';
  const add = (entry: AuditEntry) => pushAudit(db, entry);
  let m: RegExpExecArray | null;

  if (path === 'sales' && req.method === 'POST') {
    const sale = body as Sale;
    if (sale.manualDiscount > 0) {
      add({
        action: 'manual_discount',
        branchId: sale.branchId ?? here,
        ref: { kind: 'sale', id: sale.id, label: sale.orderNo },
        detail: `฿${sale.manualDiscount} — ${sale.manualDiscountReason}`,
      });
    }
  } else if ((m = /^sales\/(\d+)\/(void|credit-notes|tax-invoice\/reissue)$/.exec(path))) {
    const sale = db.sales.find((x) => x.id === Number(m![1]));
    if (!sale) return;
    const branchId = sale.branchId ?? here;
    if (m[2] === 'void') {
      const approved = sale.voidApprovedBy ? ` (อนุมัติโดย ${sale.voidApprovedBy})` : '';
      add({
        action: 'sale_void',
        branchId,
        ref: { kind: 'sale', id: sale.id, label: sale.orderNo },
        detail: `฿${sale.total} — ${sale.voidReason}${approved}`,
      });
    } else if (m[2] === 'credit-notes') {
      const note = body as CreditNote;
      add({
        action: 'credit_note',
        branchId,
        ref: { kind: 'credit_note', id: note.id, label: note.cnNo },
        detail: `บิล ${sale.orderNo} คืนเงิน ฿${note.total}`,
      });
    } else {
      const invoice = body as TaxInvoice;
      add({
        action: 'tax_invoice_reissue',
        branchId,
        ref: { kind: 'tax_invoice', id: invoice.id, label: invoice.invoiceNo },
        detail: `แทน ${invoice.replacesInvoiceNo ?? '-'} — ${text(input['reason'])}`,
      });
    }
  } else if ((m = /^products\/(\d+)\/(stock|serials\/remove)$/.exec(path))) {
    const productId = Number(m[1]);
    const ref: AuditRef = { kind: 'product', id: productId, label: skuOf(db, productId) };
    if (m[2] === 'stock') {
      const delta = Number(input['delta']);
      if (!(delta < 0)) return;
      add({
        action: 'stock_out',
        branchId: here,
        ref,
        detail: `${delta} — ${text(input['note'])}`,
      });
    } else {
      const ids = (input['ids'] as number[] | undefined) ?? [];
      const serials = db.serials.filter((x) => ids.includes(x.id)).map((x) => x.serial);
      add({
        action: 'serial_remove',
        branchId: here,
        ref,
        detail: `${serials.join(', ')} → ${text(input['status'])} — ${text(input['note'])}`,
      });
    }
  } else if ((m = /^transfers\/(\d+)\/cancel$/.exec(path))) {
    const transfer = body as Transfer;
    add({
      action: 'transfer_cancel',
      branchId: transfer.fromBranchId,
      ref: { kind: 'transfer', id: transfer.id, label: transfer.transferNo },
      detail: transfer.cancelReason,
    });
  } else if (path === 'prices' || path.startsWith('prices/')) {
    const price = body as SkuPrice | null;
    const label = price ? `${skuOf(db, price.productId)} ฿${price.price}` : deleted;
    const period = price ? ` ${price.startDate} – ${price.endDate ?? 'ไม่มีกำหนด'}` : '';
    add({
      action: 'price_change',
      ref: { kind: 'price', id: price?.id ?? (Number(path.split('/')[1]) || null), label },
      detail: `${verb}ช่วงราคา${period}`,
    });
  } else if (path === 'promotions' || /^promotions\/\d+$/.test(path)) {
    const promo = body as Promotion | null;
    add({
      action: 'promotion_change',
      ref: {
        kind: 'promotion',
        id: promo?.id ?? (Number(path.split('/')[1]) || null),
        label: promo ? `${promo.code} ${promo.name}` : deleted,
      },
      detail: promo ? `${verb}โปรโมชั่น${promo.enabled ? '' : ' (ปิดใช้งาน)'}` : 'ลบโปรโมชั่น',
    });
  } else if ((m = /^users\/(\d+)\/password$/.exec(path))) {
    const user = db.users.find((u) => u.id === Number(m![1]));
    add({
      action: 'user_password',
      ref: { kind: 'user', id: user?.id ?? null, label: user?.username ?? '' },
      detail: 'ผู้ดูแลระบบตั้งรหัสผ่านใหม่ให้',
    });
  } else if (path === 'users' || /^users\/\d+$/.test(path)) {
    const user = body as User | null;
    const rights = user
      ? `${ROLE_LABEL[user.role]} · ${user.allBranches ? 'ทุกสาขา' : `สาขา ${user.branchIds.join(', ')}`}` +
        (user.active ? '' : ' · ปิดใช้งาน')
      : '';
    add({
      action: 'user_change',
      ref: {
        kind: 'user',
        id: user?.id ?? (Number(path.split('/')[1]) || null),
        label: user?.username ?? deleted,
      },
      detail: user ? `${verb}ผู้ใช้ — ${rights}` : 'ลบผู้ใช้',
    });
  } else if (path === 'company/plan') {
    const plan = planOf((body as SubscriptionInfo).planId);
    add({
      action: 'plan_change',
      ref: { kind: 'company', id: tenant.id, label: tenant.code },
      detail: `เปลี่ยนเป็นแพ็กเกจ ${plan.name} (฿${plan.monthlyPrice} / เดือน)`,
    });
  } else if (path === 'company/export') {
    add({
      action: 'company_export',
      ref: { kind: 'company', id: tenant.id, label: tenant.code },
      detail: 'ดาวน์โหลดข้อมูลทั้งบริษัท (JSON)',
    });
  } else if (path === 'company/deletion') {
    const ref: AuditRef = { kind: 'company', id: tenant.id, label: tenant.code };
    if (req.method === 'POST') {
      const d = body as CompanyDeletion;
      add({
        action: 'deletion_request',
        ref,
        detail: `ลบได้ตั้งแต่ ${d.purgeAfter}${d.reason ? ` — ${d.reason}` : ''}`,
      });
    } else if (req.method === 'DELETE') {
      add({ action: 'deletion_cancel', ref, detail: '' });
    }
  } else if (path === 'company/owner') {
    const owner = (body as User[]).find((u) => isOwner(u));
    add({
      action: 'owner_transfer',
      ref: { kind: 'user', id: owner?.id ?? null, label: owner?.username ?? '' },
      detail: `โอนความเป็นเจ้าของให้ ${owner?.name ?? ''}`,
    });
  } else if (path === 'settings/menu-access') {
    const menus = (body as MenuAccess).userMenus;
    const label = (p: string) => MENU.find((x) => x.path === p)?.label ?? p;
    add({
      action: 'menu_access',
      ref: null,
      detail: `ผู้ใช้ทั่วไปเห็น: ${menus.map(label).join(', ')}`,
    });
  } else if (path === 'settings/company' || path === 'settings/store') {
    const info = body as CompanyInfo;
    add({
      action: 'company_settings',
      ref: { kind: 'company', id: tenant.id, label: tenant.code },
      detail: `VAT ${info.vatRegistered ? 'จด' : 'ไม่จด'} · ระบบกะ ${info.requireShift ? 'เปิด' : 'ปิด'} · ส่วนลดพนักงานสูงสุด ${info.manualDiscountMaxPercent}%`,
    });
  } else if (path === 'settings/branch') {
    const branch = requestBranch(db);
    add({
      action: 'branch_settings',
      branchId: branch.id,
      ref: { kind: 'branch', id: branch.id, label: branch.code },
      detail: 'แก้ชื่อสถานประกอบการ / ที่อยู่ / โทร / ท้ายใบเสร็จ',
    });
  } else if (path === 'branches' || /^branches\/\d+$/.test(path)) {
    const branch = body as Branch;
    add({
      action: 'branch_change',
      branchId: branch.id,
      ref: { kind: 'branch', id: branch.id, label: branch.code },
      detail: `${verb}สาขา ${branch.name}${branch.active ? '' : ' (ปิดใช้งาน)'}`,
    });
  } else if (path === 'pos-terminals' || /^pos-terminals\/\d+$/.test(path)) {
    const t = body as PosTerminal | null;
    add({
      action: 'terminal_change',
      branchId: t?.branchId ?? null,
      ref: {
        kind: 'terminal',
        id: t?.id ?? (Number(path.split('/')[1]) || null),
        label: t ? `เครื่อง ${t.id}` : deleted,
      },
      detail: t
        ? `${verb}เครื่อง ${t.name} · POS ID ${t.posId || '-'}${t.active ? '' : ' (ปิดใช้งาน)'}`
        : 'ลบเครื่อง',
    });
  } else if ((m = /^shifts\/(\d+)\/(close|approve|adjustments)$/.exec(path))) {
    const shift = db.shifts.find((x) => x.id === Number(m![1]));
    if (!shift) return;
    const ref: AuditRef = { kind: 'shift', id: shift.id, label: shift.shiftNo };
    if (m[2] === 'close') {
      if (shift.cashier === actorName()) return;
      add({
        action: 'shift_close_other',
        branchId: shift.branchId ?? null,
        ref,
        detail: `กะของ ${shift.cashier}`,
      });
    } else if (m[2] === 'approve') {
      add({
        action: 'shift_approve',
        branchId: shift.branchId ?? null,
        ref,
        detail: `กะของ ${shift.cashier}`,
      });
    } else {
      const adj = body as ShiftAdjustment;
      add({
        action: 'shift_adjust',
        branchId: shift.branchId ?? null,
        ref,
        detail: `${adj.amount > 0 ? '+' : ''}${adj.amount} — ${adj.reason}`,
      });
    }
  }
}

/** Routes one request to its handler; `db` is mutated in place for writes. */
function handle(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  if (path === 'auth/login' && req.method === 'POST') {
    return login(req.body as LoginRequest, db);
  }
  if (path === 'auth/verify' && req.method === 'POST') {
    // Checks a login of the token's company without starting a session (shift approval, unlocking
    // the POS). Always a 400, never a 401: the error interceptor logs out on 401.
    const { username, password } = (req.body ?? {}) as Partial<LoginRequest>;
    const user = actor ? checkCredentials(username, password, db) : WRONG_LOGIN;
    return typeof user === 'string' ? error(400, user) : ok({ user });
  }
  // No fallback user: the company comes only from the token, an unknown one never passes.
  if (!actor) return error(401, SESSION_EXPIRED);
  // `/me` answers whatever branch the client remembers, so a stale one can be corrected (step 2).
  if (path === 'me' && req.method === 'GET') {
    return ok(companySession(db, actor));
  }
  if (
    tenant.suspendedReason === 'deletion' &&
    !path.startsWith('company/') &&
    path !== 'audit-log'
  ) {
    return error(
      403,
      'บริษัทอยู่ระหว่างรอลบข้อมูล — ดาวน์โหลดข้อมูลหรือยกเลิกคำขอลบได้ที่เมนูบัญชีบริษัท',
    );
  }
  if (branchHeader !== null && !allowedBranch(db, actor, branchHeader)) {
    return error(403, 'ไม่มีสิทธิ์ทำงานในสาขานี้');
  }
  const forbidden = adminOnlyError(req, path);
  if (forbidden) return error(403, forbidden);
  if (branchHeader === null && needsBranch(req, path)) {
    return error(400, 'ไม่ได้เลือกสาขา กรุณาเลือกสาขาที่ทำงานก่อน');
  }
  if (path === 'users' || path.startsWith('users/')) return handleUsers(req, path, db);
  if (path === 'company' || path.startsWith('company/')) return handleCompany(req, path, db);
  if (path === 'audit-log' && req.method === 'GET') {
    // Admins only (`adminOnlyError()`); a branch admin sees only their branches' events (E40).
    const query = parseAuditQuery((name) => req.params.get(name));
    return ok(filterAuditEvents(db.auditLog, query, actor as User));
  }
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
  if (path === 'payment-methods' || path.startsWith('payment-methods/')) {
    return handlePaymentMethods(req, path, db);
  }
  if (path === 'settings/store') return handleStoreInfo(req, path, db);
  if (path === 'settings/company' || path === 'settings/branch') {
    return handleCompanySettings(req, path, db);
  }
  if (path === 'branches' || path.startsWith('branches/')) return handleBranches(req, path, db);
  if (path === 'transfers' || path.startsWith('transfers/')) {
    return handleTransfers(req, path, db);
  }
  if (path === 'settings/menu-access') return handleMenuAccess(req, path, db);
  if (path === 'shifts' || path.startsWith('shifts/')) return handleShifts(req, path, db);
  if (path === 'pos-terminals' || path.startsWith('pos-terminals/')) {
    return handlePosTerminals(req, path, db);
  }
  if (path === 'credit-notes' && req.method === 'GET') return listCreditNotes(req, db);
  if (path === 'tax-invoices' && req.method === 'GET') {
    // Full tax invoices issued within a local-date range (oldest first, for the tax report).
    const from = req.params.get('from') || null;
    const to = req.params.get('to') || null;
    const day = (t: TaxInvoice) => toIsoDate(new Date(t.date));
    const inScope = listScope(req, db);
    if (typeof inScope !== 'function') return error(inScope.status, inScope.message);
    return ok(
      db.taxInvoices
        .filter(inScope)
        .filter((t) => (!from || day(t) >= from) && (!to || day(t) <= to))
        .sort((a, b) => a.date.localeCompare(b.date)),
    );
  }
  if (path === 'tax-invoices/buyer' && req.method === 'GET') {
    // Last buyer details used with this tax ID (+ branch), to fill the form.
    const taxId = req.params.get('taxId') ?? '';
    const found = [...db.taxInvoices].reverse().find((t) => t.buyer.taxId === taxId);
    return ok(found?.buyer ?? null);
  }
  return notFound(req, path);
}

/**
 * Writes that belong to a branch need `X-Branch-Id` (E2 → E17 stock / sales, E24 shifts and
 * documents): the SKU form too, since its reorder levels belong to the branch (E13).
 */
function needsBranch(req: HttpRequest<unknown>, path: string): boolean {
  if (req.method === 'GET') return false;
  return (
    /^products(\/\d+(\/stock|\/serials(\/remove)?)?)?$/.test(path) ||
    /^sales(\/\d+\/(void|credit-notes|exchanges|tax-invoice|tax-invoice\/reissue))?$/.test(path) ||
    /^shifts(\/.*)?$/.test(path) ||
    /^transfers(\/.*)?$/.test(path)
  );
}

/** Writes per master that only admins may make (`saas-plan.md` section 17); reads stay open. */
const ADMIN_WRITES: [prefix: string, what: string][] = [
  ['categories', 'หมวดหมู่'],
  ['suppliers', 'ผู้จำหน่าย'],
  ['payment-methods', 'ช่องทางชำระเงิน'],
  ['prices', 'ราคาขาย'],
  ['promotions', 'โปรโมชั่น'],
];

/**
 * Admin-only endpoints (permission table, `saas-plan.md` section 17): a non-admin gets this
 * message as a 403. Rules that need the record (shift owner, void approval) live in the handlers.
 */
function adminOnlyError(req: HttpRequest<unknown>, path: string): string | null {
  if (actorIsAdmin()) return null;
  const write = req.method !== 'GET';
  if (path === 'users' || path.startsWith('users/')) return 'จัดการผู้ใช้ได้เฉพาะผู้ดูแลระบบ';
  for (const [prefix, what] of ADMIN_WRITES) {
    if (write && (path === prefix || path.startsWith(prefix + '/'))) {
      return `แก้ไข${what}ได้เฉพาะผู้ดูแลระบบ`;
    }
  }
  const stockOut =
    (req.method === 'PUT' &&
      /^products\/\d+\/stock$/.test(path) &&
      Number((req.body as { delta?: unknown } | null)?.delta) < 0) ||
    (req.method === 'POST' && /^products\/\d+\/serials\/remove$/.test(path));
  if (stockOut) return 'ตัดสต็อกออกได้เฉพาะผู้ดูแลระบบ';
  if (req.method === 'POST' && /^sales\/\d+\/credit-notes$/.test(path)) {
    return 'ออกใบลดหนี้ได้เฉพาะผู้ดูแลระบบ';
  }
  if (req.method === 'POST' && /^sales\/\d+\/tax-invoice\/reissue$/.test(path)) {
    return 'ยกเลิกและออกใบกำกับภาษีใหม่ได้เฉพาะผู้ดูแลระบบ';
  }
  if (path === 'tax-invoices' && req.method === 'GET') return 'ดูรายงานภาษีขายได้เฉพาะผู้ดูแลระบบ';
  if (path === 'settings/store' && write) return 'แก้ข้อมูลร้านได้เฉพาะผู้ดูแลระบบ';
  if ((path === 'settings/company' || path === 'settings/branch') && write) {
    return 'แก้ข้อมูลร้านได้เฉพาะผู้ดูแลระบบ';
  }
  if ((path === 'branches' || path.startsWith('branches/')) && write) {
    return 'จัดการสาขาได้เฉพาะผู้ดูแลระบบ';
  }
  if (path === 'settings/menu-access' && write) return 'กำหนดสิทธิ์เมนูได้เฉพาะผู้ดูแลระบบ';
  if (path === 'audit-log') return 'ดูประวัติการใช้งานได้เฉพาะผู้ดูแลระบบ';
  if (req.method === 'POST' && /^shifts\/\d+\/approve$/.test(path)) {
    return 'อนุมัติส่วนต่างได้เฉพาะผู้ดูแลระบบ';
  }
  if (req.method === 'POST' && /^shifts\/\d+\/adjustments$/.test(path)) {
    return 'ปรับปรุงกะได้เฉพาะผู้ดูแลระบบ';
  }
  return null;
}

function handleUsers(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const { users } = db;
  // Only admins reach this handler (`adminOnlyError()`).
  const caller = actor as User;
  if (path === 'users' && req.method === 'GET') {
    return ok([...users]);
  }
  if (path === 'users' && req.method === 'POST') {
    const { password, ...body } = withUserRules(req.body as NewUserPayload);
    const scope = userScopeError(caller, null, body);
    if (scope) return error(403, scope);
    const problem =
      ownerRoleError(null, body.role) ??
      userIdentityError(users, body, null) ??
      userBranchError(body, db.branches) ??
      passwordError(password ?? '');
    if (problem) return error(400, problem);
    const limit = limitError(db, 'users', body.active);
    if (limit) return error(403, limit);
    const user: User = { ...body, id: db.nextId++, createdAt: new Date().toISOString() };
    users.push(user);
    db.passwords[user.id] = password;
    return ok(user);
  }
  const passwordMatch = /^users\/(\d+)\/password$/.exec(path);
  if (passwordMatch && req.method === 'PUT') {
    // An admin sets a new password for a user (D4 section 14: staff have no e-mail reset).
    const user = users.find((u) => u.id === Number(passwordMatch[1]));
    if (!user) return error(404, 'ไม่พบผู้ใช้');
    const scope = userScopeError(caller, user, user);
    if (scope) return error(403, scope);
    const password = (req.body as { password?: string } | null)?.password ?? '';
    const problem = passwordError(password);
    if (problem) return error(400, problem);
    db.passwords[user.id] = password;
    return ok(null);
  }
  const idMatch = /^users\/(\d+)$/.exec(path);
  if (idMatch) {
    const index = users.findIndex((u) => u.id === Number(idMatch[1]));
    if (index < 0) return error(404, 'ไม่พบผู้ใช้');
    switch (req.method) {
      case 'GET':
        return ok(users[index]);
      case 'PUT': {
        const payload = withUserRules({ ...users[index], ...(req.body as Partial<UserPayload>) });
        const scope = userScopeError(caller, users[index], payload);
        if (scope) return error(403, scope);
        const identity =
          userIdentityError(users, payload, users[index].id) ??
          userBranchError(payload, db.branches);
        if (identity) return error(400, identity);
        const problem = userChangeError(
          users,
          { kind: 'update', id: users[index].id, payload },
          actor?.id ?? null,
        );
        if (problem) return error(400, problem);
        const limit = limitError(db, 'users', payload.active, users[index].active);
        if (limit) return error(403, limit);
        users[index] = payload;
        return ok(users[index]);
      }
      case 'DELETE': {
        const scope = userScopeError(caller, users[index], null);
        if (scope) return error(403, scope);
        const problem = userChangeError(
          users,
          { kind: 'delete', id: users[index].id },
          actor?.id ?? null,
        );
        if (problem) return error(400, problem);
        users.splice(index, 1);
        delete db.passwords[Number(idMatch[1])];
        return ok(null);
      }
    }
  }
  return notFound(req, path);
}

/**
 * A user as stored: username lower case, e-mail trimmed ('' when not given), branch ids unique and
 * sorted — none when the user has all branches (the owner always has, E33).
 */
function withUserRules<
  T extends Pick<User, 'username' | 'email' | 'allBranches' | 'branchIds' | 'role'>,
>(u: T): T {
  const allBranches = !!u.allBranches || isOwner(u);
  return {
    ...u,
    username: normalizeUsername(u.username ?? ''),
    email: (u.email ?? '').trim(),
    allBranches,
    branchIds: allBranches ? [] : [...new Set(u.branchIds ?? [])].sort((a, b) => a - b),
  };
}

/**
 * The company's own account, owner only (E33): `POST /company/owner { userId, password }` hands
 * ownership over — the owner confirms with their password, the new owner gets every branch and
 * the old one becomes an admin of every branch. Answers the users.
 */
function handleCompany(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const caller = actor as User;
  if (path === 'company/subscription' && req.method === 'GET') {
    if (!hasAdminRights(caller)) return error(403, 'ดูแพ็กเกจได้เฉพาะผู้ดูแลระบบ');
    return ok(subscriptionInfo(db));
  }
  if (path === 'company/onboarding' && req.method === 'GET') {
    if (!hasAdminRights(caller)) return error(403, 'ดูขั้นตอนเริ่มต้นใช้งานได้เฉพาะผู้ดูแลระบบ');
    return ok({
      terminals: db.posTerminals.length,
      categories: db.categories.length,
      products: db.products.length,
      prices: db.prices.length,
      users: db.users.length,
    } satisfies OnboardingCounts);
  }
  if (path === 'company/plan' && req.method === 'PUT') {
    if (!isOwner(caller)) return error(403, 'เปลี่ยนแพ็กเกจได้เฉพาะเจ้าของบริษัท');
    const planId = (req.body as { planId?: string } | null)?.planId;
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) return error(400, 'ไม่มีแพ็กเกจนี้');
    // A downgrade is allowed even when over its limits: only adding more is blocked (E34).
    tenant.planId = plan.id;
    platformChanged = true;
    return ok(subscriptionInfo(db));
  }
  if (path === 'company/export' && req.method === 'GET') {
    if (!isOwner(caller)) return error(403, 'ดาวน์โหลดข้อมูลทั้งบริษัทได้เฉพาะเจ้าของบริษัท');
    return ok(companyExport(db));
  }
  if (path === 'company/deletion') {
    if (!isOwner(caller)) return error(403, 'ขอลบข้อมูลบริษัทได้เฉพาะเจ้าของบริษัท');
    if (req.method === 'GET') return ok(tenant.deletion ?? null);
    if (req.method === 'POST') {
      const p = {
        companyCode: '',
        password: '',
        reason: '',
        ...(req.body as Partial<DeletionRequest>),
      };
      const problem = deletionRequestError(p, tenant.code);
      if (problem) return error(400, problem);
      if (p.password !== passwordOf(db, caller.id)) return error(400, 'รหัสผ่านไม่ถูกต้อง');
      if (tenant.deletion) return error(400, 'ขอลบข้อมูลไว้แล้ว');
      tenant.deletion = {
        requestedAt: new Date().toISOString(),
        requestedBy: caller.name,
        reason: p.reason.trim(),
        purgeAfter: addDaysIso(todayIso(), DELETION_WAIT_DAYS),
      };
      // Suspended at once for everyone but the owner (E39); an earlier suspension is replaced.
      Object.assign(tenant, { active: false, suspendedReason: 'deletion' });
      platformChanged = true;
      return ok(tenant.deletion);
    }
    if (req.method === 'DELETE') {
      if (!tenant.deletion) return error(400, 'ไม่มีคำขอลบข้อมูล');
      Object.assign(tenant, { deletion: null, active: true, suspendedReason: null });
      // Billing decides again: an overdue company is suspended again right away.
      refreshBilling(platform, tenant, todayIso());
      platformChanged = true;
      return ok(null);
    }
  }
  if (path === 'company/owner' && req.method === 'POST') {
    const { userId, password } = (req.body ?? {}) as { userId?: number; password?: string };
    const problem = ownerTransferError(db.users, caller, Number(userId));
    if (problem) return error(isOwner(caller) ? 400 : 403, problem);
    if (password !== passwordOf(db, caller.id)) return error(400, 'รหัสผ่านไม่ถูกต้อง');
    for (const u of db.users) {
      if (u.id === caller.id) Object.assign(u, { role: 'admin', allBranches: true, branchIds: [] });
      if (u.id === Number(userId)) {
        Object.assign(u, { role: 'owner', allBranches: true, branchIds: [] });
      }
    }
    return ok([...db.users]);
  }
  return notFound(req, path);
}

/** Every collection of the company as stored, never a password (E38). */
function companyExport(db: MockDb): CompanyExport {
  const stored: Record<string, unknown> = { ...db, products: storeBranchStock(db) };
  for (const key of ['passwords', 'storeInfo', 'legacyPosId'] as const) delete stored[key];
  for (const key of Object.keys(stored)) {
    // Counters and one-time migration flags are the mock's own bookkeeping.
    if (/^next[A-Z]/.test(key) || /(Migrated|Fixed|Enabled)$/.test(key)) delete stored[key];
  }
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    company: {
      id: tenant.id,
      code: tenant.code,
      name: db.companyInfo.name,
      taxId: db.companyInfo.taxId,
    },
    data: stored,
  };
}

/** The request company's package and what it uses (E34). */
function subscriptionInfo(db: MockDb): SubscriptionInfo {
  const invoices = invoicesOf(platform, tenant.id).sort((a, b) => b.id - a.id);
  return {
    planId: tenant.planId,
    usage: usageOf(db),
    status: subscriptionStatus(tenant.subscription, invoices, todayIso()),
    subscription: tenant.subscription,
    invoices,
  };
}

const usageOf = (db: MockDb): PlanUsage =>
  planUsage({ branches: db.branches, users: db.users, terminals: db.posTerminals });

/**
 * One more active branch / user / POS terminal must fit the package (E34) — checked when adding
 * one or turning one back on (`wasActive` false); a record staying active never counts as new.
 */
function limitError(
  db: MockDb,
  kind: LimitKind,
  active: boolean,
  wasActive = false,
): string | null {
  if (!active || wasActive) return null;
  return planLimitError(kind, planOf(tenant.planId), usageOf(db));
}

/**
 * Companies stored before the owner role (E33): the first active admin of every branch (else the
 * first active admin) becomes the owner, once.
 */
function fillOwner(db: MockDb): boolean {
  if (db.users.some((u) => isOwner(u))) return false;
  const admins = db.users.filter((u) => u.active && u.role === 'admin');
  const owner = admins.find((u) => u.allBranches) ?? admins[0];
  if (!owner) return false;
  Object.assign(owner, { role: 'owner', allBranches: true, branchIds: [] });
  return true;
}

/**
 * Users stored before usernames / branch rights existed: the first user (the admin login) gets
 * `admin`, the others the part of their e-mail before @, with `-<id>` added on a clash (E4);
 * admins get all branches, the others the first branch (E9).
 */
function fillUserDefaults(db: MockDb): void {
  const { users } = db;
  for (const u of users) {
    if (u.allBranches !== undefined) continue;
    u.allBranches = hasAdminRights(u);
    u.branchIds = u.allBranches ? [] : [db.branches[0].id];
  }
  const taken = new Set(users.filter((u) => u.username).map((u) => normalizeUsername(u.username)));
  users.forEach((u, i) => {
    if (u.username) return;
    const base = i === 0 ? 'admin' : normalizeUsername((u.email ?? '').split('@')[0]);
    let name = usernameError(base) ? `user${u.id}` : base;
    if (taken.has(name)) name = `${name}-${u.id}`;
    taken.add(name);
    u.username = name;
    u.email ??= '';
  });
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
    const payload = withServiceRules(
      withoutDerived(withStoredCosts(db, req.body as ProductPayload)),
    );
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
    // One branch's card only (E15): another branch the user may work in via `?branchId=`.
    const asked = req.params.get('branchId');
    const branchId = asked ? Number(asked) : stockBranch;
    if (asked && branchId !== stockBranch && !(actor && allowedBranch(db, actor, asked))) {
      return error(403, 'ไม่มีสิทธิ์ดูบัตรสต็อกของสาขานี้');
    }
    const own = db.movements.filter((m) => m.productId === productId && m.branchId === branchId);
    return ok(buildStockCard(own, from, to));
  }
  const branchStockMatch = /^products\/(\d+)\/branch-stock$/.exec(path);
  if (branchStockMatch && req.method === 'GET') {
    const product = products.find((p) => p.id === Number(branchStockMatch[1]));
    if (!product) return error(404, 'ไม่พบ SKU');
    return ok(branchStockRows(db, product));
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
        const body = withStoredCosts(db, req.body as ProductPayload, products[index]);
        const payload = withServiceRules(withoutDerived(body));
        const problem = validateSku(payload, db, id);
        if (problem) return error(400, problem);
        // Stock in any branch counts (E18).
        const stocked = stockedBranches(db, id) || inTransitNote(db, id);
        if (payload.serialControl !== products[index].serialControl && stocked) {
          return error(400, `ยังมีสต็อกคงเหลือ${stocked} เปลี่ยนการคุม Serial ไม่ได้`);
        }
        if (payload.itemType !== products[index].itemType && stocked) {
          return error(400, `ยังมีสต็อกคงเหลือ${stocked} เปลี่ยนเป็นสินค้าบริการไม่ได้`);
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
        const stocked = stockedBranches(db, id) || inTransitNote(db, id);
        if (stocked) return error(400, `ยังมีสต็อกคงเหลือ${stocked} ลบไม่ได้`);
        if (db.sales.some((s) => s.lines.some((l) => l.productId === id))) {
          return error(400, 'SKU นี้มีประวัติการขาย ลบไม่ได้ (เปลี่ยนสถานะเป็นเลิกจำหน่ายแทน)');
        }
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
      const costProblem = receiptCostError(cost);
      if (costProblem) return error(400, costProblem);
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

/**
 * Serial SKU in the request's branch: stock = its in-stock serials, avgCost = mean of their own
 * costs (kept when none).
 */
function withSerialStock(product: Product, db: MockDb, branchId = stockBranch): Product {
  if (!product.serialControl) return product;
  const inStock = db.serials.filter(
    (s) => s.productId === product.id && s.branchId === branchId && s.status === 'in_stock',
  );
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
    branchId: stockBranch,
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
    const own = (x: { productId: number; branchId: number }) =>
      x.productId === product.id && x.branchId === stockBranch;
    if (product.stock > 0 && !db.movements.some(own)) {
      const serials = product.serialControl
        ? db.serials.filter((s) => own(s) && s.status === 'in_stock').map((s) => s.serial)
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

/** The SKU as the request's branch sees it: that branch's stock fields (serial: its serials). */
function atBranch(db: MockDb, product: Product): Product {
  const row = db.branchStock.find((r) => r.productId === product.id && r.branchId === stockBranch);
  const here = withBranchStock(product, row);
  return withSerialStock(here, db);
}

/**
 * Writes the products' stock fields back into the request branch's rows (a row is made only when
 * something is set) and returns the products to store without them.
 */
function storeBranchStock(db: MockDb): Partial<Product>[] {
  for (const p of db.products) {
    const row = db.branchStock.find((r) => r.productId === p.id && r.branchId === stockBranch);
    const fields = {
      stock: p.stock,
      avgCost: p.avgCost,
      minStock: p.minStock,
      maxStock: p.maxStock,
    };
    if (row) Object.assign(row, fields);
    else if (Object.values(fields).some((v) => v !== 0)) {
      db.branchStock.push({ branchId: stockBranch, productId: p.id, ...fields });
    }
  }
  return db.products.map((p) => {
    const stored: Partial<Product> = { ...p };
    delete stored.stock;
    delete stored.avgCost;
    delete stored.minStock;
    delete stored.maxStock;
    return stored;
  });
}

/**
 * A SKU written by someone who does not see cost (form or Excel, E44): the costs they cannot see
 * are never taken from the request — the stored standard cost and supplier costs stay; a new SKU
 * or a new supplier link starts at 0 until an admin sets it.
 */
function withStoredCosts(db: MockDb, payload: ProductPayload, stored?: Product): ProductPayload {
  if (canSeeCost(actor, db.companyInfo)) return payload;
  const supplierCost = (supplierId: number) =>
    stored?.suppliers.find((s) => s.supplierId === supplierId)?.cost ?? 0;
  return {
    ...payload,
    cost: stored?.cost ?? 0,
    suppliers: (payload.suppliers ?? []).map((s) => ({ ...s, cost: supplierCost(s.supplierId) })),
  };
}

/**
 * `GET /products/:id/branch-stock`: every active branch (no row = 0). Everyone sees quantities;
 * the average cost only those who see cost (E14 → `hideCost()` in `tenantResponse()`, E43).
 */
function branchStockRows(db: MockDb, product: Product): BranchStockRow[] {
  return db.branches
    .filter((b) => b.active)
    .map((b) => {
      const row = db.branchStock.find((r) => r.productId === product.id && r.branchId === b.id);
      const here = withSerialStock(withBranchStock(product, row), db, b.id);
      return { branchId: b.id, stock: here.stock, avgCost: here.avgCost };
    });
}

/** ' (ระหว่างโอน TR-…)' when a transfer not yet received carries the SKU, else ''. */
function inTransitNote(db: MockDb, productId: number): string {
  const open = db.transfers.filter(
    (t) => t.status === 'in_transit' && t.lines.some((l) => l.productId === productId),
  );
  return open.length ? ` (ระหว่างโอน ${open.map((t) => t.transferNo).join(', ')})` : '';
}

/** ' (สาขา HQ, BN)' when any branch still holds the SKU, else '' (E18). */
function stockedBranches(db: MockDb, productId: number): string {
  const codes = db.branches
    .filter(
      (b) =>
        db.serials.some(
          (s) => s.productId === productId && s.branchId === b.id && s.status === 'in_stock',
        ) ||
        db.branchStock.some((r) => r.productId === productId && r.branchId === b.id && r.stock > 0),
    )
    .map((b) => b.code);
  return codes.length ? ` (สาขา ${codes.join(', ')})` : '';
}

/**
 * Once per stored db (SaaS step 3): the single store-wide stock of older data becomes the first
 * branch's — sample serials / costing as before, then stock / avgCost / min / max into
 * `branchStock`, and serials, movements and documents without a branch get the first one. BN (seed
 * branch 2) gets sample stock of its own.
 */
function migrateBranchStock(db: MockDb): boolean {
  if (db.branchStockMigrated) return false;
  const first = db.branches[0].id;
  stockBranch = first;
  for (const list of [db.serials, db.movements, db.sales, db.creditNotes, db.exchanges]) {
    for (const x of list as { branchId?: number | null }[]) x.branchId ??= first;
  }
  // Serial SKUs with stock but no serials (seed / older data) get sample serials.
  syncSerials(db);
  migrateCosting(db);
  for (const p of db.products) {
    if (isService(p)) continue;
    const fields = {
      stock: p.stock,
      avgCost: p.avgCost,
      minStock: p.minStock,
      maxStock: p.maxStock,
    };
    if (
      Object.values(fields).some((v) => v !== 0) &&
      !db.branchStock.some((r) => r.productId === p.id)
    ) {
      db.branchStock.push({ branchId: first, productId: p.id, ...fields });
    }
  }
  seedBranchSample(db);
  db.branchStockMigrated = true;
  return true;
}

/** Sample stock for the seed branch BN: other costs than HQ (D1), a serial SKU, an opening line each. */
function seedBranchSample(db: MockDb): void {
  const bn = db.branches.find((b) => b.code === 'BN');
  if (!bn || db.branchStock.some((r) => r.branchId === bn.id)) return;
  stockBranch = bn.id;
  const sample: [
    sku: string,
    stock: number,
    avgCost: number,
    minStock: number,
    maxStock: number,
  ][] = [
    ['NB-001', 2, 20500, 1, 4],
    ['MS-010', 8, 380, 5, 20],
    ['KB-020', 4, 1600, 2, 8],
  ];
  for (const [sku, stock, avgCost, minStock, maxStock] of sample) {
    const product = db.products.find((p) => p.sku === sku && !isService(p));
    if (!product) continue;
    db.branchStock.push({
      branchId: bn.id,
      productId: product.id,
      stock,
      avgCost,
      minStock,
      maxStock,
    });
    const here = atBranch(db, { ...product, avgCost });
    // Serial SKU: the sample units (own cost each), like `syncSerials()` makes for HQ.
    if (here.serialControl) syncSerials(db, [{ ...here, stock }]);
    const view = atBranch(db, product);
    const serials = view.serialControl
      ? db.serials
          .filter((s) => s.productId === product.id && s.branchId === bn.id)
          .map((s) => s.serial)
      : [];
    recordMovement(
      db,
      view,
      'opening',
      view.stock,
      view.avgCost,
      costValue(view),
      serials,
      'ยอดยกมา',
    );
  }
  stockBranch = db.branches[0].id;
}

/**
 * Receipt cost per base unit: required and not negative. It may have more than 2 decimals (a pack
 * cost ÷ its factor), so only those two `moneyProblem()` cases apply here.
 */
function receiptCostError(cost: unknown): string | null {
  const problem = moneyProblem(cost);
  return problem && problem !== 'decimals' ? moneyProblemText(problem, 'ต้นทุน') : null;
}

/**
 * Generates deterministic sample serials (in the request's branch) so serial SKUs always have
 * stock = in-stock serials.
 */
function syncSerials(db: MockDb, products: readonly Product[] = db.products): boolean {
  let changed = false;
  for (const product of products) {
    if (!product.serialControl) continue;
    const owned = db.serials.filter((s) => s.productId === product.id);
    let inStock = owned.filter((s) => s.branchId === stockBranch && s.status === 'in_stock').length;
    let seq = owned.length;
    while (inStock < product.stock) {
      const serial = sampleSerial(product, ++seq);
      if (db.serials.some((s) => s.serial === serial)) continue;
      db.serials.push({
        id: db.nextSerialId++,
        productId: product.id,
        branchId: stockBranch,
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
    // This branch's units: in stock here + removed here (history, E16).
    return ok(db.serials.filter((s) => s.productId === productId && s.branchId === stockBranch));
  }

  if (!action && req.method === 'POST') {
    const blocked = purchaseBlocked(product);
    if (blocked) return blocked;
    const body = req.body as { serials: string[]; unitCost?: number; note?: string };
    const serials = body.serials.map((s) => s.trim().toUpperCase());
    if (!serials.length) return error(400, 'ไม่มี Serial ที่จะรับเข้า');
    // Specific identification: every received unit carries its own purchase cost.
    const unitCost = body.unitCost ?? product.cost;
    const costProblem = receiptCostError(unitCost);
    if (costProblem) return error(400, costProblem);
    const problems: string[] = [];
    serials.forEach((serial, i) => {
      const formatError = serialFormatError(serial, product);
      if (formatError) problems.push(`${serial}: ${formatError}`);
      else if (serials.indexOf(serial) !== i) problems.push(`${serial}: ซ้ำในรายการ`);
      else {
        // Serial numbers are unique company-wide: one in stock elsewhere is not received again (E16).
        const held = db.serials.find((s) => s.serial === serial && s.status === 'in_stock');
        if (held?.branchId === stockBranch) problems.push(`${serial}: มีอยู่ในคลังแล้ว`);
        else if (held) problems.push(`${serial}: อยู่ในคลังสาขา ${branchCode(db, held.branchId)}`);
      }
    });
    if (problems.length) return error(400, `รับเข้าไม่ได้ — ${problems.join(', ')}`);

    const now = new Date().toISOString();
    const typed = (body.note ?? '').trim();
    // Units removed earlier and received again: the serial and its stock-card line say so (B18).
    const returning = serials.filter((serial) => db.serials.some((s) => s.serial === serial));
    const returnNote = typed || 'รับคืนเข้าคลัง';
    const movementNote =
      typed ||
      (!returning.length
        ? ''
        : returning.length === serials.length
          ? 'รับคืนเข้าคลัง'
          : `รับคืนเข้าคลัง ${returning.join(', ')}`);
    // E32: units last at another branch (the stop-gap move of E16) — the screen suggests a transfer.
    const fromOtherBranch = serials.flatMap((serial) => {
      const existing = db.serials.find((s) => s.serial === serial);
      return existing && existing.branchId !== stockBranch
        ? [{ serial, branchCode: branchCode(db, existing.branchId) }]
        : [];
    });
    const received = serials.map((serial) => {
      const existing = db.serials.find((s) => s.serial === serial);
      if (existing) {
        // A previously removed unit coming back (e.g. customer return). The record is reused, so
        // its removal shows only in the stock movements (`serialMovements()`).
        Object.assign(existing, {
          productId,
          branchId: stockBranch,
          status: 'in_stock',
          receivedAt: now,
          removedAt: null,
          note: returnNote,
          cost: unitCost,
        });
        return existing;
      }
      const created: SerialNumber = {
        id: db.nextSerialId++,
        productId,
        branchId: stockBranch,
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
      movementNote,
    );
    const result: SerialReceiveResult = { product: updated, received, fromOtherBranch };
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
      db.serials.find(
        (s) =>
          s.id === id &&
          s.productId === productId &&
          s.branchId === stockBranch &&
          s.status === 'in_stock',
      ),
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
    const priceProblem = moneyInputError(payload.price, 'ราคา');
    if (priceProblem) return priceProblem;
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
    branches: db.branches,
    today: todayIso(),
  });
  // D2 / E6: promotions limited to branches belong to company admins (403).
  const scope = (p: PromotionPayload | null, existing: Promotion | null) =>
    promotionBranchScopeError(p, existing, isCompanyAdmin(actor));
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
    const forbidden = scope(payload, null);
    if (forbidden) return error(403, forbidden);
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
        const forbidden = scope(payload, promotions[index]);
        if (forbidden) return error(403, forbidden);
        const problem = promotionError(payload, ctx(), promotions[index]);
        if (problem) return error(400, problem);
        promotions[index] = { ...payload, id };
        return ok(promotions[index]);
      }
      case 'DELETE': {
        const forbidden = scope(null, promotions[index]);
        if (forbidden) return error(403, forbidden);
        if (hasStarted(promotions[index], todayIso())) {
          return error(400, 'โปรที่เริ่มแล้วลบไม่ได้ (ปิดใช้งานแทน)');
        }
        promotions.splice(index, 1);
        return ok(null);
      }
    }
  }
  return notFound(req, path);
}

/**
 * GET/POST /payment-methods, PUT/DELETE /payment-methods/:id,
 * PUT /payment-methods/order { ids } (new button order; returns the sorted list)
 */
function handlePaymentMethods(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const sorted = () => [...db.paymentMethods].sort((a, b) => a.sortOrder - b.sortOrder);
  const normalize = (m: PaymentMethodPayload): PaymentMethodPayload =>
    withPaymentTypeRules({
      ...PAYMENT_METHOD_DEFAULTS,
      ...m,
      code: (m.code ?? '').trim().toUpperCase(),
      name: (m.name ?? '').trim(),
      maxAmount: m.maxAmount || null,
    });

  if (path === 'payment-methods' && req.method === 'GET') return ok(sorted());
  if (path === 'payment-methods' && req.method === 'POST') {
    const payload = normalize(req.body as PaymentMethodPayload);
    const problem = paymentMethodError(payload, db.paymentMethods);
    if (problem) return error(400, problem);
    const created: PaymentMethod = {
      ...payload,
      id: db.nextPaymentMethodId++,
      // New buttons go last.
      sortOrder: Math.max(0, ...db.paymentMethods.map((m) => m.sortOrder)) + 1,
    };
    db.paymentMethods.push(created);
    return ok(created);
  }
  if (path === 'payment-methods/order' && req.method === 'PUT') {
    const { ids } = req.body as { ids: number[] };
    const known = new Set(db.paymentMethods.map((m) => m.id));
    if (ids.length !== known.size || ids.some((id) => !known.delete(id))) {
      return error(400, 'ลำดับไม่ครบหรือมีรายการที่ไม่รู้จัก กรุณาโหลดใหม่');
    }
    ids.forEach((id, i) => {
      const method = db.paymentMethods.find((m) => m.id === id);
      if (method) method.sortOrder = i + 1;
    });
    return ok(sorted());
  }
  const idMatch = /^payment-methods\/(\d+)$/.exec(path);
  if (idMatch) {
    const id = Number(idMatch[1]);
    const index = db.paymentMethods.findIndex((m) => m.id === id);
    if (index < 0) return error(404, 'ไม่พบช่องทางชำระเงิน');
    switch (req.method) {
      case 'PUT': {
        const payload = normalize(req.body as PaymentMethodPayload);
        const problem = paymentMethodError(payload, db.paymentMethods, id);
        if (problem) return error(400, problem);
        // The order is changed only via PUT /payment-methods/order.
        db.paymentMethods[index] = {
          ...payload,
          id,
          sortOrder: db.paymentMethods[index].sortOrder,
        };
        return ok(db.paymentMethods[index]);
      }
      case 'DELETE':
        if (isLastActiveCash(db.paymentMethods, id)) {
          return error(400, 'ต้องมีช่องทางเงินสดที่เปิดใช้งานอย่างน้อย 1 ช่องทาง ลบไม่ได้');
        }
        if (db.sales.some((s) => s.payments.some((p) => p.methodId === id))) {
          return error(400, 'มีการขายที่ใช้ช่องทางนี้แล้ว ลบไม่ได้ (ปิดใช้งานแทน)');
        }
        db.paymentMethods.splice(index, 1);
        return ok(null);
    }
  }
  return notFound(req, path);
}

/**
 * GET /sales[?from&to] (local day of sale, newest first), GET /sales/:id,
 * POST /sales (POS checkout: SalePayload → Sale), POST /sales/:id/void { reason },
 * PUT /sales/:id/status { status } (orders from before the POS only)
 */
function handleSales(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const { sales } = db;
  // Return summary / exchange numbers are derived from the credit notes and exchanges on every
  // read (never stored).
  const withReturns = (s: Sale): Sale => ({
    ...s,
    ...returnSummary(
      s,
      db.creditNotes.filter((n) => n.saleId === s.id),
    ),
    exchangeNos: exchangeNos(db.exchanges.filter((x) => x.saleId === s.id)),
  });
  if (path === 'sales' && req.method === 'GET') {
    // Optional local-date range on the day of sale; newest first.
    const from = req.params.get('from') || null;
    const to = req.params.get('to') || null;
    const isDate = (d: string | null) => d === null || /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (!isDate(from) || !isDate(to)) return error(400, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD');
    if (from && to && from > to) return error(400, 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
    // Optional shift: bills sold or voided in it.
    const shiftId = Number(req.params.get('shiftId')) || null;
    const inScope = listScope(req, db);
    if (typeof inScope !== 'function') return error(inScope.status, inScope.message);
    return ok(
      sales
        .filter(inScope)
        .filter((s) => (!from || saleDay(s) >= from) && (!to || saleDay(s) <= to))
        .filter((s) => !shiftId || s.shiftId === shiftId || s.voidShiftId === shiftId)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(withReturns),
    );
  }
  if (path === 'sales' && req.method === 'POST') return checkout(req.body as SalePayload, db);
  if (path === 'sales/cost-check' && req.method === 'POST') {
    // E45: the POS of someone who does not see cost asks whether manual discounts go below it.
    return ok({ issues: belowCostIssues(serverPricedCart(req.body as SalePayload, db).issues) });
  }

  const idMatch =
    /^sales\/(\d+)(?:\/(status|void|credit-notes|exchanges|tax-invoice|tax-invoices|tax-invoice\/reissue))?$/.exec(
      path,
    );
  if (!idMatch) return notFound(req, path);
  const index = sales.findIndex((s) => s.id === Number(idMatch[1]));
  if (index < 0) return error(404, 'ไม่พบบิลขาย');
  const sale = sales[index];
  const action = idMatch[2];

  if (!action && req.method === 'GET') return ok(withReturns(sale));
  if (action === 'void' && req.method === 'POST') {
    const { reason, approval } = (req.body ?? {}) as Partial<VoidPayload>;
    // A non-admin voids only with an admin's login typed at the terminal (P3, like shift close).
    let approver: string | null = null;
    if (!actorIsAdmin()) {
      if (!approval) return error(403, 'ยกเลิกบิลต้องให้ผู้ดูแลระบบอนุมัติ');
      const found = checkCredentials(approval.username, approval.password, db);
      if (typeof found === 'string') return error(400, 'รหัสผ่านผู้อนุมัติไม่ถูกต้อง');
      if (!hasAdminRights(found)) return error(400, 'ผู้อนุมัติต้องเป็นผู้ดูแลระบบ');
      approver = found.name;
    }
    return voidSale(sale, (reason ?? '').trim(), approver, db);
  }
  const invoicesOfSale = () => db.taxInvoices.filter((t) => t.saleId === sale.id);
  if (action === 'tax-invoice' && req.method === 'GET') {
    // The valid one (else the latest); null instead of 404: "none yet" is a normal answer.
    return ok(currentInvoice(invoicesOfSale()));
  }
  if (action === 'tax-invoices' && req.method === 'GET') {
    return ok(invoicesOfSale()); // oldest first: cancelled ones, then the valid one
  }
  if (action === 'tax-invoice/reissue' && req.method === 'POST') {
    const { buyer, reason } = req.body as { buyer: TaxInvoiceBuyer; reason: string };
    const current = currentInvoice(invoicesOfSale());
    const normalized = normalizeBuyer(buyer ?? ({} as TaxInvoiceBuyer));
    const problem = reissueError(sale, current, normalized, reason ?? '');
    if (problem || !current) return error(400, problem ?? 'ไม่พบใบกำกับภาษี');
    const replacement = createTaxInvoice(db, sale, normalized, current.atSale, current);
    Object.assign(current, {
      cancelledAt: replacement.issuedAt,
      cancelReason: reason.trim(),
      replacedByNo: replacement.invoiceNo,
    });
    return ok(replacement);
  }
  if (action === 'tax-invoice' && req.method === 'POST') {
    const { buyer } = req.body as { buyer: TaxInvoiceBuyer };
    return issueTaxInvoice(sale, normalizeBuyer(buyer ?? ({} as TaxInvoiceBuyer)), db);
  }
  if (action === 'credit-notes' && req.method === 'GET') {
    return ok(db.creditNotes.filter((n) => n.saleId === sale.id));
  }
  if (action === 'credit-notes' && req.method === 'POST') {
    return createCreditNote(sale, req.body as CreditNotePayload, db);
  }
  if (action === 'exchanges' && req.method === 'GET') {
    return ok(db.exchanges.filter((x) => x.saleId === sale.id)); // oldest first
  }
  if (action === 'exchanges' && req.method === 'POST') {
    return createExchange(sale, req.body as ExchangePayload, db);
  }
  if (action === 'status' && req.method === 'PUT') {
    if (sale.lines.length) return error(400, 'บิลขายหน้าร้านเปลี่ยนสถานะไม่ได้ (ใช้การยกเลิกบิล)');
    const { status } = req.body as { status: SaleStatus };
    sales[index] = { ...sale, status };
    return ok(sales[index]);
  }
  return notFound(req, path);
}

/** `priceCart()` of a POS payload with the stored products (real costs) of the request's branch, today. */
function serverPricedCart(body: SalePayload, db: MockDb): PricedCart {
  return priceCart(
    body.items ?? [],
    {
      products: db.products,
      promotions: db.promotions,
      categories: db.categories,
      date: todayIso(),
      vatRegistered: db.storeInfo.vatRegistered,
      branchId: requestBranchId(),
    },
    body.freeSerials ?? [],
    body.billManualDiscount ?? null,
  );
}

/**
 * POS checkout. Everything is validated before anything changes: the cart is re-priced with
 * `priceCart()` (a different total than the screen showed → 400), serials must be in stock and
 * payments must pass `paymentError()`. Then stock is issued line by line with COGS
 * (serial: the unit's own cost, others: the current average, services: the standard cost).
 */
function checkout(body: SalePayload, db: MockDb): Observable<HttpResponse<unknown>> {
  // The receipt needs this device's POS ID, so only a registered terminal sells (T2).
  const terminalProblem = terminalError(
    terminalId,
    db.posTerminals,
    requestBranchId(),
    db.branches,
  );
  if (terminalProblem) return error(400, terminalProblem);
  const shift = moneyShift(db, 'sell');
  if (shift.problem) return error(400, shift.problem);
  const today = todayIso();
  const cart = serverPricedCart(body, db);
  const cartProblem = cartError(cart);
  if (cartProblem) return error(400, cartProblem);
  const manualReason = (body.manualDiscountReason ?? '').trim();
  const manualProblem = manualDiscountError(cart, {
    reason: manualReason,
    isAdmin: actorIsAdmin(),
    maxPercent: db.storeInfo.manualDiscountMaxPercent,
  });
  if (manualProblem) return error(400, manualProblem);
  for (const line of cart.lines) {
    if (!line.serial) continue;
    const problem = serialHereProblem(db, line.serial, line.productId, line.sku, 'ขาย');
    if (problem) return error(400, problem);
  }
  if (round2(body.expectedTotal) !== cart.total) {
    return error(400, 'ราคาหรือโปรโมชั่นมีการเปลี่ยนแปลง กรุณาตรวจสอบบิลอีกครั้ง');
  }
  const payments = body.payments ?? [];
  const paymentProblem = paymentError(cart.total, payments, db.paymentMethods);
  if (paymentProblem) return error(400, paymentProblem);
  const paid = paymentSummary(cart.total, payments, db.paymentMethods);
  const buyer = body.buyer ? normalizeBuyer(body.buyer) : null;
  const buyerProblem = buyer ? checkoutBuyerError(buyer, db.storeInfo) : null;
  if (buyerProblem) return error(400, buyerProblem);

  const now = new Date();
  const here = terminalSnapshot(db);
  const orderNo = nextOrderNo(db, today, here.terminalId!);
  const lines: SaleLine[] = cart.lines.map((priced) => {
    const line: Omit<SaleLine, 'cogs'> & { cartIndex?: number | null } = { ...priced };
    delete line.cartIndex;
    return {
      ...line,
      cogs: issueStock(db, line, now, `${line.freeOfPromotionId ? 'ของแถม' : 'ขาย'} ${orderNo}`),
    };
  });
  const sale: Sale = {
    id: Math.max(0, ...db.sales.map((s) => s.id)) + 1,
    orderNo,
    date: now.toISOString(),
    cashier: actorName(),
    customer: (body.customer ?? '').trim(),
    lines,
    payments: paid.payments,
    subtotal: cart.subtotal,
    itemDiscount: cart.itemDiscount,
    billDiscount: cart.billDiscount,
    total: cart.total,
    vat: cart.vat,
    rounding: paid.rounding,
    change: paid.change,
    billPromotionIds: cart.billPromotionIds,
    itemCount: cart.itemCount,
    status: 'paid',
    voidedAt: null,
    voidReason: '',
    taxInvoiceNo: null,
    returnStatus: 'none',
    creditedTotal: 0,
    creditNoteNos: [],
    exchangeNos: [],
    manualDiscount: cart.manualDiscount,
    manualDiscountReason: cart.manualDiscount > 0 ? manualReason : '',
    manualDiscountBy: cart.manualDiscount > 0 ? actorName() : '',
    shiftId: shift.shiftId,
    voidShiftId: null,
    branchId: stockBranch,
    ...here,
    vatRegistered: db.storeInfo.vatRegistered,
  };
  db.sales.push(sale);
  // Full tax invoice requested at the POS: issued with the sale, same date.
  if (buyer) createTaxInvoice(db, sale, buyer, true);
  return ok(sale);
}

/** 'POS<terminal>-YYYYMMDD-NNNN', numbered continuously per terminal and day (T4). */
function nextOrderNo(db: MockDb, today: string, terminal: number): string {
  const prefix = terminalOrderPrefix(branchCode(db, stockBranch), terminal, today);
  return nextNumber(
    db.sales.map((s) => s.orderNo),
    prefix,
    4,
  );
}

/**
 * Once (E20): documents from before step 3 all went to the first branch, but a bill / credit note /
 * exchange / shift made at a terminal belongs to that terminal's branch; tax invoices follow their
 * bill. Stock movements are left alone (that stock was taken from the single store-wide stock).
 */
function fixDocumentBranches(db: MockDb): boolean {
  if (db.docBranchFixed) return false;
  const first = db.branches[0].id;
  const terminalBranch = (t: number | null | undefined) =>
    db.posTerminals.find((x) => x.id === t)?.branchId;
  for (const list of [db.sales, db.creditNotes, db.exchanges, db.shifts]) {
    for (const doc of list as { terminalId?: number | null; branchId?: number | null }[]) {
      doc.branchId = terminalBranch(doc.terminalId) ?? doc.branchId ?? first;
    }
  }
  for (const invoice of db.taxInvoices) {
    invoice.branchId = db.sales.find((s) => s.id === invoice.saleId)?.branchId ?? first;
  }
  db.docBranchFixed = true;
  return true;
}

/**
 * Branch filter of a list (E23): `?branchId=<id>|all`, missing = the request's branch; a list of one
 * shift's documents takes that shift's branch. A string = why it is refused (400 / 403).
 */
function listScope(
  req: HttpRequest<unknown>,
  db: MockDb,
): ((doc: { branchId?: number | null }) => boolean) | { status: number; message: string } {
  const shiftId = Number(req.params.get('shiftId')) || null;
  const shiftBranch = shiftId ? db.shifts.find((s) => s.id === shiftId)?.branchId : undefined;
  const scope = shiftBranch
    ? shiftBranch
    : parseBranchScope(req.params.get('branchId'), stockBranch);
  if (scope === null) return { status: 400, message: 'รหัสสาขาไม่ถูกต้อง' };
  const refused = actor ? branchScopeError(scope, actor, db.branches) : 'ไม่มีสิทธิ์';
  if (refused) return { status: 403, message: refused };
  const first = db.branches[0].id;
  return scope === 'all' ? () => true : (doc) => (doc.branchId ?? first) === scope;
}

/** The request's branch for the D3 rules (void / credit note / exchange only where sold, E12). */
function branchHere(db: MockDb): BranchHere {
  return { branchId: stockBranch, branches: db.branches };
}

/** Code of a branch for messages ('สาขา HQ'); an unknown id shows as its number. */
function branchCode(db: MockDb, branchId: number): string {
  return db.branches.find((b) => b.id === branchId)?.code ?? String(branchId);
}

/**
 * Why `serial` cannot leave this branch's stock as a unit of `productId` (null = it can): it must be
 * in stock here — one in another branch is sold / handed out only there (E16).
 */
function serialHereProblem(
  db: MockDb,
  serial: string,
  productId: number,
  sku: string,
  what: string,
): string | null {
  const unit = db.serials.find((s) => s.serial === serial);
  if (unit?.productId !== productId || unit.status !== 'in_stock') {
    return `ซีเรียล ${serial} ไม่อยู่ในคลังของ ${sku}`;
  }
  return unit.branchId === stockBranch
    ? null
    : `ซีเรียล ${serial} อยู่ที่สาขา ${branchCode(db, unit.branchId)} — ${what}ที่สาขานี้ไม่ได้`;
}

/** Takes one sale line out of stock (stock card + serial status); returns its COGS. */
function issueStock(db: MockDb, line: Omit<SaleLine, 'cogs'>, now: Date, note: string): number {
  const index = db.products.findIndex((p) => p.id === line.productId);
  const product = db.products[index];
  const baseQty = line.qty * line.factor;
  if (isService(product)) return round2(product.cost * baseQty);
  if (line.serial) {
    const unit = db.serials.find((s) => s.serial === line.serial)!;
    Object.assign(unit, { status: 'sold', removedAt: now.toISOString(), note });
    db.products[index] = withSerialStock(product, db);
    recordMovement(db, db.products[index], 'issue', -1, unit.cost, -unit.cost, [unit.serial], note);
    return round2(unit.cost);
  }
  const cogs = round2(product.avgCost * baseQty);
  db.products[index] = { ...product, stock: product.stock - baseQty };
  recordMovement(db, db.products[index], 'issue', -baseQty, product.avgCost, -cogs, [], note);
  return cogs;
}

/** GET /credit-notes?from&to (local day of the credit note, newest first) */
function listCreditNotes(req: HttpRequest<unknown>, db: MockDb): Observable<HttpResponse<unknown>> {
  const from = req.params.get('from') || null;
  const to = req.params.get('to') || null;
  const day = (n: CreditNote) => saleDay(n);
  // Optional shift: the notes whose refund was paid from it.
  const shiftId = Number(req.params.get('shiftId')) || null;
  const inScope = listScope(req, db);
  if (typeof inScope !== 'function') return error(inScope.status, inScope.message);
  return ok(
    db.creditNotes
      .filter(inScope)
      .filter((n) => (!from || day(n) >= from) && (!to || day(n) <= to))
      .filter((n) => !shiftId || n.shiftId === shiftId)
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
}

/**
 * POST /sales/:id/credit-notes: validated by `creditNoteError()` before anything changes, then
 * returned goods go back into stock at their sale cost (serials back in stock) or are written
 * off (serials → damaged); services never move stock.
 */
function createCreditNote(
  sale: Sale,
  body: CreditNotePayload,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const today = todayIso();
  const notes = db.creditNotes.filter((n) => n.saleId === sale.id);
  const payload: CreditNotePayload = {
    lines: body.lines ?? [],
    refunds: body.refunds ?? [],
    reason: (body.reason ?? '').trim(),
    expectedTotal: body.expectedTotal,
  };
  const exchanges = db.exchanges.filter((x) => x.saleId === sale.id);
  const problem = creditNoteError(sale, notes, payload, {
    here: branchHere(db),
    promotions: db.promotions,
    methods: db.paymentMethods,
    today,
    exchanges,
  });
  if (problem) return error(400, problem);
  // The refund is paid from the drawer / methods of the shift it is issued in.
  const shift = moneyShift(db, 'refund');
  if (shift.problem) return error(400, shift.problem);
  const draft = draftCreditNote(sale, notes, payload.lines, db.promotions, exchanges);
  for (const line of draft.lines) {
    if (!db.products.some((p) => p.id === line.productId)) {
      return error(400, `ไม่พบ SKU ${line.sku} รับคืนไม่ได้`);
    }
    const unit = line.serial ? db.serials.find((s) => s.serial === line.serial) : undefined;
    if (line.serial && (unit?.productId !== line.productId || unit.status !== 'sold')) {
      return error(400, `ซีเรียล ${line.serial} ไม่อยู่ในสถานะขายแล้ว รับคืนไม่ได้`);
    }
  }

  const now = new Date();
  const cnNo = nextNumber(
    db.creditNotes.map((n) => n.cnNo),
    branchDocPrefix('CN', branchCode(db, stockBranch), today),
    4,
  );
  const note = `ลดหนี้ ${cnNo} (บิล ${sale.orderNo})`;

  for (const line of draft.lines) {
    const index = db.products.findIndex((p) => p.id === line.productId);
    const product = db.products[index];
    if (isService(product)) continue;
    const unit = line.serial ? db.serials.find((s) => s.serial === line.serial) : undefined;
    if (unit) {
      Object.assign(
        unit,
        // Back into (or written off at) the branch of the credit note (E16).
        line.restock
          ? {
              branchId: stockBranch,
              status: 'in_stock',
              removedAt: null,
              receivedAt: now.toISOString(),
              note,
            }
          : {
              branchId: stockBranch,
              status: 'damaged',
              removedAt: now.toISOString(),
              note: `${note} · ไม่รับเข้าคลัง`,
            },
      );
      if (line.restock) {
        db.products[index] = withSerialStock(product, db);
        recordMovement(
          db,
          db.products[index],
          'receive',
          1,
          unit.cost,
          unit.cost,
          [unit.serial],
          note,
        );
      }
      continue;
    }
    if (!line.restock) continue;
    const baseQty = line.qty * line.factor;
    const unitCost = line.cogs / baseQty;
    db.products[index] = {
      ...product,
      stock: product.stock + baseQty,
      avgCost: movingAverage(product.stock, product.avgCost, baseQty, unitCost),
    };
    recordMovement(db, db.products[index], 'receive', baseQty, unitCost, line.cogs, [], note);
  }

  const created: CreditNote = {
    id: Math.max(0, ...db.creditNotes.map((n) => n.id)) + 1,
    cnNo,
    saleId: sale.id,
    orderNo: sale.orderNo,
    taxInvoiceNo: sale.taxInvoiceNo,
    buyer: db.taxInvoices.find((t) => t.invoiceNo === sale.taxInvoiceNo)?.buyer ?? null,
    saleDate: sale.date,
    date: now.toISOString(),
    cashier: actorName(),
    reason: payload.reason,
    lines: draft.lines,
    deductions: draft.deductions,
    subtotal: draft.subtotal,
    deduction: draft.deduction,
    total: draft.total,
    vat: draft.vat,
    refunds: toRefunds(payload.refunds, db.paymentMethods),
    shiftId: shift.shiftId,
    branchId: stockBranch,
    ...terminalSnapshot(db),
    ...(soldWithVat(sale) ? {} : { vatRegistered: false }),
  };
  db.creditNotes.push(created);
  return ok(created);
}

/**
 * POST /sales/:id/exchanges: same-SKU swap, validated by `exchangeError()` (replacements must be
 * in stock before the exchange) and the serial stock before anything changes. The new unit is
 * issued first, like a sale (serial: its own cost; others: the current average); then the old one
 * goes back into stock (serial: its own cost; others: the line's sale COGS share) or is written
 * off (serial → damaged). No money, the bill is unchanged.
 */
function createExchange(
  sale: Sale,
  body: ExchangePayload,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const today = todayIso();
  const exchanges = db.exchanges.filter((x) => x.saleId === sale.id);
  const payload: ExchangePayload = {
    lines: (body.lines ?? [])
      .filter((l) => l.qty > 0)
      .map((l) => ({ ...l, newSerial: l.newSerial?.trim() || null })),
    reason: (body.reason ?? '').trim(),
  };
  const problem = exchangeError(sale, payload, {
    here: branchHere(db),
    creditNotes: db.creditNotes.filter((n) => n.saleId === sale.id),
    exchanges,
    store: db.storeInfo,
    isAdmin: actorIsAdmin(),
    today,
    products: db.products,
  });
  if (problem) return error(400, problem);
  for (const input of payload.lines) {
    const line = sale.lines[input.saleLineIndex];
    if (!db.products.some((p) => p.id === line.productId)) {
      return error(400, `ไม่พบ SKU ${line.sku} เปลี่ยนไม่ได้`);
    }
    if (!line.serial) continue;
    const old = currentSerial(sale, input.saleLineIndex, exchanges)!;
    const oldUnit = db.serials.find((s) => s.serial === old);
    if (oldUnit?.productId !== line.productId || oldUnit.status !== 'sold') {
      return error(400, `ซีเรียล ${old} ไม่อยู่ในสถานะขายแล้ว เปลี่ยนไม่ได้`);
    }
    const newProblem = serialHereProblem(
      db,
      input.newSerial ?? '',
      line.productId,
      line.sku,
      'เปลี่ยนให้ลูกค้า',
    );
    if (newProblem) return error(400, newProblem);
  }

  const now = new Date();
  const exNo = nextNumber(
    db.exchanges.map((x) => x.exNo),
    branchDocPrefix('EX', branchCode(db, stockBranch), today),
    4,
  );
  const note = `เปลี่ยนสินค้า ${exNo} (บิล ${sale.orderNo})`;

  const lines: ExchangeLine[] = payload.lines.map((input) => {
    const line = sale.lines[input.saleLineIndex];
    const index = db.products.findIndex((p) => p.id === line.productId);
    const baseQty = input.qty * line.factor;
    const oldSerial = line.serial ? currentSerial(sale, input.saleLineIndex, exchanges) : null;
    // The replacement comes off the shelf first (checked to be in stock), at the current
    // average; only then does the old unit come back, so it can never be handed straight out.
    const costOut = issueStock(db, { ...line, qty: input.qty, serial: input.newSerial }, now, note);
    let costIn: number;
    if (oldSerial) {
      const unit = db.serials.find((s) => s.serial === oldSerial)!;
      costIn = round2(unit.cost);
      Object.assign(
        unit,
        input.restock
          ? {
              branchId: stockBranch,
              status: 'in_stock',
              removedAt: null,
              receivedAt: now.toISOString(),
              note,
            }
          : {
              branchId: stockBranch,
              status: 'damaged',
              removedAt: now.toISOString(),
              note: `${note} · ชำรุด`,
            },
      );
      if (input.restock) {
        db.products[index] = withSerialStock(db.products[index], db);
        recordMovement(
          db,
          db.products[index],
          'receive',
          1,
          unit.cost,
          unit.cost,
          [oldSerial],
          note,
        );
      }
    } else {
      const unitCost = line.cogs / (line.qty * line.factor);
      costIn = round2(unitCost * baseQty);
      if (input.restock) {
        const product = db.products[index];
        db.products[index] = {
          ...product,
          stock: product.stock + baseQty,
          avgCost: movingAverage(product.stock, product.avgCost, baseQty, unitCost),
        };
        recordMovement(db, db.products[index], 'receive', baseQty, unitCost, costIn, [], note);
      }
    }
    return {
      saleLineIndex: input.saleLineIndex,
      productId: line.productId,
      sku: line.sku,
      name: line.name,
      shortName: line.shortName,
      unit: line.unit,
      factor: line.factor,
      qty: input.qty,
      oldSerial,
      newSerial: line.serial ? input.newSerial : null,
      restock: input.restock,
      costIn,
      costOut,
    };
  });

  const created: Exchange = {
    id: Math.max(0, ...db.exchanges.map((x) => x.id)) + 1,
    exNo,
    saleId: sale.id,
    orderNo: sale.orderNo,
    saleDate: sale.date,
    date: now.toISOString(),
    cashier: actorName(),
    reason: payload.reason,
    lines,
    // No money moves, so no shift is required; an open one counts it in its report.
    shiftId: db.storeInfo.requireShift ? (openShiftOf(db, terminalId)?.id ?? null) : null,
    branchId: stockBranch,
    ...terminalSnapshot(db),
  };
  db.exchanges.push(created);
  return ok(created);
}

/** POST /sales/:id/tax-invoice { buyer } — one full tax invoice per paid POS bill. */
function issueTaxInvoice(
  sale: Sale,
  buyer: TaxInvoiceBuyer,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const problem = taxInvoiceError(sale, buyer, db.storeInfo);
  if (problem) return error(400, problem);
  return ok(createTaxInvoice(db, sale, buyer, false));
}

/** Numbers and stores a full tax invoice for a bill (checked by the caller). */
function createTaxInvoice(
  db: MockDb,
  sale: Sale,
  buyer: TaxInvoiceBuyer,
  atSale: boolean,
  /** The cancelled invoice this one replaces */
  replaces?: TaxInvoice,
): TaxInvoice {
  // Dated and numbered on the day of sale, even when issued later (accountant's decision).
  const date = new Date(sale.date);
  // The bill's branch numbers it, even when issued at another one later (E21, E25).
  const branchId = sale.branchId ?? stockBranch;
  const invoiceNo = nextNumber(
    db.taxInvoices.map((t) => t.invoiceNo),
    branchDocPrefix('INV', branchCode(db, branchId), toIsoDate(date)),
    4,
  );
  const invoice: TaxInvoice = {
    id: Math.max(0, ...db.taxInvoices.map((t) => t.id)) + 1,
    invoiceNo,
    saleId: sale.id,
    orderNo: sale.orderNo,
    saleDate: sale.date,
    date: sale.date,
    issuedAt: atSale && !replaces ? sale.date : new Date().toISOString(),
    buyer,
    issuedBy: actorName(),
    cancelledAt: null,
    cancelReason: '',
    replacesInvoiceNo: replaces?.invoiceNo ?? null,
    replacedByNo: null,
    atSale,
    // The bill's branch is the seller's business place (E25).
    branchId,
  };
  db.taxInvoices.push(invoice);
  sale.taxInvoiceNo = invoice.invoiceNo;
  return invoice;
}

/**
 * Cancels a paid sale of today (`voidError()`) and puts its goods back at their sale-time cost (serials back in stock,
 * non-serial re-averaged). Orders from before the POS have no lines and just change status.
 */
function voidSale(
  sale: Sale,
  reason: string,
  approvedBy: string | null,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const problem = voidError(sale, reason, todayIso(), branchHere(db));
  if (problem) return error(400, problem);
  // The money goes back out of the drawer of the shift the void is made in.
  const shift = moneyShift(db, 'void');
  if (shift.problem) return error(400, shift.problem);
  // A same-day exchange swapped serials: the customer hands back the one they hold now.
  const exchanges = db.exchanges.filter((x) => x.saleId === sale.id);
  const serialOf = (i: number) => currentSerial(sale, i, exchanges);
  for (const [i, line] of sale.lines.entries()) {
    const product = db.products.find((p) => p.id === line.productId);
    if (!product) return error(400, `ไม่พบ SKU ${line.sku} คืนสต็อกไม่ได้`);
    const serial = serialOf(i);
    const unit = serial ? db.serials.find((s) => s.serial === serial) : undefined;
    if (serial && (unit?.productId !== line.productId || unit.status !== 'sold')) {
      return error(400, `ซีเรียล ${serial} ไม่อยู่ในสถานะขายแล้ว คืนสต็อกไม่ได้`);
    }
  }
  const now = new Date().toISOString();
  const note = `ยกเลิกบิล ${sale.orderNo}`;
  for (const [i, line] of sale.lines.entries()) {
    const index = db.products.findIndex((p) => p.id === line.productId);
    const product = db.products[index];
    const baseQty = line.qty * line.factor;
    if (isService(product)) continue;
    const serial = serialOf(i);
    if (serial) {
      const unit = db.serials.find((s) => s.serial === serial)!;
      Object.assign(unit, {
        branchId: stockBranch,
        status: 'in_stock',
        removedAt: null,
        receivedAt: now,
        note,
      });
      db.products[index] = withSerialStock(product, db);
      recordMovement(
        db,
        db.products[index],
        'receive',
        1,
        unit.cost,
        unit.cost,
        [unit.serial],
        note,
      );
      continue;
    }
    const unitCost = line.cogs / baseQty;
    db.products[index] = {
      ...product,
      stock: product.stock + baseQty,
      avgCost: movingAverage(product.stock, product.avgCost, baseQty, unitCost),
    };
    recordMovement(db, db.products[index], 'receive', baseQty, unitCost, line.cogs, [], note);
  }
  Object.assign(sale, {
    status: 'cancelled',
    voidedAt: now,
    voidReason: reason,
    voidShiftId: shift.shiftId,
    voidedBy: actorName(),
    voidApprovedBy: approvedBy,
  });
  // A full tax invoice of a voided bill is cancelled with it.
  const invoice = db.taxInvoices.find((t) => t.saleId === sale.id && !t.cancelledAt);
  if (invoice) Object.assign(invoice, { cancelledAt: now, cancelReason: `ยกเลิกบิล: ${reason}` });
  return ok(sale);
}

/**
 * One-time switch-on of POS shifts: step 2 of the shift plan kept `requireShift` off in the mock
 * until the POS had its shift screens, so a stored `false` without this flag is that temporary
 * value (there was no setting for it yet). Returns true when the db changed.
 */
function enableShifts(db: MockDb): boolean {
  if (db.shiftsEnabled) return false;
  db.companyInfo = { ...db.companyInfo, requireShift: true };
  db.shiftsEnabled = true;
  return true;
}

/** The open shift of a terminal (at most one). */
function openShiftOf(db: MockDb, terminal: number | null): Shift | undefined {
  return db.shifts.find((s) => s.terminalId === terminal && s.status === 'open');
}

/**
 * One-time creation of the POS terminal registry for a db stored before it existed: one terminal
 * per number already used by a shift (at least terminal 1), terminal 1 taking the old store-wide
 * POS ID, which is also kept as `legacyPosId` for older documents. Returns true when the db changed.
 */
function migrateTerminals(db: MockDb, stored: Partial<MockDb> | null): boolean {
  if (!stored || stored.posTerminals) return false;
  const legacy = ((stored.storeInfo as { posId?: string } | undefined)?.posId ?? '').trim();
  const ids = [...new Set([1, ...db.shifts.map((s) => s.terminalId)])].sort((a, b) => a - b);
  db.posTerminals = ids.map((id) => ({
    id,
    name: `เครื่อง ${id}`,
    posId: id === 1 ? legacy : '',
    branchId: db.branches[0].id,
    active: true,
  }));
  db.legacyPosId = legacy;
  return true;
}

/**
 * Documents made before the registry have no terminal snapshot: they printed the store-wide POS ID
 * (`legacyPosId`); a bill's terminal is its shift's, else 1 (numbered store-wide back then).
 */
function fillTerminalSnapshots(db: MockDb): void {
  const legacy = db.legacyPosId ?? '';
  const terminalOfShift = (id?: number | null) =>
    db.shifts.find((s) => s.id === id)?.terminalId ?? null;
  db.sales = db.sales.map((s) =>
    s.posId !== undefined || !s.lines.length
      ? s
      : { ...s, terminalId: s.terminalId ?? terminalOfShift(s.shiftId) ?? 1, posId: legacy },
  );
  db.creditNotes = db.creditNotes.map((n) =>
    n.posId !== undefined
      ? n
      : { ...n, terminalId: n.terminalId ?? terminalOfShift(n.shiftId), posId: legacy },
  );
  db.exchanges = db.exchanges.map((x) =>
    x.posId !== undefined
      ? x
      : { ...x, terminalId: x.terminalId ?? terminalOfShift(x.shiftId), posId: legacy },
  );
  db.shifts = db.shifts.map((s) => (s.posId !== undefined ? s : { ...s, posId: legacy }));
}

/** Snapshot of this request's terminal for a document (T3); unknown terminal → no POS ID. */
function terminalSnapshot(db: MockDb): { terminalId: number | null; posId: string } {
  const terminal = db.posTerminals.find((t) => t.id === terminalId);
  return { terminalId, posId: terminal?.posId ?? '' };
}

/** GET/POST /pos-terminals, PUT/DELETE /pos-terminals/:id (writes: admins only). */
function handlePosTerminals(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  if (path === 'pos-terminals' && req.method === 'GET') {
    return ok([...db.posTerminals].sort((a, b) => a.id - b.id));
  }
  if (!actorIsAdmin()) return error(403, 'แก้ทะเบียนเครื่อง POS ได้เฉพาะผู้ดูแลระบบ');
  // A branch admin edits only terminals of their own branches (E6), in and out of a branch.
  const notMine = (branchId: number) => {
    const branch = db.branches.find((b) => b.id === branchId);
    return !isCompanyAdmin(actor) && !!branch && !canWorkIn(actor as User, branch);
  };
  const BRANCH_ONLY = 'แก้เครื่อง POS ได้เฉพาะสาขาของตัวเอง';
  const normalize = (body: unknown, id?: number): PosTerminal =>
    normalizePosTerminal({
      ...POS_TERMINAL_DEFAULTS,
      ...(body as Partial<PosTerminal>),
      ...(id ? { id } : {}),
    });
  if (path === 'pos-terminals' && req.method === 'POST') {
    const created = normalize(req.body);
    if (notMine(created.branchId)) return error(403, BRANCH_ONLY);
    const problem = posTerminalError(created, db.posTerminals, db.branches);
    if (problem) return error(400, problem);
    const limit = limitError(db, 'terminals', created.active);
    if (limit) return error(403, limit);
    db.posTerminals.push(created);
    return ok(created);
  }
  const match = /^pos-terminals\/(\d+)$/.exec(path);
  if (!match) return notFound(req, path);
  const id = Number(match[1]);
  const index = db.posTerminals.findIndex((t) => t.id === id);
  if (index < 0) return error(404, 'ไม่พบเครื่อง POS');
  switch (req.method) {
    case 'PUT': {
      // The terminal number never changes (documents and shifts refer to it).
      const updated = normalize({ ...db.posTerminals[index], ...(req.body as object) }, id);
      if (notMine(db.posTerminals[index].branchId) || notMine(updated.branchId)) {
        return error(403, BRANCH_ONLY);
      }
      const problem = posTerminalError(
        updated,
        db.posTerminals.filter((t) => t.id !== id),
        db.branches,
      );
      if (problem) return error(400, problem);
      if (!updated.active && openShiftOf(db, id)) {
        return error(400, `เครื่อง ${id} มีกะที่เปิดอยู่ ปิดใช้งานไม่ได้`);
      }
      const limit = limitError(db, 'terminals', updated.active, db.posTerminals[index].active);
      if (limit) return error(403, limit);
      db.posTerminals[index] = updated;
      return ok(updated);
    }
    case 'DELETE': {
      if (notMine(db.posTerminals[index].branchId)) return error(403, BRANCH_ONLY);
      const used =
        db.shifts.some((s) => s.terminalId === id) ||
        db.sales.some((s) => s.terminalId === id) ||
        db.creditNotes.some((n) => n.terminalId === id) ||
        db.exchanges.some((x) => x.terminalId === id);
      if (used) return error(400, `เครื่อง ${id} มีกะหรือเอกสารแล้ว ลบไม่ได้ (ปิดใช้งานแทน)`);
      db.posTerminals.splice(index, 1);
      return ok(null);
    }
  }
  return notFound(req, path);
}

/** A shift as read: + Σ of its adjustments after closing (S8), derived on every read. */
function withAdjustmentTotal(db: MockDb, shift: Shift): Shift {
  const own = db.shiftAdjustments.filter((a) => a.shiftId === shift.id);
  return own.length
    ? { ...shift, adjustmentTotal: round2(own.reduce((sum, a) => sum + a.amount, 0)) }
    : shift;
}

const shiftContext = (db: MockDb): ShiftContext => ({
  sales: db.sales,
  creditNotes: db.creditNotes,
  movements: db.cashMovements,
  methods: db.paymentMethods,
  exchanges: db.exchanges,
  drawerOpens: db.drawerOpens,
});

/**
 * Shift check of a money action at this request's terminal (`shiftBlocker()`): the shift to record
 * it in, or null when shifts are off (`StoreInfo.requireShift`).
 */
function moneyShift(
  db: MockDb,
  action: ShiftAction,
): { problem: string | null; shiftId: number | null } {
  if (!db.storeInfo.requireShift) return { problem: null, shiftId: null };
  const shift = openShiftOf(db, terminalId) ?? null;
  const problem = shiftBlocker(action, {
    requireShift: true,
    shift,
    user: actorName(),
    isAdmin: actorIsAdmin(),
  });
  return { problem, shiftId: shift?.id ?? null };
}

/**
 * /transfers (SaaS step 5, E26–E29): list / read / create at the source / receive at the
 * destination / cancel at the source. Every write moves stock of the request's branch only.
 */
function handleTransfers(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const visible = (t: Transfer) =>
    !!actor &&
    (branchScopeError(t.fromBranchId, actor, db.branches) === null ||
      branchScopeError(t.toBranchId, actor, db.branches) === null);
  if (path === 'transfers' && req.method === 'GET') {
    const inScope = listScope(req, db);
    if (typeof inScope !== 'function') return error(inScope.status, inScope.message);
    const direction = req.params.get('direction');
    const out = (t: Transfer) => inScope({ branchId: t.fromBranchId });
    const into = (t: Transfer) => inScope({ branchId: t.toBranchId });
    return ok(
      db.transfers
        .filter((t) =>
          direction === 'out' ? out(t) : direction === 'in' ? into(t) : out(t) || into(t),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }
  if (path === 'transfers' && req.method === 'POST') return createTransfer(req, db);

  const match = /^transfers\/(\d+)(?:\/(receive|cancel))?$/.exec(path);
  const transfer = match ? db.transfers.find((t) => t.id === Number(match[1])) : undefined;
  if (!match || !transfer) return error(404, 'ไม่พบใบโอน');
  if (!visible(transfer)) return error(403, 'ไม่มีสิทธิ์ดูใบโอนของสาขานี้');
  const action = match[2];
  if (!action && req.method === 'GET') return ok(transfer);
  if (action === 'receive' && req.method === 'POST') {
    return receiveTransfer(transfer, req.body as TransferReceivePayload, db);
  }
  if (action === 'cancel' && req.method === 'POST') {
    if (!actorIsAdmin()) return error(403, 'ยกเลิกใบโอนได้เฉพาะผู้ดูแลระบบ');
    const reason = String((req.body as { reason?: string } | null)?.reason ?? '').trim();
    const problem = cancelTransferError(transfer, stockBranch, true, reason);
    if (problem) return error(400, problem);
    const note = `ยกเลิกใบโอน ${transfer.transferNo}`;
    for (const line of transfer.lines) moveTransferLine(db, line, note);
    Object.assign(transfer, {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelledBy: actorName(),
      cancelReason: reason,
    });
    return ok(transfer);
  }
  return notFound(req, path);
}

/** POST /transfers at the source: goods leave at its cost, serials go `in_transit` (E26). */
function createTransfer(req: HttpRequest<unknown>, db: MockDb): Observable<HttpResponse<unknown>> {
  const body = (req.body ?? {}) as Partial<TransferPayload>;
  const payload: TransferPayload = {
    toBranchId: Number(body.toBranchId),
    lines: (body.lines ?? []).map((l) => ({
      productId: Number(l.productId),
      qty: Number(l.qty),
      serials: (l.serials ?? []).map((x) => x.trim().toUpperCase()),
    })),
    note: (body.note ?? '').trim(),
  };
  const problem = transferError(payload, {
    fromBranchId: stockBranch,
    branches: db.branches,
    products: db.products,
    serials: db.serials,
  });
  if (problem) return error(400, problem);
  const now = new Date();
  const transferNo = nextNumber(
    db.transfers.map((t) => t.transferNo),
    branchDocPrefix('TR', branchCode(db, stockBranch), todayIso()),
    4,
  );
  const note = `โอนไปสาขา ${branchCode(db, payload.toBranchId)} ${transferNo}`;
  const lines: TransferLine[] = payload.lines.map((input) => {
    const index = db.products.findIndex((p) => p.id === input.productId);
    const product = db.products[index];
    let unitCost: number;
    if (product.serialControl) {
      const units = input.serials.map((x) => db.serials.find((s) => s.serial === x)!);
      for (const unit of units) {
        Object.assign(unit, { status: 'in_transit', removedAt: now.toISOString(), note });
      }
      const total = units.reduce((sum, u) => sum + u.cost, 0);
      unitCost = total / units.length;
      db.products[index] = withSerialStock(product, db);
      recordMovement(
        db,
        db.products[index],
        'transfer_out',
        -units.length,
        unitCost,
        -total,
        input.serials,
        note,
      );
    } else {
      // Out at the current average, which stays unchanged (like any issue).
      unitCost = product.avgCost;
      db.products[index] = { ...product, stock: product.stock - input.qty };
      recordMovement(
        db,
        db.products[index],
        'transfer_out',
        -input.qty,
        unitCost,
        -input.qty * unitCost,
        [],
        note,
      );
    }
    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      qty: input.qty,
      serials: input.serials,
      unitCost: Math.round(unitCost * 10000) / 10000,
      receivedQty: null,
      receivedSerials: [],
    };
  });
  const transfer: Transfer = {
    id: Math.max(0, ...db.transfers.map((t) => t.id)) + 1,
    transferNo,
    fromBranchId: stockBranch,
    toBranchId: payload.toBranchId,
    status: 'in_transit',
    createdAt: now.toISOString(),
    createdBy: actorName(),
    note: payload.note,
    lines,
    receivedAt: null,
    receivedBy: null,
    shortReason: '',
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: '',
  };
  db.transfers.push(transfer);
  return ok(transfer);
}

/**
 * POST /transfers/:id/receive at the destination (E27 / E28): everything sent comes in at the
 * transfer cost, then what did not arrive is written off there (serials → damaged).
 */
function receiveTransfer(
  transfer: Transfer,
  body: TransferReceivePayload,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const payload: TransferReceivePayload = {
    lines: (body?.lines ?? []).map((l) => ({
      productId: Number(l.productId),
      receivedQty: Number(l.receivedQty),
      receivedSerials: l.receivedSerials ?? [],
    })),
    shortReason: (body?.shortReason ?? '').trim(),
  };
  const problem = receiveTransferError(transfer, payload, stockBranch);
  if (problem) return error(400, problem);
  const now = new Date().toISOString();
  const note = `รับโอนจากสาขา ${branchCode(db, transfer.fromBranchId)} ${transfer.transferNo}`;
  const shortNote = `ขาด/เสียหายจากการโอน ${transfer.transferNo} · ${payload.shortReason}`;
  for (const line of transfer.lines) {
    const got = payload.lines.find((l) => l.productId === line.productId)!;
    moveTransferLine(db, line, note);
    const index = db.products.findIndex((p) => p.id === line.productId);
    const missing = line.qty - got.receivedQty;
    if (line.serials.length) {
      const lost = line.serials.filter((x) => !got.receivedSerials.includes(x));
      if (lost.length) {
        const units = lost.map((x) => db.serials.find((s) => s.serial === x)!);
        for (const unit of units) {
          Object.assign(unit, { status: 'damaged', removedAt: now, note: shortNote });
        }
        const total = units.reduce((sum, u) => sum + u.cost, 0);
        db.products[index] = withSerialStock(db.products[index], db);
        recordMovement(
          db,
          db.products[index],
          'issue',
          -lost.length,
          total / lost.length,
          -total,
          lost,
          shortNote,
        );
      }
    } else if (missing > 0) {
      const product = db.products[index];
      db.products[index] = { ...product, stock: product.stock - missing };
      recordMovement(
        db,
        db.products[index],
        'issue',
        -missing,
        product.avgCost,
        -missing * product.avgCost,
        [],
        shortNote,
      );
    }
    Object.assign(line, {
      receivedQty: got.receivedQty,
      receivedSerials: line.serials.length ? got.receivedSerials : [],
    });
  }
  Object.assign(transfer, {
    status: 'received',
    receivedAt: now,
    receivedBy: actorName(),
    shortReason: payload.shortReason,
  });
  return ok(transfer);
}

/**
 * Brings a transfer line into the request's branch at the transfer cost: `in` at the destination,
 * `back` at the source when cancelled. Serials become in stock there; others re-average.
 */
function moveTransferLine(db: MockDb, line: TransferLine, note: string): void {
  const serials = line.serials;
  const index = db.products.findIndex((p) => p.id === line.productId);
  if (index < 0) return;
  const product = db.products[index];
  if (serials.length) {
    const units = serials.map((x) => db.serials.find((s) => s.serial === x)!);
    for (const unit of units) {
      Object.assign(unit, {
        branchId: stockBranch,
        status: 'in_stock',
        removedAt: null,
        receivedAt: new Date().toISOString(),
        note,
      });
    }
    const total = units.reduce((sum, u) => sum + u.cost, 0);
    db.products[index] = withSerialStock(product, db);
    recordMovement(
      db,
      db.products[index],
      'transfer_in',
      units.length,
      total / units.length,
      total,
      [...serials],
      note,
    );
    return;
  }
  db.products[index] = {
    ...product,
    stock: product.stock + line.qty,
    avgCost: movingAverage(product.stock, product.avgCost, line.qty, line.unitCost),
  };
  recordMovement(
    db,
    db.products[index],
    'transfer_in',
    line.qty,
    line.unitCost,
    line.qty * line.unitCost,
    [],
    note,
  );
}

/** 'SH-<branch>-YYYYMMDD-NN', numbered per branch and opening day (E21). */
function nextShiftNo(db: MockDb, day: string): string {
  return nextNumber(
    db.shifts.map((s) => s.shiftNo),
    branchDocPrefix('SH', branchCode(db, stockBranch), day),
    2,
  );
}

/** `prefix` + the next running number after the highest one already issued with it. */
function nextNumber(issued: readonly string[], prefix: string, width: number): string {
  const last = issued
    .filter((no) => no.startsWith(prefix))
    .reduce((max, no) => Math.max(max, Number(no.slice(prefix.length))), 0);
  return prefix + String(last + 1).padStart(width, '0');
}

/**
 * /shifts (docs/shift-plan.md): open / cash in-out / X-Z summary / close / approve. The terminal
 * comes from the `X-Terminal-Id` header; every rule is a `shift.model.ts` function.
 */
function handleShifts(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  const user = actorName();
  const isAdmin = actorIsAdmin();
  if (path === 'shifts/current' && req.method === 'GET') {
    return ok(openShiftOf(db, terminalId) ?? null);
  }
  if (path === 'shifts/open' && req.method === 'POST') {
    // The drawer is this device's registered terminal; the body may only repeat it (T2).
    const terminalProblem = terminalError(
      terminalId,
      db.posTerminals,
      requestBranchId(),
      db.branches,
    );
    if (terminalProblem) return error(400, terminalProblem);
    const body = (req.body ?? {}) as Partial<ShiftOpenPayload>;
    if (body.terminalId !== undefined && body.terminalId !== terminalId) {
      return error(400, `เลขเครื่องไม่ตรงกับเครื่องนี้ (เครื่อง ${terminalId})`);
    }
    const payload: ShiftOpenPayload = {
      terminalId: terminalId!,
      openingFloat: Number(body.openingFloat),
      openingDenominations: body.openingDenominations ?? [],
    };
    const problem = openShiftError(payload, {
      terminalHasOpenShift: !!openShiftOf(db, payload.terminalId),
      userHasOpenShift: db.shifts.some((s) => s.status === 'open' && s.cashier === user),
    });
    if (problem) return error(400, problem);
    const now = new Date();
    const shift: Shift = {
      id: Math.max(0, ...db.shifts.map((s) => s.id)) + 1,
      shiftNo: nextShiftNo(db, toIsoDate(now)),
      terminalId: payload.terminalId,
      // The terminal stands in the request's branch (`terminalError()`, E8).
      branchId: stockBranch,
      posId: terminalSnapshot(db).posId,
      cashier: user,
      status: 'open',
      openedAt: now.toISOString(),
      openingFloat: payload.openingFloat,
      openingDenominations: payload.openingDenominations,
      closedAt: null,
      closedBy: null,
      counts: [],
      cashDenominations: [],
      depositAmount: 0,
      floatLeft: 0,
      approvalStatus: 'not_needed',
      approvedBy: null,
      approvedAt: null,
      note: '',
    };
    db.shifts.push(shift);
    return ok(shift);
  }
  if ((path === 'shifts' || path === 'shifts/variance-report') && req.method === 'GET') {
    // Local-date range on the opening day of the shift (S5).
    const from = req.params.get('from') || null;
    const to = req.params.get('to') || null;
    const isDate = (d: string | null) => d === null || /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (!isDate(from) || !isDate(to)) return error(400, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD');
    if (from && to && from > to) return error(400, 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
    const inScope = listScope(req, db);
    if (typeof inScope !== 'function') return error(inScope.status, inScope.message);
    // Non-admins see only their own shifts (P6).
    const inRange = db.shifts.filter(
      (s) =>
        inScope(s) &&
        (isAdmin || s.cashier === user) &&
        (!from || shiftDay(s) >= from) &&
        (!to || shiftDay(s) <= to),
    );
    if (path === 'shifts/variance-report') {
      return ok(
        varianceReport(inRange, {
          adjustments: db.shiftAdjustments,
          drawerOpens: db.drawerOpens,
        }),
      );
    }
    const openOnly = req.params.get('openOnly') === '1';
    return ok(
      inRange
        .filter((s) => !openOnly || s.status === 'open')
        .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
        .map((s) => withAdjustmentTotal(db, s)),
    );
  }

  if (path === 'shifts/last-float' && req.method === 'GET') {
    // Float the last closed shift of this terminal left in the drawer (opening a new shift).
    const last = db.shifts
      .filter((s) => s.terminalId === terminalId && s.status === 'closed')
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0];
    return ok({ floatLeft: last?.floatLeft ?? 0 });
  }

  const match =
    /^shifts\/(\d+)(?:\/(movements|cash-movements|summary|count-check|close|approve|drawer-opens|adjustments))?$/.exec(
      path,
    );
  if (!match) return notFound(req, path);
  const shift = db.shifts.find((s) => s.id === Number(match[1]));
  if (!shift) return error(404, 'ไม่พบกะ');
  const action = match[2];
  const now = new Date().toISOString();
  // Someone else's shift: only admins may read it or count / close it (P6).
  const others = shift.cashier !== user && !isAdmin;
  if (others && req.method === 'GET') return error(403, 'ดูได้เฉพาะกะของตัวเอง');
  if (others && (action === 'count-check' || action === 'close')) {
    return error(403, 'ปิดกะได้เฉพาะเจ้าของกะหรือผู้ดูแลระบบ');
  }

  if (!action && req.method === 'GET') return ok(withAdjustmentTotal(db, shift));
  if (action === 'movements' && req.method === 'GET') {
    return ok(db.cashMovements.filter((m) => m.shiftId === shift.id));
  }
  if (action === 'drawer-opens' && req.method === 'GET') {
    return ok(db.drawerOpens.filter((d) => d.shiftId === shift.id));
  }
  if (action === 'drawer-opens' && req.method === 'POST') {
    // Drawer opened without a sale (S7): same who / where rules as a cash movement.
    if (shift.status !== 'open') return error(400, 'กะนี้ปิดไปแล้ว');
    if (shift.terminalId !== terminalId) return error(400, 'กะนี้ไม่ได้เปิดที่เครื่องนี้');
    const payload: DrawerOpenPayload = {
      reason: ((req.body ?? {}) as Partial<DrawerOpenPayload>).reason?.trim() ?? '',
    };
    const problem =
      shiftBlocker('drawer_open', { requireShift: true, shift, user, isAdmin }) ??
      drawerOpenError(payload);
    if (problem) return error(400, problem);
    const opened: DrawerOpen = {
      id: Math.max(0, ...db.drawerOpens.map((d) => d.id)) + 1,
      shiftId: shift.id,
      reason: payload.reason,
      by: user,
      at: now,
    };
    db.drawerOpens.push(opened);
    return ok(opened);
  }
  if (action === 'adjustments' && req.method === 'GET') {
    return ok(db.shiftAdjustments.filter((a) => a.shiftId === shift.id));
  }
  if (action === 'adjustments' && req.method === 'POST') {
    // Recorded separately (S8): the counts, the Z report and the approval never change.
    const body = (req.body ?? {}) as Partial<ShiftAdjustmentPayload>;
    const payload: ShiftAdjustmentPayload = {
      methodId: Number(body.methodId),
      amount: Number(body.amount),
      reasonCode: body.reasonCode as ShiftAdjustmentPayload['reasonCode'],
      reason: (body.reason ?? '').trim(),
    };
    const problem = shiftAdjustmentError(shift, payload, isAdmin);
    if (problem) return error(400, problem);
    const adjustment: ShiftAdjustment = {
      id: Math.max(0, ...db.shiftAdjustments.map((a) => a.id)) + 1,
      shiftId: shift.id,
      ...payload,
      name: shift.counts.find((c) => c.methodId === payload.methodId)?.name ?? '',
      by: user,
      at: now,
    };
    db.shiftAdjustments.push(adjustment);
    return ok(adjustment);
  }
  if (action === 'summary' && req.method === 'GET') {
    // Per-method expected amounts only for admins while the shift is open (blind count, S2).
    const detailed = isAdmin || shift.status === 'closed';
    return ok(shiftSummary(shift, shiftContext(db), { detailed }));
  }
  if (action === 'cash-movements' && req.method === 'POST') {
    if (shift.status !== 'open') return error(400, 'กะนี้ปิดไปแล้ว');
    if (shift.terminalId !== terminalId) return error(400, 'กะนี้ไม่ได้เปิดที่เครื่องนี้');
    const body = (req.body ?? {}) as Partial<CashMovementPayload>;
    const payload: CashMovementPayload = {
      type: body.type as CashMovementPayload['type'],
      amount: Number(body.amount),
      reason: (body.reason ?? '').trim(),
    };
    const problem =
      shiftBlocker('cash_movement', { requireShift: true, shift, user, isAdmin }) ??
      cashMovementError(
        payload,
        drawerExpected(expectedByMethod(shift, shiftContext(db))),
        isAdmin,
      );
    if (problem) return error(400, problem);
    const movement: CashMovement = {
      id: Math.max(0, ...db.cashMovements.map((m) => m.id)) + 1,
      shiftId: shift.id,
      ...payload,
      by: user,
      at: now,
    };
    db.cashMovements.push(movement);
    return ok(movement);
  }
  if (action === 'count-check' && req.method === 'POST') {
    // Reveals expected amounts / variances only after a full blind count (S2); stores nothing.
    if (shift.status !== 'open') return error(400, 'กะนี้ปิดไปแล้ว');
    const counts = ((req.body ?? {}) as { counts?: ShiftCountInput[] }).counts ?? [];
    const expected = expectedByMethod(shift, shiftContext(db));
    const problem = countInputsError(expected, counts);
    if (problem) return error(400, problem);
    return ok(countCheck(expected, counts, db.storeInfo.shiftVarianceLimit));
  }
  if (action === 'close' && req.method === 'POST') {
    const body = (req.body ?? {}) as Partial<ShiftClosePayload>;
    const payload: ShiftClosePayload = {
      counts: body.counts ?? [],
      cashDenominations: body.cashDenominations ?? [],
      depositAmount: Number(body.depositAmount ?? 0),
      note: (body.note ?? '').trim(),
      approval: body.approval ?? null,
    };
    const expected = expectedByMethod(shift, shiftContext(db));
    const problem = closeShiftError(shift, payload, expected, { user, isAdmin });
    if (problem) return error(400, problem);
    // The variance is approved by the admin closing, or by an admin's login typed at the
    // terminal; otherwise a variance above the limit waits as `pending`.
    let approver: string | null = isAdmin ? user : null;
    if (!approver && payload.approval) {
      const found = checkCredentials(payload.approval.username, payload.approval.password, db);
      if (typeof found === 'string') return error(400, 'รหัสผ่านผู้อนุมัติไม่ถูกต้อง');
      if (!hasAdminRights(found)) return error(400, 'ผู้อนุมัติต้องเป็นผู้ดูแลระบบ');
      approver = found.name;
    }
    const counts = buildShiftCounts(expected, payload.counts, user);
    const drawer = expected.find((l) => l.type === 'cash');
    const cash = counts.find((c) => c.methodId === drawer?.methodId)?.counted ?? 0;
    const approval = approvalStatusFor(counts, db.storeInfo.shiftVarianceLimit, approver);
    Object.assign(shift, {
      status: 'closed',
      closedAt: now,
      closedBy: user,
      counts,
      cashDenominations: payload.cashDenominations,
      depositAmount: payload.depositAmount,
      floatLeft: round2(cash - payload.depositAmount),
      approvalStatus: approval,
      approvedBy: approval === 'approved' ? approver : null,
      approvedAt: approval === 'approved' ? now : null,
      note: payload.note,
    } satisfies Partial<Shift>);
    return ok(shift);
  }
  if (action === 'approve' && req.method === 'POST') {
    if (shift.approvalStatus !== 'pending') return error(400, 'กะนี้ไม่ได้รออนุมัติ');
    Object.assign(shift, { approvalStatus: 'approved', approvedBy: user, approvedAt: now });
    return ok(shift);
  }
  return notFound(req, path);
}

/** GET/PUT /settings/menu-access — menus the `user` role sees (PUT: admin only, `menuAccessError()`). */
function handleMenuAccess(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  if (req.method === 'GET') return ok(db.menuAccess);
  if (req.method === 'PUT') {
    const known = MENU.map((m) => m.path);
    const body = (req.body ?? {}) as Partial<MenuAccess>;
    const problem = menuAccessError(body, known);
    if (problem) return error(400, problem);
    // Stored in menu order, whatever order the screen sent.
    db.menuAccess = { userMenus: known.filter((m) => body.userMenus!.includes(m)) };
    return ok(db.menuAccess);
  }
  return notFound(req, path);
}

/** GET/PUT /settings/store (receipt header / footer) */
function handleStoreInfo(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  // Kept during the move to /settings/company + /settings/branch: the request's branch with its
  // company (E11). A write changes both parts, so it needs a company admin.
  if (req.method === 'GET') {
    // A document made at another branch prints that branch's details (E22).
    const asked = req.params.get('branchId');
    if (!asked) return ok(db.storeInfo);
    const branch = db.branches.find((b) => String(b.id) === asked);
    return branch ? ok(storeInfoOf(db.companyInfo, branch)) : error(404, 'ไม่พบสาขา');
  }
  if (req.method === 'PUT') {
    if (!isCompanyAdmin(actor)) return error(403, COMPANY_ADMIN_ONLY);
    const payload = normalizeStoreInfo(req.body as StoreInfo);
    const problem = storeInfoError(payload) ?? requireShiftProblem(db, payload.requireShift);
    if (problem) return error(400, problem);
    db.companyInfo = companyInfoOf(payload);
    const branch = requestBranch(db);
    Object.assign(branch, {
      name: payload.placeName || branch.name,
      address: payload.address,
      phone: payload.phone,
      receiptFooter: payload.receiptFooter,
    });
    db.storeInfo = storeInfoOf(db.companyInfo, branch);
    return ok(db.storeInfo);
  }
  return notFound(req, path);
}

const COMPANY_ADMIN_ONLY = 'ทำได้เฉพาะผู้ดูแลระบบระดับบริษัท (ทุกสาขา)';

/** `requireShift` cannot be switched off while any shift is open (`requireShiftChangeError()`). */
function requireShiftProblem(db: MockDb, next: boolean): string | null {
  return requireShiftChangeError(
    db.companyInfo.requireShift,
    next,
    db.shifts.filter((s) => s.status === 'open').length,
  );
}

/**
 * Company settings (E11): GET for everyone, PUT company admin (E6) — `companyInfoError()`.
 * GET/PUT /settings/branch: details of the request's branch, PUT by an admin of that branch.
 */
function handleCompanySettings(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  if (path === 'settings/company') {
    if (req.method === 'GET') return ok(db.companyInfo);
    if (req.method === 'PUT') {
      if (!isCompanyAdmin(actor)) return error(403, COMPANY_ADMIN_ONLY);
      const payload = normalizeCompanyInfo(req.body as CompanyInfo);
      const problem = companyInfoError(payload) ?? requireShiftProblem(db, payload.requireShift);
      if (problem) return error(400, problem);
      db.companyInfo = payload;
      return ok(db.companyInfo);
    }
  }
  if (path === 'settings/branch') {
    const branch = requestBranch(db);
    if (req.method === 'GET') return ok(branch);
    if (req.method === 'PUT') {
      // `handle()` already refused a branch the admin may not work in (403).
      const body = normalizeBranch((req.body ?? {}) as Partial<BranchDetails>);
      const next: Branch = {
        ...branch,
        name: body.name ?? branch.name,
        address: body.address ?? branch.address,
        phone: body.phone ?? branch.phone,
        receiptFooter: body.receiptFooter ?? branch.receiptFooter,
      };
      const problem = branchDetailsError(next);
      if (problem) return error(400, problem);
      Object.assign(branch, next);
      return ok(branch);
    }
  }
  return notFound(req, path);
}

/**
 * GET/POST /branches, GET/PUT /branches/:id — reads for everyone, writes by a company admin (E6).
 * No delete: a branch is deactivated (`branchError()` keeps one active).
 */
function handleBranches(
  req: HttpRequest<unknown>,
  path: string,
  db: MockDb,
): Observable<HttpResponse<unknown>> {
  if (path === 'branches' && req.method === 'GET') return ok(db.branches);
  if (req.method !== 'GET' && !isCompanyAdmin(actor)) return error(403, COMPANY_ADMIN_ONLY);
  if (path === 'branches' && req.method === 'POST') {
    // An `id` in the body is never taken: the server numbers branches.
    const payload = normalizeBranch({ ...BRANCH_DEFAULTS, ...(req.body as BranchPayload) });
    delete (payload as Partial<Branch>).id;
    const problem = branchError(payload, db.branches);
    if (problem) return error(400, problem);
    const limit = limitError(db, 'branches', payload.active);
    if (limit) return error(403, limit);
    const branch: Branch = { ...payload, id: db.nextBranchId++ };
    db.branches.push(branch);
    return ok(branch);
  }
  const idMatch = /^branches\/(\d+)$/.exec(path);
  const index = idMatch ? db.branches.findIndex((b) => b.id === Number(idMatch[1])) : -1;
  if (idMatch && index < 0) return error(404, 'ไม่พบสาขา');
  if (idMatch && req.method === 'GET') return ok(db.branches[index]);
  if (idMatch && req.method === 'PUT') {
    const current = db.branches[index];
    const payload = normalizeBranch({ ...current, ...(req.body as Partial<BranchPayload>) });
    const problem = branchError(payload, db.branches);
    if (problem) return error(400, problem);
    const openHere = db.posTerminals.some(
      (t) => t.branchId === current.id && openShiftOf(db, t.id),
    );
    if (!payload.active && openHere) {
      return error(400, `สาขา ${current.code} มีกะที่เปิดอยู่ ปิดใช้งานไม่ได้`);
    }
    const limit = limitError(db, 'branches', payload.active, current.active);
    if (limit) return error(403, limit);
    db.branches[index] = { ...payload, id: current.id };
    return ok(db.branches[index]);
  }
  return notFound(req, path);
}

/**
 * Mock logins (D4): company code `DEMO` + username — `admin` / `admin` (the first user), any other
 * user with `MOCK_USER_PASSWORD`. Every failure gives the same message (E3) so nobody learns which
 * companies or users exist; only a suspended company is told after a correct password. The token
 * names the company and the user so later requests know who is calling (`requestUser()`).
 */
function login(
  { companyCode, username, password }: Partial<LoginRequest>,
  db: MockDb,
): Observable<HttpResponse<LoginResponse>> {
  // `requestCompany()` already found the company by its code (none → `noTenant()`).
  const company = tenant;
  if (company.code !== normalizeCompanyCode(companyCode ?? ''))
    return error(401, WRONG_COMPANY_LOGIN);
  const user = checkCredentials(username, password, db);
  if (typeof user === 'string') {
    // Logged with the name typed (no user id: it may not exist — the message stays the same, E3).
    pushAudit(
      db,
      { action: 'login_failed', ref: null, detail: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' },
      { id: null, name: normalizeUsername(username ?? '') },
    );
    return error(401, WRONG_COMPANY_LOGIN);
  }
  const ownerDeleting = company.suspendedReason === 'deletion' && isOwner(user);
  if (!company.active && !ownerDeleting) {
    return error(401, SUSPENDED_MESSAGE[company.suspendedReason ?? 'platform']);
  }
  pushAudit(db, { action: 'login', ref: null, detail: '' }, user);
  return ok({ token: mockToken(company.id, user.id), ...companySession(db, user) });
}

const WRONG_LOGIN = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
/** Told only after a correct login (E3), by why the company is suspended. */
const SUSPENDED_MESSAGE: Record<CompanySuspendReason, string> = {
  platform: 'บริษัทนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบของบริษัท',
  overdue:
    'บริษัทนี้ถูกระงับการใช้งานเพราะค้างชำระค่าบริการ — เจ้าของบริษัทติดต่อผู้ให้บริการเพื่อชำระเงิน',
  deletion: 'บริษัทนี้อยู่ระหว่างรอลบข้อมูล — ติดต่อเจ้าของบริษัท',
};
const WRONG_COMPANY_LOGIN = 'รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง';
const SESSION_EXPIRED = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';

/**
 * The active user a login names, or `WRONG_LOGIN` (login + `auth/verify` + approvals) — a
 * deactivated user gets the same message as a wrong password (E3).
 */
function checkCredentials(
  username: string | undefined,
  password: string | undefined,
  db: MockDb,
): User | string {
  const name = normalizeUsername(username ?? '');
  const user = db.users.find((u) => normalizeUsername(u.username) === name);
  if (!user || !user.active || password !== passwordOf(db, user.id)) return WRONG_LOGIN;
  return user;
}

/** Password of every non-admin mock user that never got one of their own. */
const MOCK_USER_PASSWORD = '1234';

/** A user's password: the stored one, else `admin` for the first user and `1234` for the rest. */
function passwordOf(db: MockDb, userId: number): string {
  return db.passwords[userId] ?? (userId === db.users[0]?.id ? 'admin' : MOCK_USER_PASSWORD);
}

/** A fake token naming tenant + user (a real one is a signed JWT with these claims). Specs use it. */
export const mockToken = (companyId: number, userId: number): string =>
  `mock-jwt-token.t${companyId}.u${userId}`;

/** Company and user id a mock token names; undefined = missing / malformed / pre-SaaS (E1). */
function tokenIds(req: HttpRequest<unknown>): { companyId: number; userId: number } | undefined {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/, '') ?? '';
  const match = /^mock-jwt-token\.t(\d+)\.u(\d+)$/.exec(token);
  return match ? { companyId: Number(match[1]), userId: Number(match[2]) } : undefined;
}

/**
 * Who sent the request: the active user the token names in its company (`db` is that company's
 * data — `requestCompany()`). A suspended company or an inactive user → undefined (401); a token
 * of another company never reaches this db.
 */
function requestUser(req: HttpRequest<unknown>, db: MockDb): User | undefined {
  const ids = tokenIds(req);
  if (!ids || ids.companyId !== tenant.id) return undefined;
  // Waiting for deletion (E39): only the owner still gets in, to download or cancel.
  const deleting = tenant.suspendedReason === 'deletion';
  if (!tenant.active && !deleting) return undefined;
  const user = db.users.find((u) => u.id === ids.userId);
  if (deleting && !isOwner(user)) return undefined;
  return user?.active ? user : undefined;
}

/** Company + the branches the user may work in (`canWorkIn()`: active, theirs or all). */
function companySession(db: MockDb, user: User): MeResponse {
  const { id, code, active } = tenant;
  return {
    user,
    company: {
      id,
      code,
      active,
      name: db.companyInfo.name,
      taxId: db.companyInfo.taxId,
      deletionPurgeAfter: tenant.deletion?.purgeAfter ?? null,
    },
    branches: db.branches.filter((b) => canWorkIn(user, b)),
    // The banner of trial / invoices / overdue (E35) is for the owner and admins only.
    billing: hasAdminRights(user)
      ? billingNotice(tenant.subscription, invoicesOf(platform, tenant.id), todayIso())
      : null,
    canSeeCost: canSeeCost(user, db.companyInfo),
  };
}

/** The branch an `X-Branch-Id` names when the user may work in it; undefined → 403. */
function allowedBranch(db: MockDb, user: User, header: string): Branch | undefined {
  return companySession(db, user).branches.find((b) => String(b.id) === header.trim());
}

/**
 * Stored dbs from before E11 kept one `storeInfo`: its company part becomes `companyInfo`, and the
 * branches (step 1 made one, older data none) get its address / phone / receipt footer. Once.
 */
function splitStoreInfo(db: MockDb, stored: Partial<MockDb> | null): boolean {
  if (!stored || stored.companyInfo) return false;
  const legacy: StoreInfo = { ...STORE_INFO_DEFAULTS, ...SEED_STORE_INFO, ...stored.storeInfo };
  db.companyInfo = companyInfoOf(legacy);
  const branches: Partial<Branch>[] = stored.branches?.length
    ? stored.branches
    : [
        {
          id: 1,
          code: 'HQ',
          name: legacy.placeName || 'สำนักงานใหญ่',
          branchNo:
            legacy.branchType === 'branch' && legacy.branchNo
              ? legacy.branchNo
              : HEAD_OFFICE_BRANCH_NO,
        },
      ];
  db.branches = branches.map(
    (b) =>
      ({
        address: legacy.address,
        phone: legacy.phone,
        receiptFooter: legacy.receiptFooter,
        active: true,
        ...b,
      }) as Branch,
  );
  db.nextBranchId = Math.max(...db.branches.map((b) => b.id)) + 1;
  return true;
}

/** `X-Branch-Id` as a number; null when not sent (step 1–2 still serve it, E2). */
function requestBranchId(): number | null {
  return branchHeader === null ? null : Number(branchHeader);
}

/** The branch of the request (`X-Branch-Id`; none / unknown = the first, the request may still be refused). */
function requestBranch(db: MockDb): Branch {
  return db.branches.find((b) => String(b.id) === branchHeader?.trim()) ?? db.branches[0];
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
