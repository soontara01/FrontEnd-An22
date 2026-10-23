import {
  HttpClient,
  HttpHeaders,
  HttpInterceptorFn,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import {
  CartItem,
  Branch,
  BranchStockRow,
  CompanyInfo,
  Promotion,
  LoginResponse,
  MeResponse,
  MenuAccess,
  PosTerminal,
  CountCheckResult,
  DrawerOpen,
  ShiftAdjustment,
  CreditNote,
  CreditNoteLineInput,
  Exchange,
  Category,
  PRODUCT_DEFAULTS,
  PaymentInput,
  PaymentMethod,
  Product,
  Sale,
  SaleLine,
  Shift,
  ShiftSummary,
  VarianceReportRow,
  StoreInfo,
  TaxInvoice,
  Transfer,
  AuditEvent,
  CompanyDeletion,
  CompanyExport,
  DeletionRequest,
  PlatformCompanyDetail,
  PlatformCompanyRow,
  PlatformLoginResponse,
  SignupPayload,
  HeldBill,
  SubscriptionInfo,
  SerialNumber,
  SerialReceiveResult,
  SUPPLIER_DEFAULTS,
  SkuPrice,
  StockCardResult,
  Supplier,
  User,
} from '../models';
import {
  COMPANY_INFO_DEFAULTS,
  addDaysIso,
  priceCart,
  serialMovements,
  storeInfoError,
  todayIso,
} from '../models';
import { SEED_STORE_INFO, mockBackendInterceptor, mockToken } from './mock-backend.interceptor';

const DATED_LISTS = [
  'sales',
  'shifts',
  'shifts/variance-report',
  'credit-notes',
  'tax-invoices',
  'audit-log',
];

/**
 * Dated lists need `?from=&to=` of at most 366 days (api limit): a GET without a range / shift asks
 * for the last 366 days, so the cases below keep reading "everything" of the seed and the test.
 */
function withRange(url: string): string {
  const [path, query = ''] = url.split('?');
  const dated = DATED_LISTS.includes(path) || /^products\/\d+\/movements$/.test(path);
  if (!dated || /(^|&)(from|to|shiftId)=/.test(query)) return url;
  const range = `from=${addDaysIso(todayIso(), -365)}&to=${todayIso()}`;
  return `${path}?${query ? `${query}&` : ''}${range}`;
}

/** The token the mock's web part keeps after a login — the browser never gets it (E48). */
const sessionToken = (platform = false): string =>
  JSON.parse(
    localStorage.getItem(platform ? 'an22.mock.platformSession' : 'an22.mock.session') ?? 'null',
  );

/** What `terminalInterceptor` adds on a POS device set to terminal 1. */
const atTerminal1: HttpInterceptorFn = (req, next) =>
  next(req.clone({ setHeaders: { 'X-Terminal-Id': '1' } }));

/**
 * What the web server (the session's token, E48) + `branchInterceptor` add after an admin login in
 * branch 1 (HQ); requests
 * that name another user / branch keep theirs, `X-Branch-Id: none` sends no branch (E2 / E17).
 */
const asAdminByDefault: HttpInterceptorFn = (req, next) => {
  let headers = req.headers;
  if (!headers.has('Authorization')) {
    headers = headers.set('Authorization', `Bearer ${mockToken(1, 1)}`);
  }
  if (!headers.has('X-Branch-Id')) headers = headers.set('X-Branch-Id', '1');
  else if (headers.get('X-Branch-Id') === 'none') headers = headers.delete('X-Branch-Id');
  return next(req.clone({ headers }));
};

/** Exercises the mock backend's serial-number rules end to end through HttpClient. */
describe('mockBackendInterceptor – serials', () => {
  let http: HttpClient;
  const NOTEBOOK = 1; // seed: serialControl, prefix NB, length 12, stock 12
  const MOUSE = 2; // seed: not serial-controlled

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  const get = <T>(url: string) => firstValueFrom(http.get<T>(`/api/${withRange(url)}`));
  const post = <T>(url: string, body: unknown) => firstValueFrom(http.post<T>(`/api/${url}`, body));
  const put = <T>(url: string, body: unknown) => firstValueFrom(http.put<T>(`/api/${url}`, body));
  const errorOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => e,
    );

  it('generates sample serials so stock equals in-stock serials', async () => {
    const serials = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    expect(serials).toHaveLength(12);
    expect(serials.every((s) => s.status === 'in_stock' && s.serial.startsWith('NB-'))).toBe(true);
    expect(serials.every((s) => s.serial.length === 12)).toBe(true);
  });

  it('receives valid serials and rejects bad / duplicate ones', async () => {
    const result = await post<SerialReceiveResult>(`products/${NOTEBOOK}/serials`, {
      serials: ['nb-000000001', 'NB-000000002'],
    });
    expect(result.product.stock).toBe(14);

    const bad = await errorOf(
      post(`products/${NOTEBOOK}/serials`, { serials: ['XX-000000003', 'NB-000000001'] }),
    );
    expect(bad?.status).toBe(400);
    expect(bad?.error.message).toContain('XX-000000003');
    expect(bad?.error.message).toContain('มีอยู่ในคลังแล้ว');
  });

  it('removes serials as history and allows re-receiving them', async () => {
    const [first, second] = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    const product = await post<Product>(`products/${NOTEBOOK}/serials/remove`, {
      ids: [first.id, second.id],
      status: 'sold',
      note: 'INV-1',
    });
    expect(product.stock).toBe(10);

    const after = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    expect(after).toHaveLength(12); // history kept
    expect(after.find((s) => s.id === first.id)).toMatchObject({ status: 'sold', note: 'INV-1' });

    const back = await post<SerialReceiveResult>(`products/${NOTEBOOK}/serials`, {
      serials: [first.serial],
    });
    expect(back.product.stock).toBe(11);
    expect(back.received[0]).toMatchObject({
      id: first.id,
      status: 'in_stock',
      note: 'รับคืนเข้าคลัง',
    });

    // B18: the record is reused, but the stock card keeps the removal and the return, with the
    // same note on the receive line as on the serial.
    const card = await get<StockCardResult>(`products/${NOTEBOOK}/movements`);
    const all = [...card.openingMovements, ...card.movements];
    expect(serialMovements(first.serial, all).map((m) => [m.type, m.note])).toEqual([
      ['opening', 'ยอดยกมา'],
      ['issue', 'ขายแล้ว · INV-1'],
      ['receive', 'รับคืนเข้าคลัง'],
    ]);
  });

  it('blocks quantity adjustment on serial SKUs but not on others', async () => {
    const blocked = await errorOf(put(`products/${NOTEBOOK}/stock`, { delta: 1 }));
    expect(blocked?.status).toBe(400);

    const mouse = await put<Product>(`products/${MOUSE}/stock`, { delta: 1 });
    expect(mouse.stock).toBe(4);
  });

  it('blocks switching serial control while stock exists', async () => {
    const notebook = await get<Product>(`products/${NOTEBOOK}`);
    const res = await errorOf(put(`products/${NOTEBOOK}`, { ...notebook, serialControl: false }));
    expect(res?.status).toBe(400);
  });
});

/** Sale prices by period: overlap rule, derived currentPrice, legacy migration. */
describe('mockBackendInterceptor – prices', () => {
  let http: HttpClient;
  const NOTEBOOK = 1; // seed periods: expired → 2026-06-30, active → 2026-12-31, scheduled 2027-01-01 →
  const USB = 7; // seed: only an expired period

  beforeEach(() => {
    // Seed periods are fixed dates; pin "today" (only Date is faked, so rxjs delay still runs).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3));
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  afterEach(() => vi.useRealTimers());

  const get = <T>(url: string) => firstValueFrom(http.get<T>(`/api/${withRange(url)}`));
  const post = <T>(url: string, body: unknown) => firstValueFrom(http.post<T>(`/api/${url}`, body));
  const errorOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => e,
    );

  it('derives currentPrice from today’s period (null when none)', async () => {
    const products = await get<Product[]>('products');
    expect(products.find((p) => p.id === NOTEBOOK)?.currentPrice).toBe(24900);
    expect(products.find((p) => p.id === USB)?.currentPrice).toBeNull();
  });

  it('rejects overlapping periods and accepts adjacent ones', async () => {
    const overlap = await errorOf(
      post('prices', {
        productId: NOTEBOOK,
        price: 1,
        startDate: '2026-12-31',
        endDate: null,
        note: '',
      }),
    );
    expect(overlap?.status).toBe(400);
    expect(overlap?.error.message).toContain('ทับ');

    const ok = await post<SkuPrice>('prices', {
      productId: USB,
      price: 189,
      startDate: '2026-10-01',
      endDate: null,
      note: '',
    });
    expect(ok.id).toBeGreaterThan(0);
    const usb = await get<Product>(`products/${USB}`);
    expect(usb.currentPrice).toBe(189);
  });

  it('migrates a legacy Product.price into an open-ended period', async () => {
    localStorage.setItem(
      'an22.mock.db',
      JSON.stringify({
        products: [{ ...PRODUCT_DEFAULTS, id: 50, sku: 'OLD-1', name: 'old', price: 777 }],
        prices: [],
      }),
    );
    const product = await get<Product & { price?: number }>('products/50');
    expect(product.currentPrice).toBe(777);
    expect(product.price).toBeUndefined();
    const periods = await get<SkuPrice[]>('prices');
    expect(periods).toEqual([
      expect.objectContaining({ productId: 50, price: 777, endDate: null }),
    ]);
  });
});

/** Retail SKU master rules: categories, barcodes, packs, sale status, legacy migration. */
describe('mockBackendInterceptor – retail SKU master', () => {
  let http: HttpClient;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  const get = <T>(url: string) => firstValueFrom(http.get<T>(`/api/${withRange(url)}`));
  const post = <T>(url: string, body: unknown) => firstValueFrom(http.post<T>(`/api/${url}`, body));
  const put = <T>(url: string, body: unknown) => firstValueFrom(http.put<T>(`/api/${url}`, body));
  const del = (url: string) => firstValueFrom(http.delete(`/api/${url}`));
  const errorOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => e,
    );
  const newSku = (extra: Partial<Product> = {}) => ({
    ...PRODUCT_DEFAULTS,
    sku: 'NEW-1',
    name: 'ใหม่',
    shortName: 'ใหม่',
    categoryId: 3, // โน้ตบุ๊ก (leaf)
    ...extra,
  });

  it('derives categoryPath and protects categories in use', async () => {
    const notebook = await get<Product>('products/1');
    expect(notebook.categoryPath).toBe('ไอที > คอมพิวเตอร์ > โน้ตบุ๊ก');

    expect((await errorOf(del('categories/3')))?.status).toBe(400); // has SKUs
    expect((await errorOf(del('categories/2')))?.status).toBe(400); // has children

    const leaf = await post<Category>('categories', {
      code: 'IT-COM-AIO',
      name: 'ออลอินวัน',
      parentId: 2,
      active: true,
    });
    expect(leaf.level).toBe(3);
    const tooDeep = await errorOf(
      post('categories', { code: 'X', name: 'x', parentId: leaf.id, active: true }),
    );
    expect(tooDeep?.status).toBe(400);
    await del(`categories/${leaf.id}`);
  });

  it('validates category, barcodes and serial single-unit rule on SKU save', async () => {
    const nonLeaf = await errorOf(post('products', newSku({ categoryId: 2 })));
    expect(nonLeaf?.error.message).toContain('หมวดหมู่ย่อยสุด');

    // 8850000000126 = pack barcode of the mouse (MS-010)
    const dupBarcode = await errorOf(post('products', newSku({ barcode: '8850000000126' })));
    expect(dupBarcode?.error.message).toContain('บาร์โค้ดซ้ำ');

    const serialPack = await errorOf(
      post(
        'products',
        newSku({ serialControl: true, packUnits: [{ unit: 'กล่อง', factor: 5, barcode: '' }] }),
      ),
    );
    expect(serialPack?.error.message).toContain('หน่วยเดียว');

    const created = await post<Product>(
      'products',
      newSku({ barcode: '999', packUnits: [{ unit: 'ลัง', factor: 24, barcode: '998' }] }),
    );
    expect(created.categoryPath).toContain('โน้ตบุ๊ก');
  });

  it('blocks receiving for statuses that forbid purchasing', async () => {
    // Seed KB-020 (id 3) is 'no_purchase'
    const blocked = await errorOf(put('products/3/stock', { delta: 1 }));
    expect(blocked?.error.message).toContain('ห้ามรับเข้า');
    const sold = await put<Product>('products/3/stock', { delta: -1 });
    expect(sold.stock).toBe(17);
  });

  it('migrates legacy category text / active flag', async () => {
    localStorage.setItem(
      'an22.mock.db',
      JSON.stringify({
        products: [
          {
            ...PRODUCT_DEFAULTS,
            id: 60,
            sku: 'OLD-MON',
            name: 'จอเก่า',
            category: 'จอภาพ',
            active: false,
          },
        ],
      }),
    );
    const old = await get<Product & { category?: string; active?: boolean }>('products/60');
    expect(old).toMatchObject({ categoryId: 4, saleStatus: 'discontinued' });
    expect(old.categoryPath).toBe('ไอที > คอมพิวเตอร์ > จอภาพ');
    expect(old.category).toBeUndefined();
    expect(old.active).toBeUndefined();
  });
});

/** Suppliers master + SKU supplier links (round 2). */
describe('mockBackendInterceptor – suppliers', () => {
  let http: HttpClient;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  const get = <T>(url: string) => firstValueFrom(http.get<T>(`/api/${withRange(url)}`));
  const post = <T>(url: string, body: unknown) => firstValueFrom(http.post<T>(`/api/${url}`, body));
  const put = <T>(url: string, body: unknown) => firstValueFrom(http.put<T>(`/api/${url}`, body));
  const del = (url: string) => firstValueFrom(http.delete(`/api/${url}`));
  const errorOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => e,
    );
  const newSupplier = (extra: Partial<Supplier> = {}) => ({
    ...SUPPLIER_DEFAULTS,
    code: 'SUP-NEW',
    name: 'ผู้จำหน่ายใหม่',
    taxId: '0105540345672',
    branchType: 'branch',
    branchNo: '00002',
    ...extra,
  });

  it('derives productCount and blocks deleting a linked supplier', async () => {
    const suppliers = await get<Supplier[]>('suppliers');
    expect(suppliers.find((s) => s.id === 1)?.productCount).toBe(2); // NB-001, SSD-1T
    expect((await errorOf(del('suppliers/1')))?.status).toBe(400);
  });

  it('validates tax ID checksum, branch number and duplicates', async () => {
    const badTax = await errorOf(post('suppliers', newSupplier({ taxId: '0105540345670' })));
    expect(badTax?.error.message).toContain('เลขประจำตัวผู้เสียภาษี');
    const badBranch = await errorOf(post('suppliers', newSupplier({ branchNo: '12' })));
    expect(badBranch?.error.message).toContain('สาขา');
    // Same tax ID as SUP-ACC (head office) is fine for another branch
    const created = await post<Supplier>('suppliers', newSupplier());
    expect(created).toMatchObject({ code: 'SUP-NEW', productCount: 0 });
    const dup = await errorOf(post('suppliers', newSupplier({ code: 'SUP-NEW2' })));
    expect(dup?.error.message).toContain('มีอยู่แล้ว');
    await del(`suppliers/${created.id}`);
  });

  it('validates SKU supplier links (one main, no duplicates, max ≥ reorder point)', async () => {
    const mouse = await get<Product>('products/2');
    const twoMain = await errorOf(
      put('products/2', {
        ...mouse,
        suppliers: [
          { ...mouse.suppliers[0], isMain: true },
          { ...mouse.suppliers[0], supplierId: 1, isMain: true },
        ],
      }),
    );
    expect(twoMain?.error.message).toContain('ผู้จำหน่ายหลัก');
    const lowMax = await errorOf(put('products/2', { ...mouse, minStock: 10, maxStock: 5 }));
    expect(lowMax?.error.message).toContain('สต็อกสูงสุด');
  });
});

/** Costing: moving average (non-serial), specific identification (serial), stock card. */
describe('mockBackendInterceptor – costing', () => {
  let http: HttpClient;
  const NOTEBOOK = 1; // serial, 12 in stock @ 19,900
  const MOUSE = 2; // non-serial, 3 in stock @ 350

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  const get = <T>(url: string) => firstValueFrom(http.get<T>(`/api/${withRange(url)}`));
  const post = <T>(url: string, body: unknown) => firstValueFrom(http.post<T>(`/api/${url}`, body));
  const put = <T>(url: string, body: unknown) => firstValueFrom(http.put<T>(`/api/${url}`, body));

  it('re-averages on receipt and issues at the average (non-serial)', async () => {
    const received = await put<Product>(`products/${MOUSE}/stock`, {
      delta: 20,
      unitCost: 300,
      note: 'INV-001',
    });
    expect(received.stock).toBe(23);
    expect(received.avgCost).toBeCloseTo(306.5217, 4);

    const issued = await put<Product>(`products/${MOUSE}/stock`, { delta: -1 });
    expect(issued.avgCost).toBeCloseTo(306.5217, 4); // unchanged by issues

    const stockCard = await get<StockCardResult>(`products/${MOUSE}/movements`);
    // The opening line is the brought-forward balance, not a receipt (B17).
    expect(stockCard.opening).toEqual({ qty: 3, avgCost: 350, value: 1050 });
    expect(stockCard.openingMovements.map((m) => m.type)).toEqual(['opening']);
    expect(stockCard.totals.inQty).toBe(20);
    const card = stockCard.movements;
    expect(card.map((m) => m.type)).toEqual(['receive', 'issue']);
    expect(card[0]).toMatchObject({ qty: 20, totalCost: 6000, balanceQty: 23, note: 'INV-001' });
    expect(card[1]).toMatchObject({ qty: -1, unitCost: 306.52, balanceQty: 22 });
    expect(card[1].balanceValue).toBeCloseTo(22 * 306.5217, 1);
  });

  it('issues several units at once and rejects issuing more than the stock', async () => {
    // USB cable (id 7): 60 in stock at the standard cost 80
    const issued = await put<Product>('products/7/stock', { delta: -20, note: 'ขายแล้ว' });
    expect(issued.stock).toBe(40);
    const card = (await get<StockCardResult>('products/7/movements')).movements;
    expect(card.at(-1)).toMatchObject({ type: 'issue', qty: -20, unitCost: 80, totalCost: -1600 });

    const tooMany = await firstValueFrom(http.put('/api/products/7/stock', { delta: -41 })).then(
      () => null,
      (e: { status: number }) => e.status,
    );
    expect(tooMany).toBe(400);
  });

  it('keeps each serial cost and issues at the serials own costs (serial)', async () => {
    const receive = await post<SerialReceiveResult>(`products/${NOTEBOOK}/serials`, {
      serials: ['NB-900000001', 'NB-900000002'],
      unitCost: 19000,
    });
    expect(receive.received.map((s) => s.cost)).toEqual([19000, 19000]);
    expect(receive.product.avgCost).toBeCloseTo((12 * 19900 + 2 * 19000) / 14, 3);

    const serials = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    const oldOne = serials.find((s) => s.cost === 19900)!;
    const newOne = serials.find((s) => s.serial === 'NB-900000001')!;
    const after = await post<Product>(`products/${NOTEBOOK}/serials/remove`, {
      ids: [oldOne.id, newOne.id],
      status: 'sold',
      note: '',
    });
    expect(after.avgCost).toBeCloseTo((11 * 19900 + 19000) / 12, 3);

    const card = (await get<StockCardResult>(`products/${NOTEBOOK}/movements`)).movements;
    const issue = card.at(-1)!;
    expect(issue).toMatchObject({ type: 'issue', qty: -2, totalCost: -38900, balanceQty: 12 });
    expect(issue.serials).toEqual([oldOne.serial, 'NB-900000001']);
  });

  it('slices the stock card by date range with opening / closing balances', async () => {
    await put<Product>('products/7/stock', { delta: 10, unitCost: 70 });
    const today = todayIso();
    const all = await get<StockCardResult>('products/7/movements');
    expect(all.openingMovements.map((m) => m.type)).toEqual(['opening']);
    expect(all.movements.map((m) => m.type)).toEqual(['receive']);

    const future = addDaysIso(today, 1);
    const empty = await get<StockCardResult>(`products/7/movements?from=${future}&to=${future}`);
    expect(empty.movements).toEqual([]);
    expect(empty.opening).toEqual(all.closing); // everything is before the range
    expect(empty.closing).toEqual(all.closing);

    const bad = await firstValueFrom(
      http.get(`/api/products/7/movements?from=${future}&to=${today}`),
    ).then(
      () => null,
      (e: { status: number }) => e.status,
    );
    expect(bad).toBe(400);
  });

  it('migrates stored data without costs (opening balance at standard cost)', async () => {
    localStorage.setItem(
      'an22.mock.db',
      JSON.stringify({
        products: [{ ...PRODUCT_DEFAULTS, id: 80, sku: 'OLD-C', name: 'old', cost: 50, stock: 4 }],
        movements: [],
      }),
    );
    const product = await get<Product>('products/80');
    expect(product.avgCost).toBe(50);
    const card = await get<StockCardResult>('products/80/movements');
    expect(card.movements).toEqual([]);
    expect(card.openingMovements).toEqual([
      expect.objectContaining({ type: 'opening', qty: 4, unitCost: 50, balanceValue: 200 }),
    ]);
    expect(card.opening).toEqual({ qty: 4, avgCost: 50, value: 200 });
  });
});

describe('mockBackendInterceptor – POS sales', () => {
  let http: HttpClient;
  const NOTEBOOK = 1; // serial, 24,900 today; promo 3 gives a mouse + setup service
  const MOUSE = 2; // 590, stock 3, avg 350; promo 1 (−10%)
  const ESIM = 8; // service, 199
  const CASH = 1; // rounds to 0.25
  const CARD = 2; // needs a reference, min 300
  const QR = 3;

  beforeEach(() => {
    // Seed prices / promotions are dated around October 2026.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 10, 0));
    localStorage.clear();
    // These tests cover selling itself; shifts have their own describe below.
    localStorage.setItem(
      'an22.mock.db',
      JSON.stringify({
        shiftsEnabled: true,
        storeInfo: { ...SEED_STORE_INFO, requireShift: false },
      }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([asAdminByDefault, atTerminal1, mockBackendInterceptor]),
        ),
      ],
    });
    http = TestBed.inject(HttpClient);
  });
  afterEach(() => vi.useRealTimers());

  const get = <T>(url: string) => firstValueFrom(http.get<T>(`/api/${withRange(url)}`));
  const post = <T>(url: string, body: unknown) => firstValueFrom(http.post<T>(`/api/${url}`, body));
  const put = <T>(url: string, body: unknown) => firstValueFrom(http.put<T>(`/api/${url}`, body));
  const del = (url: string) => firstValueFrom(http.delete(`/api/${url}`));
  const errorOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => e.error.message,
    );
  const item = (productId: number, qty = 1, serial: string | null = null): CartItem => ({
    productId,
    factor: 1,
    qty,
    serial,
  });
  const pay = (methodId: number, amount: number, reference = ''): PaymentInput => ({
    methodId,
    amount,
    reference,
    installmentMonths: null,
  });
  const sell = (
    items: CartItem[],
    expectedTotal: number,
    payments: PaymentInput[],
  ): Promise<Sale> =>
    post<Sale>('sales', { items, freeSerials: [], payments, customer: '', expectedTotal });
  const product = (id: number) => get<Product>(`products/${id}`);

  it('re-prices the cart, issues stock with COGS and numbers the receipt', async () => {
    const [unit] = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    const setup = await product(9);
    const sale = await sell([item(NOTEBOOK, 1, unit.serial)], 24600, [
      pay(CARD, 20000, 'A1'),
      pay(CASH, 5000),
    ]);

    expect(sale).toMatchObject({
      orderNo: 'POS-HQ-1-20261004-0001',
      status: 'paid',
      cashier: 'Admin',
      subtotal: 24900,
      billDiscount: 300,
      total: 24600,
      rounding: 0,
      change: 400,
      billPromotionIds: [2],
      itemCount: 3,
    });
    expect(sale.payments.map((p) => [p.name, p.amount, p.tendered])).toEqual([
      ['บัตรเครดิต/เดบิต', 20000, 20000],
      ['เงินสด', 4600, 5000],
    ]);
    expect(sale.lines.map((l) => [l.sku, l.amount, l.freeOfPromotionId, l.cogs])).toEqual([
      ['NB-001', 24600, null, unit.cost],
      ['MS-010', 0, 3, 350],
      ['SV-SETUP', 0, 3, setup.cost],
    ]);

    expect((await product(NOTEBOOK)).stock).toBe(11);
    expect((await product(MOUSE)).stock).toBe(2);
    const serials = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    expect(serials.find((s) => s.id === unit.id)?.status).toBe('sold');
    const card = await get<StockCardResult>(`products/${MOUSE}/movements`);
    expect(card.movements.at(-1)).toMatchObject({
      type: 'issue',
      qty: -1,
      note: 'ของแถม POS-HQ-1-20261004-0001',
    });

    const next = await sell([item(ESIM)], 199, [pay(QR, 199)]);
    expect(next.orderNo).toBe('POS-HQ-1-20261004-0002');
    expect(next.lines[0].cogs).toBe((await product(ESIM)).cost);
    expect(await get<Sale>(`sales/${next.id}`)).toEqual(next);
  });

  it('rejects the sale without changing anything when a check fails', async () => {
    expect(await errorOf(sell([item(MOUSE)], 590, [pay(CASH, 590)]))).toBe(
      'ราคาหรือโปรโมชั่นมีการเปลี่ยนแปลง กรุณาตรวจสอบบิลอีกครั้ง',
    );
    expect(await errorOf(sell([item(MOUSE, 4)], 2124, [pay(CASH, 2124)]))).toBe(
      'MS-010 สต็อกไม่พอ (คงเหลือ 3 ชิ้น)',
    );
    expect(
      await errorOf(sell([item(NOTEBOOK, 1, 'NB-999999999')], 24600, [pay(CASH, 24600)])),
    ).toBe('ซีเรียล NB-999999999 ไม่อยู่ในคลังของ NB-001');
    expect(await errorOf(sell([item(MOUSE)], 531, [pay(CASH, 500)]))).toBe(
      'ยอดชำระยังไม่ครบ (ขาด ฿31)',
    );
    expect(await errorOf(sell([], 0, []))).toBe('ยังไม่มีสินค้าในบิล');
    expect((await product(MOUSE)).stock).toBe(3);
    expect(await get<Sale[]>('sales')).toHaveLength(7);
  });

  it('voids a sale and puts goods back at their sale cost', async () => {
    const [unit] = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    const sale = await sell([item(MOUSE, 2)], 1062, [pay(CASH, 1062)]);
    expect((await product(MOUSE)).stock).toBe(1);
    const nb = await sell([item(NOTEBOOK, 1, unit.serial)], 24600, [pay(CASH, 24600)]);

    expect(await errorOf(post(`sales/${sale.id}/void`, { reason: ' ' }))).toBe(
      'กรุณาระบุเหตุผลการยกเลิก',
    );
    expect(await errorOf(put(`sales/${sale.id}/status`, { status: 'cancelled' }))).toBe(
      'บิลขายหน้าร้านเปลี่ยนสถานะไม่ได้ (ใช้การยกเลิกบิล)',
    );
    const voided = await post<Sale>(`sales/${sale.id}/void`, { reason: 'ลูกค้าเปลี่ยนใจ' });
    expect(voided).toMatchObject({ status: 'cancelled', voidReason: 'ลูกค้าเปลี่ยนใจ' });
    // 1 left − 1 free with the notebook + 2 back
    expect(await product(MOUSE)).toMatchObject({ stock: 2, avgCost: 350 });
    expect(await errorOf(post(`sales/${sale.id}/void`, { reason: 'x' }))).toBe(
      'ยกเลิกได้เฉพาะบิลที่ชำระแล้ว',
    );

    await post<Sale>(`sales/${nb.id}/void`, { reason: 'ทดสอบ' });
    const serials = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    expect(serials.find((s) => s.id === unit.id)?.status).toBe('in_stock');
    expect((await product(NOTEBOOK)).stock).toBe(12);
    expect((await product(MOUSE)).stock).toBe(3); // the free mouse came back too
  });

  it('voids only on the day of sale (later → credit note)', async () => {
    const sale = await sell([item(MOUSE)], 531, [pay(CASH, 531)]);
    vi.setSystemTime(new Date(2026, 9, 5, 0, 5));
    expect(await errorOf(post(`sales/${sale.id}/void`, { reason: 'ลูกค้าคืน' }))).toBe(
      'ยกเลิกได้เฉพาะบิลของวันนี้ บิลข้ามวันต้องออกใบลดหนี้',
    );
    expect((await get<Sale>(`sales/${sale.id}`)).status).toBe('paid');
  });

  it('fills line fields missing from a stored bill when reading it (B24)', async () => {
    const sale = await sell([item(MOUSE)], 531, [pay(CASH, 531)]);
    const db = JSON.parse(localStorage.getItem('an22.mock.db')!) as { sales: Sale[] };
    const stored = db.sales.find((s) => s.id === sale.id)!;
    stored.lines = stored.lines.map((l) => {
      const copy: Partial<SaleLine> = { ...l };
      delete copy.freeOfPromotionId;
      delete copy.promotionIds;
      return copy as SaleLine;
    });
    localStorage.setItem('an22.mock.db', JSON.stringify(db));
    const [line] = (await get<Sale>(`sales/${sale.id}`)).lines;
    expect(line).toMatchObject({ freeOfPromotionId: null, promotionIds: [], amount: 531 });
  });

  it('lists sales by local day of sale, newest first', async () => {
    const today = await sell([item(ESIM)], 199, [pay(QR, 199)]);
    const listed = await get<Sale[]>('sales?from=2026-10-04&to=2026-10-04');
    expect(listed.map((s) => s.orderNo)).toEqual([today.orderNo]);
    const all = await get<Sale[]>('sales');
    expect(all[0].orderNo).toBe(today.orderNo);
    expect(all).toHaveLength(8);
    expect(await get<Sale[]>('sales?from=2026-09-01&to=2026-09-30')).toHaveLength(5);
    expect(await errorOf(get('sales?from=2026-10-05&to=2026-10-04'))).toBe(
      'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด',
    );
  });

  it('takes no VAT while the store is not VAT-registered, also on its credit notes (B20)', async () => {
    const info = await get<StoreInfo>('settings/store');
    await put('settings/store', { ...info, vatRegistered: false });
    const plain = await sell([item(MOUSE)], 531, [pay(CASH, 531)]);
    expect(plain).toMatchObject({ total: 531, vat: 0, vatRegistered: false });
    expect(plain.lines.map((l) => l.vat)).toEqual([0]);

    vi.setSystemTime(new Date(2026, 9, 5, 11, 0));
    const cn = await post<CreditNote>(`sales/${plain.id}/credit-notes`, {
      lines: [{ saleLineIndex: 0, qty: 1, restock: true }],
      refunds: [pay(CASH, 531)],
      reason: 'ลูกค้าคืนสินค้า',
      expectedTotal: 531,
    });
    expect(cn).toMatchObject({ total: 531, vat: 0, vatRegistered: false });

    // Registered again: new bills carry VAT, the old one keeps its snapshot.
    await put('settings/store', { ...info, vatRegistered: true });
    const taxed = await sell([item(MOUSE)], 531, [pay(CASH, 531)]);
    expect(taxed).toMatchObject({ vat: 34.74, vatRegistered: true });
    expect((await get<Sale>(`sales/${plain.id}`)).vatRegistered).toBe(false);
  });

  it('issues credit notes from the next day: stock back, free goods deducted', async () => {
    const [unit] = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    const sale = await sell([item(NOTEBOOK, 1, unit.serial), item(MOUSE)], 25131, [
      pay(CARD, 20000, 'A1'),
      pay(CASH, 5131),
    ]);
    const body = (lines: CreditNoteLineInput[], total: number, refunds: PaymentInput[]) => ({
      lines,
      refunds,
      reason: 'ลูกค้าคืนสินค้า',
      expectedTotal: total,
    });
    const notebookOnly = body([{ saleLineIndex: 0, qty: 1, restock: true }], 23516.26, [
      pay(CARD, 20000, 'R1'),
      pay(CASH, 3516.26),
    ]);
    expect(await errorOf(post(`sales/${sale.id}/credit-notes`, notebookOnly))).toBe(
      'บิลของวันนี้ให้ยกเลิกบิลแทนการออกใบลดหนี้',
    );

    vi.setSystemTime(new Date(2026, 9, 5, 11, 0));
    // the notebook (24,606.26 after its bill-discount share) comes back; the free mouse (590)
    // and setup (500) stay with the customer
    const cn = await post<CreditNote>(`sales/${sale.id}/credit-notes`, notebookOnly);
    expect(cn).toMatchObject({
      cnNo: 'CN-HQ-20261005-0001',
      subtotal: 24606.26,
      deduction: 1090,
      total: 23516.26,
    });
    expect(cn.refunds.map((r) => [r.name, r.amount])).toEqual([
      ['บัตรเครดิต/เดบิต', 20000],
      ['เงินสด', 3516.26],
    ]);
    expect((await product(NOTEBOOK)).stock).toBe(12);
    const serials = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    expect(serials.find((s) => s.id === unit.id)?.status).toBe('in_stock');

    // the paid mouse comes back damaged: no restock; the card has nothing left to refund
    const mouseBefore = (await product(MOUSE)).stock;
    const damaged = body([{ saleLineIndex: 1, qty: 1, restock: false }], 524.74, [
      pay(CARD, 524.74, 'R2'),
    ]);
    expect(await errorOf(post(`sales/${sale.id}/credit-notes`, damaged))).toBe(
      'คืนเงินได้เฉพาะเงินสดหรือช่องทางที่ลูกค้าชำระบิลนี้',
    );
    const second = await post<CreditNote>(`sales/${sale.id}/credit-notes`, {
      ...damaged,
      refunds: [pay(CASH, 524.74)],
    });
    expect(second.cnNo).toBe('CN-HQ-20261005-0002');
    expect((await product(MOUSE)).stock).toBe(mouseBefore);
    expect(await errorOf(post(`sales/${sale.id}/credit-notes`, damaged))).toBe(
      'MS-010 คืนได้ไม่เกิน 0 ชิ้น',
    );

    expect(await get<CreditNote[]>(`sales/${sale.id}/credit-notes`)).toHaveLength(2);
    // the bill itself is unchanged; its return summary is derived on read (list and single)
    const [listed] = await get<Sale[]>('sales?from=2026-10-04&to=2026-10-04');
    expect(listed).toMatchObject({
      id: sale.id,
      status: 'paid',
      returnStatus: 'partial',
      creditedTotal: 24041,
      creditNoteNos: ['CN-HQ-20261005-0001', 'CN-HQ-20261005-0002'],
    });
    expect((await get<Sale>(`sales/${sale.id}`)).returnStatus).toBe('partial');
    expect(await get<CreditNote[]>('credit-notes?from=2026-10-05&to=2026-10-05')).toHaveLength(2);
    expect(await get<CreditNote[]>('credit-notes?from=2026-10-04&to=2026-10-04')).toHaveLength(0);
  }, 15000); // ~17 requests × the mock's 300 ms latency

  it('issues one full tax invoice per bill and cancels it with the bill', async () => {
    const sale = await sell([item(MOUSE)], 531, [pay(CASH, 531)]);
    const buyer = {
      name: 'บริษัท ลูกค้า จำกัด',
      taxId: '0105550123451',
      branchType: 'branch',
      branchNo: '00002',
      address: 'เชียงใหม่',
    };
    expect(await get<TaxInvoice | null>(`sales/${sale.id}/tax-invoice`)).toBeNull();
    expect(
      await errorOf(post(`sales/${sale.id}/tax-invoice`, { buyer: { ...buyer, name: '' } })),
    ).toBe('กรุณากรอกชื่อผู้ซื้อ');
    const invoice = await post<TaxInvoice>(`sales/${sale.id}/tax-invoice`, { buyer });
    expect(invoice).toMatchObject({
      invoiceNo: 'INV-HQ-20261004-0001',
      orderNo: sale.orderNo,
      buyer,
    });
    expect((await get<Sale>(`sales/${sale.id}`)).taxInvoiceNo).toBe('INV-HQ-20261004-0001');
    expect(await errorOf(post(`sales/${sale.id}/tax-invoice`, { buyer }))).toBe(
      'บิลนี้ออกใบกำกับภาษีเต็มรูปแล้ว (INV-HQ-20261004-0001)',
    );
    expect(await get('tax-invoices/buyer?taxId=0105550123451')).toEqual({
      ...buyer,
      idType: 'tax_id',
    });
    expect(await get('tax-invoices/buyer?taxId=1111111111119')).toBeNull();

    await post(`sales/${sale.id}/void`, { reason: 'คีย์ผิด' });
    expect((await get<TaxInvoice>(`sales/${sale.id}/tax-invoice`)).cancelledAt).not.toBeNull();

    // a store that is not VAT-registered issues none
    const info = await get<StoreInfo>('settings/store');
    await put('settings/store', { ...info, vatRegistered: false });
    const other = await sell([item(MOUSE)], 531, [pay(CASH, 531)]);
    expect(await errorOf(post(`sales/${other.id}/tax-invoice`, { buyer }))).toBe(
      'ร้านไม่ได้จดทะเบียน VAT ออกใบกำกับภาษีไม่ได้',
    );
  });

  it('cancels a full tax invoice with wrong buyer details and issues a corrected one', async () => {
    const buyer = {
      name: 'บริษัท ผิดชื่อ จำกัด',
      taxId: '0105550123451',
      branchType: 'head',
      branchNo: '',
      address: 'กรุงเทพฯ',
    };
    const sale = await post<Sale>('sales', {
      items: [item(MOUSE)],
      freeSerials: [],
      payments: [pay(CASH, 531)],
      customer: '',
      expectedTotal: 531,
      buyer,
    });
    vi.setSystemTime(new Date(2026, 9, 6, 9, 0));
    const fixed = { ...buyer, name: 'บริษัท ถูกชื่อ จำกัด' };
    expect(
      await errorOf(post(`sales/${sale.id}/tax-invoice/reissue`, { buyer: fixed, reason: '' })),
    ).toBe('กรุณาระบุเหตุผลที่ยกเลิกใบเดิม');

    const next = await post<TaxInvoice>(`sales/${sale.id}/tax-invoice/reissue`, {
      buyer: fixed,
      reason: 'ชื่อผู้ซื้อผิด',
    });
    expect(next).toMatchObject({
      invoiceNo: 'INV-HQ-20261004-0002',
      date: sale.date,
      atSale: true,
      replacesInvoiceNo: 'INV-HQ-20261004-0001',
      buyer: fixed,
    });
    expect(next.issuedAt).toBe(new Date(2026, 9, 6, 9, 0).toISOString());
    const all = await get<TaxInvoice[]>(`sales/${sale.id}/tax-invoices`);
    expect(all[0]).toMatchObject({
      invoiceNo: 'INV-HQ-20261004-0001',
      cancelReason: 'ชื่อผู้ซื้อผิด',
      replacedByNo: 'INV-HQ-20261004-0002',
    });
    expect(all[0].cancelledAt).not.toBeNull();
    expect((await get<TaxInvoice>(`sales/${sale.id}/tax-invoice`)).invoiceNo).toBe(
      'INV-HQ-20261004-0002',
    );
    expect((await get<Sale>(`sales/${sale.id}`)).taxInvoiceNo).toBe('INV-HQ-20261004-0002');
    // the cancelled one cannot be reissued again; the valid one can
    expect(
      (await post<TaxInvoice>(`sales/${sale.id}/tax-invoice/reissue`, { buyer, reason: 'กลับ' }))
        .replacesInvoiceNo,
    ).toBe('INV-HQ-20261004-0002');
  });

  it('dates a full tax invoice requested later on the day of sale', async () => {
    const sale = await sell([item(MOUSE)], 531, [pay(CASH, 531)]);
    vi.setSystemTime(new Date(2026, 10, 3, 9, 0)); // next month
    const buyer = {
      name: 'บริษัท ลูกค้า จำกัด',
      taxId: '0105550123451',
      branchType: 'head',
      branchNo: '',
      address: 'กรุงเทพฯ',
    };
    const invoice = await post<TaxInvoice>(`sales/${sale.id}/tax-invoice`, { buyer });
    expect(invoice).toMatchObject({
      invoiceNo: 'INV-HQ-20261004-0001',
      date: sale.date,
      atSale: false,
    });
    expect(invoice.issuedAt).toBe(new Date(2026, 10, 3, 9, 0).toISOString());
    // listed with the sale's month
    expect(await get<TaxInvoice[]>('tax-invoices?from=2026-10-01&to=2026-10-31')).toHaveLength(1);
  });

  it('issues the full tax invoice together with the sale when a buyer is given', async () => {
    const buyer = {
      name: 'บริษัท ลูกค้า จำกัด',
      taxId: '0105550123451',
      branchType: 'head',
      branchNo: '',
      address: 'กรุงเทพฯ',
    };
    const body = (b: unknown) => ({
      items: [item(MOUSE)],
      freeSerials: [],
      payments: [pay(CASH, 531)],
      customer: '',
      expectedTotal: 531,
      buyer: b,
    });
    expect(await errorOf(post('sales', body({ ...buyer, taxId: '123' })))).toBe(
      'เลขประจำตัวผู้เสียภาษีผู้ซื้อต้องเป็น 13 หลักที่ถูกต้อง',
    );
    expect((await product(MOUSE)).stock).toBe(3); // nothing sold

    const sale = await post<Sale>('sales', body(buyer));
    expect(sale.taxInvoiceNo).toBe('INV-HQ-20261004-0001');
    const invoice = await get<TaxInvoice>(`sales/${sale.id}/tax-invoice`);
    expect(invoice).toMatchObject({
      atSale: true,
      orderNo: sale.orderNo,
      buyer,
      cancelledAt: null,
    });
    expect(invoice.date).toBe(sale.date);
  });

  it('issues a full tax invoice to a foreign buyer by passport number', async () => {
    const body = (taxId: string) => ({
      items: [item(MOUSE)],
      freeSerials: [],
      payments: [pay(CASH, 531)],
      customer: '',
      expectedTotal: 531,
      buyer: {
        name: 'John Smith',
        idType: 'passport',
        taxId,
        branchType: 'head',
        branchNo: '',
        address: 'Hotel ABC, Bangkok',
      },
    });
    expect(await errorOf(post('sales', body('AB-1')))).toBe(
      'เลขที่หนังสือเดินทางต้องเป็นตัวอักษรอังกฤษ/ตัวเลข 6–20 ตัว',
    );
    const sale = await post<Sale>('sales', body('ab 123 4567'));
    const invoice = await get<TaxInvoice>(`sales/${sale.id}/tax-invoice`);
    expect(invoice.buyer).toMatchObject({
      idType: 'passport',
      taxId: 'AB1234567',
      branchType: 'none',
    });
    expect(await get('tax-invoices/buyer?taxId=AB1234567')).toMatchObject({ name: 'John Smith' });
  });

  it('swaps a serial for another of the same SKU; a later credit note returns the new one', async () => {
    const [unit, other] = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    const sale = await sell([item(NOTEBOOK, 1, unit.serial)], 24600, [
      pay(CARD, 20000, 'A1'),
      pay(CASH, 4600),
    ]);
    const swap = (newSerial: string) => ({
      lines: [{ saleLineIndex: 0, qty: 1, newSerial, restock: false }],
      reason: 'เครื่องเปิดไม่ติด',
    });
    expect(await errorOf(post(`sales/${sale.id}/exchanges`, swap('NOPE')))).toBe(
      'ซีเรียล NOPE ไม่อยู่ในคลังของ NB-001',
    );

    const ex = await post<Exchange>(`sales/${sale.id}/exchanges`, swap(other.serial));
    expect(ex).toMatchObject({ exNo: 'EX-HQ-20261004-0001', orderNo: sale.orderNo });
    expect(ex.lines[0]).toMatchObject({
      oldSerial: unit.serial,
      newSerial: other.serial,
      restock: false,
      costIn: unit.cost,
      costOut: other.cost,
    });
    const serials = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    expect(serials.find((s) => s.id === unit.id)?.status).toBe('damaged');
    expect(serials.find((s) => s.id === other.id)?.status).toBe('sold');
    // the bill itself is unchanged apart from the derived exchange numbers
    const read = await get<Sale>(`sales/${sale.id}`);
    expect(read).toMatchObject({ total: 24600, exchangeNos: ['EX-HQ-20261004-0001'] });
    expect(read.lines[0].serial).toBe(unit.serial);

    vi.setSystemTime(new Date(2026, 9, 5, 11, 0));
    const cn = await post<CreditNote>(`sales/${sale.id}/credit-notes`, {
      lines: [0, 1, 2].map((i) => ({ saleLineIndex: i, qty: 1, restock: true })),
      refunds: [pay(CARD, 20000, 'R1'), pay(CASH, 4600)],
      reason: 'คืนทั้งบิล',
      expectedTotal: 24600,
    });
    expect(cn.lines[0].serial).toBe(other.serial);
    const after = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    expect(after.find((s) => s.id === other.id)?.status).toBe('in_stock');
    expect(after.find((s) => s.id === unit.id)?.status).toBe('damaged');
  }, 15000);

  it('exchanges non-serial goods through stock and voids with the serial now held', async () => {
    const mouse = await sell([item(MOUSE)], 531, [pay(CASH, 531)]);
    await post(`sales/${mouse.id}/exchanges`, {
      lines: [{ saleLineIndex: 0, qty: 1, newSerial: null, restock: true }],
      reason: 'ลูกค้าขอเปลี่ยน',
    });
    expect((await product(MOUSE)).stock).toBe(2); // out 1 from the shelf, the old one back
    const card = (await get<StockCardResult>(`products/${MOUSE}/movements`)).movements;
    expect(card.slice(-2).map((m) => [m.type, m.qty, m.balanceQty, m.note])).toEqual([
      ['issue', -1, 1, 'เปลี่ยนสินค้า EX-HQ-20261004-0001 (บิล POS-HQ-1-20261004-0001)'],
      ['receive', 1, 2, 'เปลี่ยนสินค้า EX-HQ-20261004-0001 (บิล POS-HQ-1-20261004-0001)'],
    ]);

    // the last 2 sold too: nothing on the shelf to hand out, even if the old one is fine
    const rest = await sell([item(MOUSE, 2)], 1062, [pay(CASH, 1062)]);
    expect(
      await errorOf(
        post(`sales/${rest.id}/exchanges`, {
          lines: [{ saleLineIndex: 0, qty: 1, newSerial: null, restock: true }],
          reason: 'ลูกค้าขอเปลี่ยน',
        }),
      ),
    ).toBe('MS-010 สต็อกไม่พอเปลี่ยน (คงเหลือ 0 ชิ้น)');
    expect((await product(MOUSE)).stock).toBe(0);

    // a serial swapped the same day: voiding the bill takes back the serial now held
    const [unit, other] = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    const nb = await sell([item(NOTEBOOK, 1, unit.serial)], 24600, [
      pay(CARD, 20000, 'A1'),
      pay(CASH, 4600),
    ]);
    await post(`sales/${nb.id}/exchanges`, {
      lines: [{ saleLineIndex: 0, qty: 1, newSerial: other.serial, restock: true }],
      reason: 'หยิบผิด',
    });
    await post(`sales/${nb.id}/void`, { reason: 'ลูกค้ายกเลิก' });
    const serials = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`);
    expect(serials.find((s) => s.id === unit.id)?.status).toBe('in_stock');
    expect(serials.find((s) => s.id === other.id)?.status).toBe('in_stock');
  }, 15000);

  it('takes manual discounts after promotions, with a reason and who gave them', async () => {
    const body = (reason: string) => ({
      items: [{ ...item(MOUSE), manualDiscount: { kind: 'amount', value: 31 } }],
      freeSerials: [],
      payments: [pay(CASH, 450)],
      customer: '',
      // 590 − 10% promo = 531 → −31 = 500 → bill −10% = 450
      expectedTotal: 450,
      billManualDiscount: { kind: 'percent', value: 10 },
      manualDiscountReason: reason,
    });
    expect(await errorOf(post('sales', body(' ')))).toBe('กรุณาระบุเหตุผลส่วนลดพิเศษ');
    const sale = await post<Sale>('sales', body('ลูกค้าประจำ'));
    expect(sale).toMatchObject({
      total: 450,
      itemDiscount: 59,
      manualDiscount: 81,
      manualDiscountReason: 'ลูกค้าประจำ',
      manualDiscountBy: 'Admin',
    });
    expect(sale.lines[0]).toMatchObject({ itemDiscount: 59, manualDiscount: 81, amount: 450 });
  });

  it('logs staff in by username and applies their name and role to the sale', async () => {
    const login = (username: string, password: string) =>
      post<{ user: { name: string } }>('auth/login', {
        companyCode: 'DEMO',
        username,
        password,
      });
    const wrong = 'รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง';
    expect(await errorOf(login('somchai', 'wrong'))).toBe(wrong);
    expect(await errorOf(login('somchai@example.com', '1234'))).toBe(wrong);
    expect(await errorOf(login('somying', '1234'))).toBe(wrong);
    const { user } = await login(' Somchai ', '1234');
    const token = sessionToken();
    expect(user.name).toBe('สมชาย ใจดี');

    const round = (n: number) => Math.round(n * 100) / 100;
    const asStaff = (percent: number) =>
      firstValueFrom(
        http.post<Sale>(
          '/api/sales',
          {
            items: [{ ...item(MOUSE), manualDiscount: { kind: 'percent', value: percent } }],
            freeSerials: [],
            payments: [pay(CASH, 531)],
            customer: '',
            expectedTotal: round(531 * (1 - percent / 100)),
            manualDiscountReason: 'ลูกค้าประจำ',
          },
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
    // store ceiling 5% for staff (the admin, without a token in these specs, has no ceiling)
    expect(await errorOf(asStaff(10))).toBe('ส่วนลดพิเศษ MS-010 เกิน 5% — ให้ผู้ดูแลระบบทำรายการ');
    const sale = await asStaff(5);
    expect(sale).toMatchObject({ cashier: 'สมชาย ใจดี', manualDiscountBy: 'สมชาย ใจดี' });
  });

  it('keeps payment methods and SKUs that sales refer to', async () => {
    await sell([item(ESIM)], 199, [pay(QR, 199)]);
    expect(await errorOf(del(`payment-methods/${QR}`))).toBe(
      'มีการขายที่ใช้ช่องทางนี้แล้ว ลบไม่ได้ (ปิดใช้งานแทน)',
    );
    expect(await errorOf(del(`products/${ESIM}`))).toBe(
      'SKU นี้มีประวัติการขาย ลบไม่ได้ (เปลี่ยนสถานะเป็นเลิกจำหน่ายแทน)',
    );
  });
});

describe('mockBackendInterceptor – store info', () => {
  let http: HttpClient;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('serves the seed store info and validates updates', async () => {
    const info = await firstValueFrom(http.get<StoreInfo>('/api/settings/store'));
    expect(storeInfoError(info)).toBeNull();
    const saved = await firstValueFrom(
      http.put<StoreInfo>('/api/settings/store', { ...info, name: ' ร้านใหม่ ' }),
    );
    expect(saved.name).toBe('ร้านใหม่');
    const bad = await firstValueFrom(
      http.put('/api/settings/store', { ...info, taxId: '123' }),
    ).then(
      () => null,
      (e: { error: { message: string } }) => e.error.message,
    );
    expect(bad).toBe('เลขประจำตัวผู้เสียภาษีต้องเป็น 13 หลักที่ถูกต้อง');
  });
});

describe('mockBackendInterceptor – shifts', () => {
  let http: HttpClient;
  const MOUSE = 2; // 531 after promo 1, stock 3
  const CASH = 1;
  const STAFF = mockToken(1, 2); // สมชาย ใจดี (role user)
  interface As {
    token?: string;
    /** Terminal header, default 1; null = a device not set to any terminal */
    terminal?: number | null;
  }

  const call = <T>(method: string, url: string, body?: unknown, as: As = {}) => {
    let headers = new HttpHeaders();
    if (as.token) headers = headers.set('Authorization', `Bearer ${as.token}`);
    const terminal = as.terminal === undefined ? 1 : as.terminal;
    if (terminal) headers = headers.set('X-Terminal-Id', String(terminal));
    return firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, { body, headers }),
    );
  };
  const errorOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { error: { message: string } }) => e.error.message,
    );
  const sellMouse = (as?: As) =>
    call<Sale>(
      'POST',
      'sales',
      {
        items: [{ productId: MOUSE, factor: 1, qty: 1, serial: null }],
        freeSerials: [],
        payments: [{ methodId: CASH, amount: 531, reference: '', installmentMonths: null }],
        customer: '',
        expectedTotal: 531,
      },
      as,
    );
  const open = (openingFloat: number, as?: As) =>
    call<Shift>('POST', 'shifts/open', { openingFloat, openingDenominations: [] }, as);
  const setRequireShift = async (requireShift: boolean) => {
    const info = await call<StoreInfo>('GET', 'settings/store');
    return call<StoreInfo>('PUT', 'settings/store', { ...info, requireShift });
  };
  /** A blind count that matches the system (read as admin), with `cashOff` on the drawer. */
  const countsFor = async (shift: Shift, cashOff = 0) => {
    const x = await call<ShiftSummary>('GET', `shifts/${shift.id}/summary`);
    return (x.lines ?? []).map((l) => ({
      methodId: l.methodId,
      counted: l.closeCheck === 'count' ? l.expected + (l.type === 'cash' ? cashOff : 0) : null,
      firstCount: null,
      confirmed: true,
      reasonCode: l.type === 'cash' && cashOff ? 'unknown' : null,
      reason: '',
    }));
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 10, 0));
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });
  afterEach(() => vi.useRealTimers());

  it('switches shifts on once for a db stored while they were temporarily off', async () => {
    localStorage.setItem(
      'an22.mock.db',
      JSON.stringify({ storeInfo: { ...SEED_STORE_INFO, requireShift: false } }),
    );
    expect((await call<StoreInfo>('GET', 'settings/store')).requireShift).toBe(true);
    await setRequireShift(false);
    expect((await call<StoreInfo>('GET', 'settings/store')).requireShift).toBe(false);
  });

  it('blocks money actions without an open shift and records the shift', async () => {
    expect(await errorOf(sellMouse())).toBe('ยังไม่ได้เปิดกะที่เครื่องนี้');
    const shift = await open(1000);
    expect(shift).toMatchObject({ shiftNo: 'SH-HQ-20261004-01', cashier: 'Admin', terminalId: 1 });
    expect(await call<Shift>('GET', 'shifts/current')).toEqual(shift);
    const sale = await sellMouse();
    expect(sale.shiftId).toBe(shift.id);
    const voided = await call<Sale>('POST', `sales/${sale.id}/void`, { reason: 'คีย์ผิด' });
    expect(voided.voidShiftId).toBe(shift.id);
    const ofShift = await call<Sale[]>('GET', `sales?shiftId=${shift.id}`);
    expect(ofShift.map((s) => s.id)).toEqual([sale.id]);
  });

  it('allows one open shift per terminal and per cashier', async () => {
    await open(500, { token: STAFF });
    expect(await errorOf(open(0))).toBe('เครื่องนี้มีกะที่เปิดอยู่แล้ว');
    expect(await errorOf(open(0, { token: STAFF, terminal: 2 }))).toBe(
      'คุณมีกะที่เปิดอยู่ที่เครื่องอื่น — ปิดกะนั้นก่อน',
    );
    const second = await open(0, { terminal: 2 });
    expect(second.terminalId).toBe(2);
    expect(await errorOf(sellMouse())).toBe(
      'กะนี้เป็นของ สมชาย ใจดี — ต้องปิดกะนั้นก่อนจึงจะขายได้',
    );
    expect((await sellMouse({ terminal: 2 })).shiftId).toBe(second.id);
  });

  it('closes a shift whose card line is below zero from a void of another shift (S9 / B23)', async () => {
    const first = await open(1000);
    const sale = await call<Sale>('POST', 'sales', {
      items: [{ productId: MOUSE, factor: 1, qty: 1, serial: null }],
      freeSerials: [],
      payments: [{ methodId: 2, amount: 531, reference: 'A1', installmentMonths: null }],
      customer: '',
      expectedTotal: 531,
    });
    const closeBody = (counts: unknown) => ({
      counts,
      cashDenominations: [],
      depositAmount: 0,
      note: '',
      approval: null,
    });
    await call('POST', `shifts/${first.id}/close`, closeBody(await countsFor(first)));

    const second = await open(1000);
    await call('POST', `sales/${sale.id}/void`, { reason: 'คีย์ผิด' });
    const counts = await countsFor(second);
    const card = counts.find((c) => c.methodId === 2)!;
    expect(card.counted).toBe(-531);
    const negativeCash = counts.map((c) => (c.methodId === CASH ? { ...c, counted: -1 } : c));
    expect(
      await errorOf(call('POST', `shifts/${second.id}/count-check`, { counts: negativeCash })),
    ).toBe('กรุณากรอกยอดที่นับได้ของ เงินสด');
    const check = await call<CountCheckResult>('POST', `shifts/${second.id}/count-check`, {
      counts,
    });
    expect(check.lines.find((l) => l.methodId === 2)).toMatchObject({
      expected: -531,
      counted: -531,
      variance: 0,
    });
    expect(check.needsApproval).toBe(false);
    const closed = await call<Shift>('POST', `shifts/${second.id}/close`, closeBody(counts));
    expect(closed.approvalStatus).toBe('not_needed');
    expect(closed.counts.find((c) => c.methodId === 2)).toMatchObject({
      expected: -531,
      counted: -531,
      reasonCode: null,
    });
  });

  it('moves cash, hides the X-report lines from staff and closes a matching count', async () => {
    const staff = { token: STAFF };
    const shift = await open(1000, staff);
    await sellMouse(staff);
    const move = (amount: number, as: As = staff) =>
      call(
        'POST',
        `shifts/${shift.id}/cash-movements`,
        { type: 'out', amount, reason: 'ค่าส่ง' },
        as,
      );
    // Blind count (B19): the cashier is not told the expected cash, an admin is.
    expect(await errorOf(move(2000))).toBe('เงินสดในลิ้นชักไม่พอ');
    expect(await errorOf(move(2000, {}))).toBe('เงินสดในลิ้นชักไม่พอ (คาดว่ามี 1,531 บาท)');
    expect(await call('GET', `shifts/${shift.id}/movements`, undefined, staff)).toEqual([]);
    await move(100);
    const x = await call<ShiftSummary>('GET', `shifts/${shift.id}/summary`, undefined, staff);
    expect(x).toMatchObject({ billCount: 1, salesTotal: 531, cashOut: 100 });
    expect(x.lines).toBeUndefined();
    const counts = await countsFor(shift);
    expect(counts[0]).toMatchObject({ methodId: CASH, counted: 1431 });
    const closed = await call<Shift>(
      'POST',
      `shifts/${shift.id}/close`,
      { counts, cashDenominations: [], depositAmount: 1000, note: '' },
      staff,
    );
    expect(closed).toMatchObject({
      status: 'closed',
      closedBy: 'สมชาย ใจดี',
      approvalStatus: 'not_needed',
      floatLeft: 431,
    });
  });

  it('keeps a variance above the limit pending until an admin approves it', async () => {
    const staff = { token: STAFF };
    const shift = await open(1000, staff);
    const counts = await countsFor(shift, -150);
    const closed = await call<Shift>(
      'POST',
      `shifts/${shift.id}/close`,
      { counts, cashDenominations: [], depositAmount: 0, note: '' },
      staff,
    );
    expect(closed.approvalStatus).toBe('pending');
    expect(await errorOf(call('POST', `shifts/${shift.id}/approve`, {}, staff))).toBe(
      'อนุมัติส่วนต่างได้เฉพาะผู้ดูแลระบบ',
    );
    const approved = await call<Shift>('POST', `shifts/${shift.id}/approve`, {});
    expect(approved).toMatchObject({ approvalStatus: 'approved', approvedBy: 'Admin' });
    expect(await call<VarianceReportRow[]>('GET', 'shifts/variance-report')).toEqual([
      {
        cashier: 'สมชาย ใจดี',
        shifts: 1,
        shortCount: 1,
        overCount: 0,
        shortTotal: 150,
        overTotal: 0,
        pending: 0,
        drawerOpens: 0,
      },
    ]);
    expect(await call<Shift[]>('GET', 'shifts?from=2026-10-04&to=2026-10-04')).toHaveLength(1);
  });

  it('logs a drawer opened without a sale in the shift, with a reason (S7)', async () => {
    const staff = { token: STAFF };
    const shift = await open(1000, staff);
    const openDrawer = (reason: string, as: As) =>
      call('POST', `shifts/${shift.id}/drawer-opens`, { reason }, as);
    expect(await errorOf(openDrawer(' ', staff))).toBe('กรุณาระบุเหตุผลที่เปิดลิ้นชัก');
    expect(await errorOf(openDrawer('แลกเหรียญ', { token: mockToken(1, 4) }))).toBe(
      'กะนี้เป็นของ สมชาย ใจดี — ทำรายการนี้ได้เฉพาะเจ้าของกะหรือผู้ดูแลระบบ',
    );
    expect(await errorOf(openDrawer('แลกเหรียญ', { ...staff, terminal: 2 }))).toBe(
      'กะนี้ไม่ได้เปิดที่เครื่องนี้',
    );
    await openDrawer('แลกเหรียญ', staff);
    await openDrawer('ตรวจนับเงิน', {});
    const logged = await call<DrawerOpen[]>('GET', `shifts/${shift.id}/drawer-opens`);
    expect(logged.map((d) => [d.by, d.reason])).toEqual([
      ['สมชาย ใจดี', 'แลกเหรียญ'],
      ['Admin', 'ตรวจนับเงิน'],
    ]);
    const x = await call<ShiftSummary>('GET', `shifts/${shift.id}/summary`);
    expect(x.drawerOpenCount).toBe(2);
    expect(x.lines?.[0].expected).toBe(1000); // no money moved
    const counts = await countsFor(shift);
    await call('POST', `shifts/${shift.id}/close`, {
      counts,
      cashDenominations: [],
      depositAmount: 0,
      note: '',
    });
    const [row] = await call<VarianceReportRow[]>('GET', 'shifts/variance-report');
    expect(row.drawerOpens).toBe(2);
  });

  it('adjusts a closed shift without changing its counts or approval (S8)', async () => {
    const staff = { token: STAFF };
    const shift = await open(1000, staff);
    const counts = await countsFor(shift, -150);
    const closed = await call<Shift>(
      'POST',
      `shifts/${shift.id}/close`,
      { counts, cashDenominations: [], depositAmount: 0, note: '' },
      staff,
    );
    expect(closed.approvalStatus).toBe('pending');
    const adjust = (body: object, as: As = {}) =>
      call<ShiftAdjustment>('POST', `shifts/${shift.id}/adjustments`, body, as);
    const found = { methodId: CASH, amount: 150, reasonCode: 'found_cash', reason: 'ตกใต้ลิ้นชัก' };
    expect(await errorOf(adjust(found, staff))).toBe('ปรับปรุงกะได้เฉพาะผู้ดูแลระบบ');
    const saved = await adjust(found);
    expect(saved).toMatchObject({ name: 'เงินสด', amount: 150, by: 'Admin' });

    const after = await call<Shift>('GET', `shifts/${shift.id}`);
    expect(after).toMatchObject({ approvalStatus: 'pending', adjustmentTotal: 150 });
    expect(after.counts).toEqual(closed.counts);
    expect(await call<ShiftAdjustment[]>('GET', `shifts/${shift.id}/adjustments`)).toEqual([saved]);
    const [row] = await call<VarianceReportRow[]>('GET', 'shifts/variance-report');
    expect(row).toMatchObject({ shortCount: 0, shortTotal: 0, pending: 1 });
  });

  it('sells without a shift when shifts are off and keeps them on while one is open', async () => {
    await setRequireShift(false);
    expect((await sellMouse()).shiftId).toBeNull();
    await setRequireShift(true);
    await open(0);
    expect(await errorOf(setRequireShift(false))).toBe(
      'ยังมีกะที่เปิดอยู่ 1 กะ — ปิดกะทั้งหมดก่อนปิดการใช้ระบบกะ',
    );
  });

  it('verifies a login without starting a session (400 when wrong)', async () => {
    const ok = await call<{ user: { name: string } }>('POST', 'auth/verify', {
      username: 'somchai',
      password: '1234',
    });
    expect(ok.user.name).toBe('สมชาย ใจดี');
    expect(await errorOf(call('POST', 'auth/verify', { username: 'somchai', password: 'x' }))).toBe(
      'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    );
  });

  it('reveals variances after a full blind count and approves with an admin login', async () => {
    const staff = { token: STAFF };
    const shift = await open(1000, staff);
    const counts = await countsFor(shift, -150);
    const blank = counts.map((c, i) => (i === 0 ? { ...c, counted: null } : c));
    expect(
      await errorOf(call('POST', `shifts/${shift.id}/count-check`, { counts: blank }, staff)),
    ).toBe('กรุณากรอกยอดที่นับได้ของ เงินสด');
    const check = await call<CountCheckResult>(
      'POST',
      `shifts/${shift.id}/count-check`,
      { counts },
      staff,
    );
    expect(check.needsApproval).toBe(true);
    expect(check.lines[0]).toMatchObject({ expected: 1000, counted: 850, variance: -150 });

    const close = (approval: unknown) =>
      call<Shift>(
        'POST',
        `shifts/${shift.id}/close`,
        { counts, cashDenominations: [], depositAmount: 0, note: '', approval },
        staff,
      );
    expect(await errorOf(close({ username: 'admin', password: 'x' }))).toBe(
      'รหัสผ่านผู้อนุมัติไม่ถูกต้อง',
    );
    expect(await errorOf(close({ username: 'somchai', password: '1234' }))).toBe(
      'ผู้อนุมัติต้องเป็นผู้ดูแลระบบ',
    );
    expect(await close({ username: 'admin', password: 'admin' })).toMatchObject({
      approvalStatus: 'approved',
      approvedBy: 'Admin',
      closedBy: 'สมชาย ใจดี',
    });
  });

  it("lets an admin close another terminal's shift from any device, not other staff", async () => {
    const shift = await open(500, { token: STAFF, terminal: 2 });
    await sellMouse({ token: STAFF, terminal: 2 });
    const counts = await countsFor(shift);
    const body = { counts, cashDenominations: [], depositAmount: 0, note: '' };
    const OTHER = mockToken(1, 4);
    expect(
      await errorOf(call('POST', `shifts/${shift.id}/close`, body, { token: OTHER, terminal: 2 })),
    ).toBe('ปิดกะได้เฉพาะเจ้าของกะหรือผู้ดูแลระบบ');
    // Admin on a back-office device (no terminal set): count check + close.
    const check = await call<CountCheckResult>(
      'POST',
      `shifts/${shift.id}/count-check`,
      { counts },
      { terminal: null },
    );
    expect(check.needsApproval).toBe(false);
    const closed = await call<Shift>('POST', `shifts/${shift.id}/close`, body, { terminal: null });
    expect(closed).toMatchObject({ status: 'closed', closedBy: 'Admin', cashier: 'สมชาย ใจดี' });
  });

  it('keeps the POS screen lock on the shift; only its cashier or an admin unlocks (E48)', async () => {
    const shift = await open(500, { token: STAFF });
    expect(shift.lockedAt).toBeNull();
    expect(await errorOf(call('POST', `shifts/${shift.id}/lock`, null, { terminal: 2 }))).toBe(
      'กะนี้ไม่ได้เปิดที่เครื่องนี้',
    );
    const locked = await call<Shift>('POST', `shifts/${shift.id}/lock`, null, { token: STAFF });
    expect(locked.lockedAt).toBe(new Date(2026, 9, 4, 10, 0).toISOString());
    // a reload / another browser storage does not unlock: the server answers the lock
    expect(
      (await call<Shift>('GET', 'shifts/current', undefined, { token: STAFF }))?.lockedAt,
    ).toBe(locked.lockedAt);
    expect(await errorOf(sellMouse({ token: STAFF }))).toBe('หน้าจอถูกล็อก — ปลดล็อกก่อน');

    const unlock = (username: string, password: string) =>
      call<Shift>('POST', `shifts/${shift.id}/unlock`, { username, password }, { token: STAFF });
    expect(await errorOf(unlock('somchai', 'x'))).toBe('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    expect(await errorOf(unlock('john', '1234'))).toBe(
      'ปลดล็อกได้เฉพาะ สมชาย ใจดี หรือผู้ดูแลระบบ',
    );
    expect((await call<Shift>('GET', `shifts/${shift.id}`))?.lockedAt).toBe(locked.lockedAt);
    expect((await unlock('admin', 'admin')).lockedAt).toBeNull();

    await call('POST', `shifts/${shift.id}/lock`, null, { token: STAFF });
    expect((await unlock(' Somchai ', '1234')).lockedAt).toBeNull();
    expect(await sellMouse({ token: STAFF })).toMatchObject({ cashier: 'สมชาย ใจดี' });
  });

  it('keeps parked bills per branch + terminal on the server (E48)', async () => {
    const bill = {
      heldAt: '2026-10-04T03:00:00.000Z',
      customer: 'คุณเอ',
      items: [{ productId: MOUSE, factor: 1, qty: 1, serial: null }],
      freeSerials: [],
      buyer: {
        name: 'บริษัท บี จำกัด',
        taxId: '0105550123451',
        branchType: 'head',
        branchNo: '',
        address: 'กรุงเทพฯ',
      },
      billManual: null,
      manualReason: '',
      total: 531,
    };
    expect(await call<HeldBill[]>('GET', 'pos/held-bills')).toEqual([]);
    const parked = await call<HeldBill>('POST', 'pos/held-bills', bill);
    expect(parked).toEqual({ ...bill, id: expect.any(String) });
    expect(await call<HeldBill[]>('GET', 'pos/held-bills')).toEqual([parked]);
    // another terminal / no terminal / no items
    expect(await call<HeldBill[]>('GET', 'pos/held-bills', undefined, { terminal: 2 })).toEqual([]);
    expect(
      await errorOf(call('GET', 'pos/held-bills', undefined, { terminal: null })),
    ).toBeTruthy();
    expect(await errorOf(call('POST', 'pos/held-bills', { ...bill, items: [] }))).toBe(
      'ไม่มีรายการในบิลที่จะพัก',
    );
    expect(
      await errorOf(call('DELETE', `pos/held-bills/${parked.id}`, undefined, { terminal: 2 })),
    ).toBe('ไม่พบบิลที่พักไว้');

    expect(await call('DELETE', `pos/held-bills/${parked.id}`)).toBeNull();
    expect(await call<HeldBill[]>('GET', 'pos/held-bills')).toEqual([]);
  });
});

describe('mockBackendInterceptor – POS terminals', () => {
  let http: HttpClient;
  const MOUSE = 2; // 531 after promo 1
  const CASH = 1;
  const STAFF = mockToken(1, 2);

  const call = <T>(
    method: string,
    url: string,
    body?: unknown,
    terminal?: number,
    token?: string,
  ) => {
    let headers = new HttpHeaders();
    if (terminal) headers = headers.set('X-Terminal-Id', String(terminal));
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);
    return firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, { body, headers }),
    );
  };
  const errorOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { error: { message: string } }) => e.error.message,
    );
  const sellMouse = (terminal?: number) =>
    call<Sale>(
      'POST',
      'sales',
      {
        items: [{ productId: MOUSE, factor: 1, qty: 1, serial: null }],
        freeSerials: [],
        payments: [{ methodId: CASH, amount: 531, reference: '', installmentMonths: null }],
        customer: '',
        expectedTotal: 531,
      },
      terminal,
    );
  const start = (stored?: object) => {
    localStorage.clear();
    if (stored) localStorage.setItem('an22.mock.db', JSON.stringify(stored));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('sells only at a registered active terminal and numbers bills per terminal', async () => {
    start({
      shiftsEnabled: true,
      storeInfo: { ...SEED_STORE_INFO, posId: 'E051234567890', requireShift: false },
    });
    expect(await errorOf(sellMouse())).toBe(
      'เครื่องนี้ยังไม่ได้ตั้งเลขเครื่อง POS กรุณาให้ผู้ดูแลตั้งค่าที่เมนูตั้งค่า',
    );
    expect(await errorOf(sellMouse(9))).toBe(
      'ไม่พบเครื่อง 9 ในทะเบียนเครื่อง POS กรุณาให้ผู้ดูแลตั้งค่าใหม่',
    );
    await call('POST', 'pos-terminals', { id: 2, name: 'ชั้น 2', posId: 'E052', active: true });
    const a = await sellMouse(1);
    const b = await sellMouse(2);
    const c = await sellMouse(1);
    expect([a, b, c].map((s) => [s.orderNo, s.terminalId, s.posId])).toEqual([
      ['POS-HQ-1-20261004-0001', 1, 'E051234567890'],
      ['POS-HQ-2-20261004-0001', 2, 'E052'],
      ['POS-HQ-1-20261004-0002', 1, 'E051234567890'],
    ]);
  });

  it('keeps the registry for admins and protects terminals in use', async () => {
    start();
    const terminals = await call<PosTerminal[]>('GET', 'pos-terminals');
    expect(terminals.map((t) => [t.id, t.branchId])).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
    ]);
    const add = { id: 4, name: ' ชั้น 4 ', posId: '', branchId: 1, active: true };
    expect(await errorOf(call('POST', 'pos-terminals', add, undefined, STAFF))).toBe(
      'แก้ทะเบียนเครื่อง POS ได้เฉพาะผู้ดูแลระบบ',
    );
    expect(await call<PosTerminal>('POST', 'pos-terminals', add)).toMatchObject({ name: 'ชั้น 4' });
    expect(await errorOf(call('POST', 'pos-terminals', add))).toBe('มีเครื่อง 4 อยู่แล้ว');

    await call('POST', 'shifts/open', { openingFloat: 0, openingDenominations: [] }, 4);
    expect(await errorOf(call('PUT', 'pos-terminals/4', { ...add, id: 99, active: false }))).toBe(
      'เครื่อง 4 มีกะที่เปิดอยู่ ปิดใช้งานไม่ได้',
    );
    expect(await errorOf(call('DELETE', 'pos-terminals/4'))).toBe(
      'เครื่อง 4 มีกะหรือเอกสารแล้ว ลบไม่ได้ (ปิดใช้งานแทน)',
    );
    expect(await call('DELETE', 'pos-terminals/2')).toBeNull();
  });

  it('opens a shift / sells only in the own branch of the terminal (E8)', async () => {
    start();
    const openAt = (terminal: number, branch: string) =>
      firstValueFrom(
        http.post<Shift>(
          '/api/shifts/open',
          { openingFloat: 0, openingDenominations: [] },
          { headers: { 'X-Terminal-Id': String(terminal), 'X-Branch-Id': branch } },
        ),
      );
    expect(await errorOf(openAt(3, '1'))).toBe(
      'เครื่อง 3 เป็นเครื่องของสาขา BN · ร้านไอทีดี คอมพิวเตอร์ สาขาบางนา — สลับไปสาขานั้น หรือให้ผู้ดูแลตั้งเครื่องนี้ใหม่',
    );
    expect(await openAt(3, '2')).toMatchObject({ terminalId: 3, posId: 'E051234567892' });
    // the branch cannot be closed while its shift is open
    expect(await errorOf(call('PUT', 'branches/2', { active: false }))).toBe(
      'สาขา BN มีกะที่เปิดอยู่ ปิดใช้งานไม่ได้',
    );
  });

  it('opens a shift only at the registered terminal it names', async () => {
    start();
    const open = (body: object, terminal?: number) =>
      call<Shift>(
        'POST',
        'shifts/open',
        { openingFloat: 0, openingDenominations: [], ...body },
        terminal,
      );
    expect(await errorOf(open({}))).toBe(
      'เครื่องนี้ยังไม่ได้ตั้งเลขเครื่อง POS กรุณาให้ผู้ดูแลตั้งค่าที่เมนูตั้งค่า',
    );
    expect(await errorOf(open({ terminalId: 1 }, 2))).toBe(
      'เลขเครื่องไม่ตรงกับเครื่องนี้ (เครื่อง 2)',
    );
    expect(await open({ terminalId: 2 }, 2)).toMatchObject({
      terminalId: 2,
      posId: 'E051234567891',
    });
  });

  it('lists the credit notes refunded from one shift', async () => {
    const note = (id: number, shiftId: number | null) => ({
      id,
      cnNo: `CN-20261004-000${id}`,
      date: '2026-10-04T03:00:00Z',
      shiftId,
    });
    start({ creditNotes: [note(1, 7), note(2, 8), note(3, null)] });
    const ofShift = await call<CreditNote[]>('GET', 'credit-notes?shiftId=7');
    expect(ofShift.map((n) => n.id)).toEqual([1]);
    expect(await call<CreditNote[]>('GET', 'credit-notes')).toHaveLength(3);
  });

  it('moves the old store-wide POS ID to terminal 1 and to older documents', async () => {
    const old = { id: 50, total: 100, orderNo: 'POS-20261003-0001', lines: [{ unitPrice: 100 }] };
    start({
      shiftsEnabled: true,
      storeInfo: { ...SEED_STORE_INFO, posId: 'E0OLD' },
      sales: [old],
      shifts: [{ id: 1, terminalId: 3, status: 'closed', openedAt: '2026-10-03T01:00:00Z' }],
    });
    const terminals = await call<PosTerminal[]>('GET', 'pos-terminals');
    expect(terminals.map((t) => [t.id, t.name, t.posId])).toEqual([
      [1, 'เครื่อง 1', 'E0OLD'],
      [3, 'เครื่อง 3', ''],
    ]);
    expect(await call<Sale>('GET', 'sales/50')).toMatchObject({
      orderNo: 'POS-20261003-0001',
      terminalId: 1,
      posId: 'E0OLD',
    });
    expect((await call<Shift>('GET', 'shifts/1')).posId).toBe('E0OLD');
  });
});

/** Permission table (`docs/saas-plan.md` section 17): admin-only endpoints answer 403 to users. */
describe('mockBackendInterceptor – permissions', () => {
  let http: HttpClient;
  const MOUSE = 2; // 531 after promo 1, stock 3
  const CASH = 1;
  const STAFF = mockToken(1, 2); // สมชาย ใจดี (role user)

  const call = <T>(method: string, url: string, body?: unknown, token?: string, terminal = 1) => {
    let headers = new HttpHeaders().set('X-Terminal-Id', String(terminal));
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);
    return firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, { body, headers }),
    );
  };
  const failure = (p: Promise<unknown>) =>
    p.then(
      () => null,
      // An empty body may also make a handler throw a plain error (status 0): only 403 matters here.
      (e: { status?: number; error?: { message?: string } }) => ({
        status: e.status ?? 0,
        message: e.error?.message ?? '',
      }),
    );
  const statusOf = async (p: Promise<unknown>) => (await failure(p))?.status ?? 200;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it.each([
    ['GET', 'users'],
    ['POST', 'users', { username: 'xx1', name: 'x', email: '', role: 'user', active: true }],
    ['PUT', 'users/2', { role: 'admin' }],
    ['DELETE', 'users/4'],
    ['POST', 'categories', {}],
    ['PUT', 'categories/1', {}],
    ['DELETE', 'categories/1'],
    ['POST', 'suppliers', {}],
    ['PUT', 'suppliers/1', {}],
    ['DELETE', 'suppliers/1'],
    ['POST', 'payment-methods', {}],
    ['PUT', 'payment-methods/order', { ids: [] }],
    ['DELETE', 'payment-methods/1'],
    ['POST', 'prices', {}],
    ['PUT', 'prices/1', {}],
    ['DELETE', 'prices/1'],
    ['POST', 'promotions', {}],
    ['PUT', 'promotions/1', {}],
    ['DELETE', 'promotions/1'],
    ['PUT', `products/${MOUSE}/stock`, { delta: -1, note: 'x' }],
    ['POST', 'products/1/serials/remove', { ids: [], status: 'damaged', note: 'x' }],
    ['POST', 'sales/1/credit-notes', {}],
    ['POST', 'sales/1/tax-invoice/reissue', {}],
    ['GET', 'tax-invoices'],
    ['PUT', 'settings/store', {}],
    ['POST', 'shifts/1/approve'],
    ['POST', 'shifts/1/adjustments', {}],
  ])('%s /%s is admin only (403 for users)', async (method, url, body?: unknown) => {
    const denied = await failure(call(method, url, body, STAFF));
    expect(denied?.status).toBe(403);
    expect(denied?.message).toMatch(/เฉพาะผู้ดูแลระบบ/);
    expect(await statusOf(call(method, url, body))).not.toBe(403);
  });

  it('leaves day-to-day work open to users', async () => {
    expect(await statusOf(call('GET', 'categories', undefined, STAFF))).toBe(200);
    expect(await statusOf(call('GET', 'promotions', undefined, STAFF))).toBe(200);
    expect(await statusOf(call('GET', 'tax-invoices/buyer?taxId=1', undefined, STAFF))).toBe(200);
    // Receiving stock (P2 only blocks taking it out) and SKU edits (P1) stay open.
    const received = await call<Product>(
      'PUT',
      `products/${MOUSE}/stock`,
      { delta: 1, unitCost: 300, note: 'รับเข้า' },
      STAFF,
    );
    expect(received.stock).toBe(4);
    const sku = await call<Product>('GET', `products/${MOUSE}`, undefined, STAFF);
    expect(await statusOf(call('PUT', `products/${MOUSE}`, sku, STAFF))).toBe(200);
  });

  it('never lets an admin demote, deactivate or delete themselves', async () => {
    const me = { name: 'Admin', email: 'admin@example.com', role: 'admin', active: true };
    expect((await failure(call('PUT', 'users/1', { ...me, role: 'user' })))?.message).toBe(
      'ลดสิทธิ์ผู้ดูแลระบบของตัวเองไม่ได้',
    );
    expect((await failure(call('PUT', 'users/1', { ...me, active: false })))?.message).toBe(
      'ปิดใช้งานบัญชีของตัวเองไม่ได้',
    );
    expect((await failure(call('DELETE', 'users/1')))?.message).toBe('ลบบัญชีของตัวเองไม่ได้');
    expect(await statusOf(call('DELETE', 'users/4'))).toBe(200);
  });

  describe('void (P3)', () => {
    const sellMouse = async () => {
      // Without the shift rule, so the bill and the void need no open shift.
      const info = await call<StoreInfo>('GET', 'settings/store');
      await call('PUT', 'settings/store', { ...info, requireShift: false });
      return call<Sale>(
        'POST',
        'sales',
        {
          items: [{ productId: MOUSE, factor: 1, qty: 1, serial: null }],
          freeSerials: [],
          payments: [{ methodId: CASH, amount: 531, reference: '', installmentMonths: null }],
          customer: '',
          expectedTotal: 531,
        },
        STAFF,
      );
    };
    const voidAs = (sale: Sale, token?: string, approval?: unknown) =>
      call<Sale>('POST', `sales/${sale.id}/void`, { reason: 'คีย์ผิด', approval }, token);

    it("needs an admin's login typed at the terminal for a user", async () => {
      const sale = await sellMouse();
      expect(await failure(voidAs(sale, STAFF))).toEqual({
        status: 403,
        message: 'ยกเลิกบิลต้องให้ผู้ดูแลระบบอนุมัติ',
      });
      expect(await failure(voidAs(sale, STAFF, { username: 'admin', password: 'wrong' }))).toEqual({
        status: 400,
        message: 'รหัสผ่านผู้อนุมัติไม่ถูกต้อง',
      });
      expect(await failure(voidAs(sale, STAFF, { username: 'john', password: '1234' }))).toEqual({
        status: 400,
        message: 'ผู้อนุมัติต้องเป็นผู้ดูแลระบบ',
      });
      const voided = await voidAs(sale, STAFF, { username: 'admin', password: 'admin' });
      expect(voided).toMatchObject({
        status: 'cancelled',
        voidedBy: 'สมชาย ใจดี',
        voidApprovedBy: 'Admin',
      });
    });

    it('lets an admin void without approval', async () => {
      const sale = await sellMouse();
      expect(await voidAs(sale)).toMatchObject({
        status: 'cancelled',
        voidedBy: 'Admin',
        voidApprovedBy: null,
      });
    });
  });

  describe('shifts (P6)', () => {
    const shift = (
      id: number,
      terminalId: number,
      cashier: string,
      status: string,
      floatLeft = 0,
    ) => ({
      id,
      shiftNo: `SH-20261003-0${id}`,
      terminalId,
      cashier,
      status,
      openedAt: `2026-10-03T0${id}:00:00Z`,
      openingFloat: 1000,
      openingDenominations: [],
      closedAt: status === 'closed' ? `2026-10-03T0${id}:30:00Z` : null,
      closedBy: status === 'closed' ? cashier : null,
      counts: [],
      cashDenominations: [],
      depositAmount: 0,
      floatLeft,
      approvalStatus: 'not_needed',
      approvedBy: null,
      approvedAt: null,
      note: '',
    });

    beforeEach(() => {
      localStorage.setItem(
        'an22.mock.db',
        JSON.stringify({
          shiftsEnabled: true,
          shifts: [
            shift(1, 1, 'John Doe', 'closed', 300),
            shift(2, 2, 'สมชาย ใจดี', 'closed', 500),
            shift(3, 1, 'John Doe', 'open'),
          ],
        }),
      );
    });

    it('lists and reads only their own shifts for a user', async () => {
      const mine = await call<Shift[]>('GET', 'shifts', undefined, STAFF);
      expect(mine.map((s) => s.id)).toEqual([2]);
      expect((await call<Shift[]>('GET', 'shifts')).map((s) => s.id)).toEqual([3, 2, 1]);
      const rows = await call<VarianceReportRow[]>(
        'GET',
        'shifts/variance-report',
        undefined,
        STAFF,
      );
      expect(rows.every((r) => r.cashier === 'สมชาย ใจดี')).toBe(true);
      expect(await statusOf(call('GET', 'shifts/2/summary', undefined, STAFF))).toBe(200);
      for (const url of ['shifts/1', 'shifts/1/summary', 'shifts/1/movements']) {
        expect(await statusOf(call('GET', url, undefined, STAFF))).toBe(403);
      }
      expect(await statusOf(call('POST', 'shifts/3/count-check', { counts: [] }, STAFF))).toBe(403);
    });

    it("tells any cashier the float this terminal's last shift left", async () => {
      const at = (terminal: number) =>
        call<{ floatLeft: number }>('GET', 'shifts/last-float', undefined, STAFF, terminal);
      expect(await at(1)).toEqual({ floatLeft: 300 });
      expect(await at(2)).toEqual({ floatLeft: 500 });
      expect(await at(9)).toEqual({ floatLeft: 0 });
    });
  });
});

describe('mockBackendInterceptor – auth (B3)', () => {
  let http: HttpClient;
  const ADMIN = mockToken(1, 1);
  const STAFF = mockToken(1, 2); // สมชาย ใจดี (role user)

  // No `asAdminByDefault`: a request without a token must not be served as the admin.
  const call = <T>(method: string, url: string, body?: unknown, token?: string) => {
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, { body, headers }),
    );
  };
  const statusOf = (p: Promise<unknown>) =>
    p.then(
      () => 200,
      (e: { status: number }) => e.status,
    );

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('answers 401 to a missing, unknown or malformed token', async () => {
    expect(await statusOf(call('GET', 'products'))).toBe(401);
    expect(await statusOf(call('GET', 'products', undefined, 'garbage'))).toBe(401);
    expect(await statusOf(call('GET', 'products', undefined, mockToken(1, 999)))).toBe(401);
    expect(await statusOf(call('GET', 'products', undefined, 'x' + mockToken(1, 2)))).toBe(401);
    // another company / pre-SaaS tokens without a tenant (E1)
    expect(await statusOf(call('GET', 'products', undefined, mockToken(2, 1)))).toBe(401);
    expect(await statusOf(call('GET', 'products', undefined, 'mock-jwt-token'))).toBe(401);
    expect(await statusOf(call('GET', 'products', undefined, 'mock-jwt-token.u2'))).toBe(401);
    expect(await statusOf(call('GET', 'products', undefined, ADMIN))).toBe(200);
    expect(await statusOf(call('GET', 'products', undefined, STAFF))).toBe(200);
  });

  it('answers 401 once the user is deactivated', async () => {
    expect(await statusOf(call('GET', 'products', undefined, STAFF))).toBe(200);
    await call('PUT', 'users/2', { active: false }, ADMIN);
    expect(await statusOf(call('GET', 'products', undefined, STAFF))).toBe(401);
  });

  it("keeps login open and auth/verify at 400, checked in the token's company", async () => {
    const login = await call<LoginResponse>('POST', 'auth/login', {
      companyCode: 'demo',
      username: 'somchai',
      password: '1234',
    });
    expect('token' in login).toBe(false); // kept by the web server's session (E48)
    expect(sessionToken()).toBe(STAFF);
    await call('POST', 'auth/logout');
    expect(sessionToken()).toBeNull();
    const verify = (password: string, token?: string) =>
      statusOf(call('POST', 'auth/verify', { username: 'admin', password }, token));
    expect(await verify('x', ADMIN)).toBe(400);
    expect(await verify('admin', ADMIN)).toBe(200);
    expect(await verify('admin')).toBe(400); // no token = no company
  });

  it('logs in with company code + username + password, one message for every failure (E3)', async () => {
    const login = (companyCode: string, username: string, password: string) =>
      call<LoginResponse>('POST', 'auth/login', { companyCode, username, password });
    const failure = (p: Promise<unknown>) =>
      p.then(
        () => null,
        (e: { status: number; error: { message: string } }) => [e.status, e.error.message],
      );
    const wrong = [401, 'รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง'];
    expect(await failure(login('ACME', 'admin', 'admin'))).toEqual(wrong);
    expect(await failure(login('DEMO', 'nobody', '1234'))).toEqual(wrong);
    expect(await failure(login('DEMO', 'admin', '1234'))).toEqual(wrong);
    expect(await failure(login('DEMO', 'somying', '1234'))).toEqual(wrong); // deactivated

    const session = await login(' demo ', 'admin', 'admin');
    expect(session.company).toMatchObject({ id: 1, code: 'DEMO', active: true });
    expect(session.company.name).toBe(SEED_STORE_INFO.name);
    // seed: HQ + BN, the admin has every branch
    expect(session.branches.map((b) => [b.code, b.branchNo])).toEqual([
      ['HQ', '00000'],
      ['BN', '00001'],
    ]);
    const me = await call<MeResponse>('GET', 'me', undefined, sessionToken());
    expect(me).toEqual({
      user: session.user,
      company: session.company,
      branches: session.branches,
      billing: null,
      canSeeCost: true,
    });
  });

  it("checks X-Branch-Id: not sent passes (E2), a branch outside the user's rights is 403", async () => {
    const withBranch = (branch: string) =>
      statusOf(
        firstValueFrom(
          http.get('/api/products', {
            headers: { Authorization: `Bearer ${STAFF}`, 'X-Branch-Id': branch },
          }),
        ),
      );
    expect(await statusOf(call('GET', 'products', undefined, STAFF))).toBe(200);
    expect(await withBranch('1')).toBe(200);
    expect(await withBranch('2')).toBe(403);
    expect(await withBranch('x')).toBe(403);
    // `/me` still answers, so a client with a stale branch can recover.
    const me = await firstValueFrom(
      http.get<MeResponse>('/api/me', {
        headers: { Authorization: `Bearer ${STAFF}`, 'X-Branch-Id': '2' },
      }),
    );
    expect(me.branches.map((b) => b.id)).toEqual([1]);
  });

  it('refuses a suspended company only after a correct login', async () => {
    localStorage.setItem(
      'an22.mock.db',
      JSON.stringify({ companies: [{ id: 1, code: 'DEMO', active: false }] }),
    );
    const login = (password: string) =>
      call('POST', 'auth/login', { companyCode: 'DEMO', username: 'admin', password }).then(
        () => null,
        (e: { error: { message: string } }) => e.error.message,
      );
    expect(await login('x')).toBe('รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง');
    expect(await login('admin')).toBe(
      'บริษัทนี้ถูกผู้ให้บริการระงับการใช้งาน — เจ้าของบริษัทติดต่อผู้ให้บริการ',
    );
    expect(await statusOf(call('GET', 'products', undefined, ADMIN))).toBe(401);
  });
});

describe('mockBackendInterceptor – usernames (B5)', () => {
  let http: HttpClient;

  const call = <T>(method: string, url: string, body?: unknown) =>
    firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, { body }),
    );
  const errorOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { error: { message: string } }) => e.error.message,
    );
  const newUser = (username: string, email = '', extra: Record<string, unknown> = {}) =>
    call<User>('POST', 'users', {
      username,
      name: 'ทดสอบ',
      email,
      role: 'user',
      active: true,
      branchIds: [1],
      allBranches: false,
      password: '5678',
      ...extra,
    });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('keeps usernames and e-mails unique and stores them normalized', async () => {
    expect(await errorOf(newUser('SomChai'))).toBe('ชื่อผู้ใช้นี้มีอยู่แล้ว');
    expect(await errorOf(newUser('ab'))).toBe('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9, . _ - ยาว 3–30 ตัว');
    expect(await errorOf(newUser('somsak', 'JOHN@example.com'))).toBe(
      'อีเมลนี้มีผู้ใช้อื่นใช้แล้ว',
    );
    const user = await newUser(' SomSak ');
    expect(user).toMatchObject({ username: 'somsak', email: '' });
    expect(await errorOf(call('PUT', `users/${user.id}`, { username: 'john' }))).toBe(
      'ชื่อผู้ใช้นี้มีอยู่แล้ว',
    );
    const login = await call<LoginResponse>('POST', 'auth/login', {
      companyCode: 'DEMO',
      username: 'somsak',
      password: '5678',
    });
    expect(login.user.id).toBe(user.id);
  });

  it('gives users stored before usernames one from their e-mail (E4)', async () => {
    const legacy = (id: number, email: string) => ({
      id,
      name: `u${id}`,
      email,
      role: id === 1 ? 'admin' : 'user',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
    });
    localStorage.setItem(
      'an22.mock.db',
      JSON.stringify({
        users: [
          legacy(1, 'boss@example.com'),
          legacy(2, 'nok@example.com'),
          legacy(3, 'nok@other.com'),
          legacy(4, 'x@y.com'),
        ],
      }),
    );
    const users = await call<User[]>('GET', 'users');
    expect(users.map((u) => u.username)).toEqual(['admin', 'nok', 'nok-3', 'user4']);
    // E9: admins get every branch, the others the first one
    expect(users.map((u) => [u.allBranches, u.branchIds])).toEqual([
      [true, []],
      [false, [1]],
      [false, [1]],
      [false, [1]],
    ]);
  });

  it('needs branch rights and a password for a new user; admins set new passwords (E10)', async () => {
    expect(await errorOf(newUser('somsak', '', { branchIds: [] }))).toBe(
      'กรุณาเลือกสาขาอย่างน้อย 1 สาขา',
    );
    expect(await errorOf(newUser('somsak', '', { branchIds: [9] }))).toBe(
      'สาขาที่เลือกไม่มีอยู่หรือปิดใช้งานแล้ว',
    );
    expect(await errorOf(newUser('somsak', '', { password: '12' }))).toBe(
      'รหัสผ่านต้องมีอย่างน้อย 4 ตัว',
    );
    const user = await newUser('somsak');
    expect(user).not.toHaveProperty('password');
    const login = (password: string) =>
      call<LoginResponse>('POST', 'auth/login', {
        companyCode: 'DEMO',
        username: 'somsak',
        password,
      });
    expect((await login('5678')).branches.map((b) => b.id)).toEqual([1]);

    expect(await errorOf(call('PUT', `users/${user.id}/password`, { password: ' x' }))).toBe(
      'รหัสผ่านต้องไม่ขึ้นต้นหรือลงท้ายด้วยช่องว่าง',
    );
    await call('PUT', `users/${user.id}/password`, { password: 'abcd' });
    expect(await errorOf(login('5678'))).toBe('รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง');
    expect((await login('abcd')).user.id).toBe(user.id);
    // the seed passwords still work until changed
    await call('PUT', 'users/2/password', { password: '9999' });
    expect(
      await errorOf(
        call('POST', 'auth/login', { companyCode: 'DEMO', username: 'somchai', password: '1234' }),
      ),
    ).toBe('รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง');
  });

  it('keeps a branch admin to users of their own branches (E6)', async () => {
    const boss = await newUser('boss', '', { role: 'admin' });
    const asBoss = (method: string, url: string, body?: unknown) =>
      firstValueFrom(
        http.request(method, `/api/${method === 'GET' ? withRange(url) : url}`, {
          body,
          headers: { Authorization: `Bearer ${mockToken(1, boss.id)}` },
        }),
      ).then(
        () => null,
        (e: { status: number; error: { message: string } }) => [e.status, e.error.message],
      );
    const notMine = [403, 'จัดการผู้ใช้ของสาขาอื่นหรือทุกสาขาได้เฉพาะผู้ดูแลระบบระดับบริษัท'];
    expect(await asBoss('PUT', 'users/1/password', { password: 'hack' })).toEqual(notMine);
    expect(await asBoss('PUT', 'users/1', { name: 'x' })).toEqual(notMine);
    expect(await asBoss('PUT', 'users/2', { allBranches: true })).toEqual([
      403,
      'ให้สิทธิ์ทุกสาขาหรือสาขาที่ตัวเองไม่มีได้เฉพาะผู้ดูแลระบบระดับบริษัท',
    ]);
    expect(await asBoss('PUT', 'users/2/password', { password: '4321' })).toBeNull();
    expect(await asBoss('PUT', 'users/2', { name: 'สมชาย' })).toBeNull();
  });
});

describe('mockBackendInterceptor – company / branch settings (E11)', () => {
  let http: HttpClient;
  const call = <T>(
    method: string,
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, { body, headers }),
    );
  const failure = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => [e.status, e.error.message],
    );

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('prints each branch with the company details (storeInfo = company + branch)', async () => {
    const hq = await call<StoreInfo>('GET', 'settings/store', undefined, { 'X-Branch-Id': '1' });
    const bn = await call<StoreInfo>('GET', 'settings/store', undefined, { 'X-Branch-Id': '2' });
    expect(hq).toMatchObject({ name: SEED_STORE_INFO.name, branchType: 'head', branchNo: '' });
    expect(bn).toMatchObject({
      name: SEED_STORE_INFO.name,
      branchType: 'branch',
      branchNo: '00001',
    });
    expect(bn.address).toContain('บางนา');
    expect(localStorage.getItem('an22.mock.db')).not.toContain('"storeInfo"');
  });

  it('edits company settings, the current branch and the branch list', async () => {
    const company = await call<CompanyInfo>('GET', 'settings/company');
    await call('PUT', 'settings/company', { ...company, exchangeDays: 14 });
    expect((await call<StoreInfo>('GET', 'settings/store')).exchangeDays).toBe(14);
    expect(await failure(call('PUT', 'settings/company', { ...company, name: '' }))).toEqual([
      400,
      'กรุณากรอกชื่อร้าน',
    ]);

    await call('PUT', 'settings/branch', { receiptFooter: 'ขอบคุณ BN' }, { 'X-Branch-Id': '2' });
    const bn = await call<StoreInfo>('GET', 'settings/store', undefined, { 'X-Branch-Id': '2' });
    expect(bn.receiptFooter).toBe('ขอบคุณ BN');

    const branch = await call<Branch>('POST', 'branches', {
      code: 'cm1',
      name: 'สาขาเชียงใหม่',
      branchNo: '00002',
      address: 'เชียงใหม่',
    });
    expect(branch).toMatchObject({
      id: 3,
      code: 'CM1',
      active: true,
      receiptFooter: 'ขอบคุณที่ใช้บริการ',
    });
    expect(await failure(call('POST', 'branches', { ...branch, code: 'X2' }))).toEqual([
      400,
      'เลขที่สาขานี้มีอยู่แล้ว',
    ]);
    await call('PUT', 'branches/3', { active: false });
    expect((await call<Branch[]>('GET', 'branches')).map((b) => b.active)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('keeps company-level work to company admins (E6)', async () => {
    const boss = await call<User>('POST', 'users', {
      username: 'boss',
      name: 'ผู้จัดการบางนา',
      email: '',
      role: 'admin',
      active: true,
      branchIds: [2],
      allBranches: false,
      password: '5678',
    });
    const asBoss = (method: string, url: string, body?: unknown, branch = '2') =>
      failure(
        call(method, url, body, {
          Authorization: `Bearer ${mockToken(1, boss.id)}`,
          'X-Branch-Id': branch,
        }),
      );
    const companyOnly = [403, 'ทำได้เฉพาะผู้ดูแลระบบระดับบริษัท (ทุกสาขา)'];
    const company = await call<CompanyInfo>('GET', 'settings/company');
    expect(await asBoss('PUT', 'settings/company', company)).toEqual(companyOnly);
    expect(await asBoss('PUT', 'branches/2', { name: 'x' })).toEqual(companyOnly);
    expect(await asBoss('POST', 'branches', {})).toEqual(companyOnly);
    // their own branch's details: yes; another branch: refused by X-Branch-Id
    expect(await asBoss('PUT', 'settings/branch', { phone: '02-000-0000' })).toBeNull();
    expect(await asBoss('PUT', 'settings/branch', { phone: '1' }, '1')).toEqual([
      403,
      'ไม่มีสิทธิ์ทำงานในสาขานี้',
    ]);
  });

  it('lets only company admins limit promotions to branches (D2 / E6)', async () => {
    const promotion = {
      code: 'BN-ONLY',
      name: 'ลดเฉพาะบางนา',
      note: '',
      type: 'item_discount',
      startDate: '2999-01-01',
      endDate: null,
      enabled: true,
      priority: 1,
      stackable: false,
      scope: { all: true, productIds: [], categoryIds: [] },
      minQty: 1,
      minAmount: 0,
      discount: { kind: 'percent', value: 10, maxDiscount: null },
      freeGoods: null,
      branchIds: [2],
    };
    const boss = await call<User>('POST', 'users', {
      username: 'boss',
      name: 'ผู้จัดการบางนา',
      email: '',
      role: 'admin',
      active: true,
      branchIds: [2],
      allBranches: false,
      password: '5678',
    });
    const asBoss = (method: string, url: string, body?: unknown) =>
      failure(
        call(method, url, body, {
          Authorization: `Bearer ${mockToken(1, boss.id)}`,
          'X-Branch-Id': '2',
        }),
      );
    const companyOnly = [403, 'โปรที่จำกัดสาขาสร้าง / แก้ได้เฉพาะผู้ดูแลระบบระดับบริษัท'];
    expect(await asBoss('POST', 'promotions', promotion)).toEqual(companyOnly);
    expect(await failure(call('POST', 'promotions', { ...promotion, branchIds: [9] }))).toEqual([
      400,
      'สาขาที่เลือกไม่มีอยู่หรือปิดใช้งานแล้ว',
    ]);
    const created = await call<Promotion>('POST', 'promotions', promotion);
    expect(created.branchIds).toEqual([2]);
    expect(
      await asBoss('PUT', `promotions/${created.id}`, { ...promotion, branchIds: [] }),
    ).toEqual(companyOnly);
    expect(await asBoss('DELETE', `promotions/${created.id}`)).toEqual(companyOnly);
    // an all-branch promotion stays an admin's (E6 keeps the old admin rights)
    expect(
      await asBoss('POST', 'promotions', { ...promotion, code: 'ALL', branchIds: [] }),
    ).toBeNull();
  });

  it('splits an older stored store into company settings + branch details once', async () => {
    localStorage.setItem(
      'an22.mock.db',
      JSON.stringify({
        storeInfo: {
          ...SEED_STORE_INFO,
          name: 'ร้านเก่า',
          address: 'ที่อยู่เก่า',
          exchangeDays: 3,
        },
        branches: [{ id: 1, code: 'HQ', name: 'หน้าร้าน', branchNo: '00000', active: true }],
      }),
    );
    expect(await call<Branch[]>('GET', 'branches')).toEqual([
      expect.objectContaining({ code: 'HQ', name: 'หน้าร้าน', address: 'ที่อยู่เก่า' }),
    ]);
    expect(await call<CompanyInfo>('GET', 'settings/company')).toMatchObject({
      name: 'ร้านเก่า',
      exchangeDays: 3,
    });
  });
});

describe('mockBackendInterceptor – menu access', () => {
  let http: HttpClient;
  const STAFF = mockToken(1, 2);

  const call = <T>(method: string, body?: unknown, token = mockToken(1, 1)) =>
    firstValueFrom(
      http.request<T>(method, '/api/settings/menu-access', {
        body,
        headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
      }),
    );
  const statusOf = (p: Promise<unknown>) =>
    p.then(
      () => 200,
      (e: { status: number }) => e.status,
    );

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('defaults to cashier menus, also for a db stored before the setting existed', async () => {
    localStorage.setItem('an22.mock.db', JSON.stringify({ users: undefined }));
    expect(await call<MenuAccess>('GET', undefined, STAFF)).toEqual({
      userMenus: ['dashboard', 'pos', 'sales', 'settings'],
    });
  });

  it('lets only admins change it, in menu order, by the shared rule', async () => {
    expect(await statusOf(call('PUT', { userMenus: ['pos'] }, STAFF))).toBe(403);
    expect(await statusOf(call('PUT', { userMenus: [] }))).toBe(400);
    expect(await statusOf(call('PUT', { userMenus: ['users'] }))).toBe(400);
    const saved = await call<MenuAccess>('PUT', { userMenus: ['inventory', 'pos'] });
    expect(saved.userMenus).toEqual(['pos', 'inventory']);
    expect(await call<MenuAccess>('GET', undefined, STAFF)).toEqual(saved);
  });
});

/** SaaS step 3: stock, average cost and reorder levels per branch (D1, E13, E17, E18). */
describe('mockBackendInterceptor – branch stock', () => {
  let http: HttpClient;
  const NOTEBOOK = 1; // seed: serial, HQ 12 units, BN 2 sample units at 20,500
  const MOUSE = 2; // seed: HQ 3 at 350 (min 10 / max 40), BN 8 at 380 (min 5 / max 20)
  const HQ = '1';
  const BN = '2';

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  const call = <T>(method: string, url: string, branch = HQ, body?: unknown) =>
    firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, {
        body,
        headers: new HttpHeaders({ 'X-Branch-Id': branch }),
      }),
    );
  const errorOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => [e.status, e.error.message],
    );
  const product = (id: number, branch = HQ) => call<Product>('GET', `products/${id}`, branch);

  it('moves stored store-wide stock into the first branch, once', async () => {
    // Stored before step 2: one branch (HQ) is made from the store details.
    localStorage.setItem(
      'an22.mock.db',
      JSON.stringify({
        products: [
          {
            ...PRODUCT_DEFAULTS,
            id: 50,
            sku: 'OLD-1',
            name: 'old',
            stock: 7,
            avgCost: 120,
            minStock: 3,
            maxStock: 9,
          },
        ],
        movements: [],
      }),
    );
    expect(await product(50)).toEqual(
      expect.objectContaining({ stock: 7, avgCost: 120, minStock: 3, maxStock: 9 }),
    );
    const card = await call<StockCardResult>('GET', 'products/50/movements');
    expect(card.closing).toEqual({ qty: 7, avgCost: 120, value: 840 });
    // Stored products no longer carry stock fields; the branch rows do.
    const stored = JSON.parse(localStorage.getItem('an22.mock.db')!);
    expect(stored.products[0].stock).toBeUndefined();
    expect(stored.branchStock).toEqual([
      { branchId: 1, productId: 50, stock: 7, avgCost: 120, minStock: 3, maxStock: 9 },
    ]);
  });

  it('keeps a moving average per branch: receiving at BN leaves HQ alone (D1)', async () => {
    expect(await product(MOUSE)).toEqual(expect.objectContaining({ stock: 3, avgCost: 350 }));
    expect(await product(MOUSE, BN)).toEqual(
      expect.objectContaining({ stock: 8, avgCost: 380, minStock: 5, maxStock: 20 }),
    );
    const received = await call<Product>('PUT', `products/${MOUSE}/stock`, BN, {
      delta: 2,
      unitCost: 400,
    });
    expect(received).toEqual(expect.objectContaining({ stock: 10, avgCost: 384 }));
    expect(await product(MOUSE)).toEqual(expect.objectContaining({ stock: 3, avgCost: 350 }));
    const bnCard = await call<StockCardResult>('GET', `products/${MOUSE}/movements`, BN);
    expect(bnCard.closing).toEqual({ qty: 10, avgCost: 384, value: 3840 });
    expect(bnCard.movements.every((m) => m.branchId === 2)).toBe(true);
    const hqCard = await call<StockCardResult>('GET', `products/${MOUSE}/movements`);
    expect(hqCard.closing.qty).toBe(3);
    // The notebook's BN units are its own serials.
    expect(await product(NOTEBOOK, BN)).toEqual(
      expect.objectContaining({ stock: 2, avgCost: 20500 }),
    );
    expect((await product(NOTEBOOK)).stock).toBe(12);
  });

  it('edits the reorder levels of the request branch only (E13)', async () => {
    const atBn = await product(MOUSE, BN);
    const saved = await call<Product>('PUT', `products/${MOUSE}`, BN, {
      ...atBn,
      minStock: 7,
      maxStock: 30,
    });
    expect(saved).toEqual(expect.objectContaining({ minStock: 7, maxStock: 30, stock: 8 }));
    expect(await product(MOUSE)).toEqual(expect.objectContaining({ minStock: 10, maxStock: 40 }));
    expect(await product(MOUSE, BN)).toEqual(expect.objectContaining({ minStock: 7 }));
  });

  it('refuses stock writes without a branch, reads fall back to the first (E17)', async () => {
    const noBranch = 'none';
    expect(
      await errorOf(call('PUT', `products/${MOUSE}/stock`, noBranch, { delta: 1, unitCost: 1 })),
    ).toEqual([400, 'ไม่ได้เลือกสาขา กรุณาเลือกสาขาที่ทำงานก่อน']);
    expect((await product(MOUSE, noBranch)).stock).toBe(3);
  });

  it('lists every branch: quantities for all, average cost for admins only (E14)', async () => {
    expect(await call<BranchStockRow[]>('GET', `products/${MOUSE}/branch-stock`)).toEqual([
      { branchId: 1, stock: 3, avgCost: 350 },
      { branchId: 2, stock: 8, avgCost: 380 },
    ]);
    expect(await call<BranchStockRow[]>('GET', `products/${NOTEBOOK}/branch-stock`, BN)).toEqual([
      expect.objectContaining({ branchId: 1, stock: 12 }),
      { branchId: 2, stock: 2, avgCost: 20500 },
    ]);
    const staff = await firstValueFrom(
      http.get<BranchStockRow[]>(`/api/products/${MOUSE}/branch-stock`, {
        headers: { Authorization: `Bearer ${mockToken(1, 2)}`, 'X-Branch-Id': HQ },
      }),
    );
    expect(staff).toEqual([
      { branchId: 1, stock: 3, avgCost: null },
      { branchId: 2, stock: 8, avgCost: null },
    ]);
  });

  it('shows the stock card of another branch only to users of that branch (E15)', async () => {
    const card = await call<StockCardResult>('GET', `products/${MOUSE}/movements?branchId=2`);
    expect(card.closing).toEqual({ qty: 8, avgCost: 380, value: 3040 });
    const asStaff = http.get(`/api/${withRange(`products/${MOUSE}/movements?branchId=2`)}`, {
      headers: { Authorization: `Bearer ${mockToken(1, 2)}`, 'X-Branch-Id': HQ },
    });
    expect(await errorOf(firstValueFrom(asStaff))).toEqual([
      403,
      'ไม่มีสิทธิ์ดูบัตรสต็อกของสาขานี้',
    ]);
  });

  it('checks the stock of every branch before deleting a SKU (E18)', async () => {
    expect(await errorOf(call('DELETE', `products/${MOUSE}`))).toEqual([
      400,
      'ยังมีสต็อกคงเหลือ (สาขา HQ, BN) ลบไม่ได้',
    ]);
    await call('PUT', `products/${MOUSE}/stock`, HQ, { delta: -3 });
    expect(await errorOf(call('DELETE', `products/${MOUSE}`))).toEqual([
      400,
      'ยังมีสต็อกคงเหลือ (สาขา BN) ลบไม่ได้',
    ]);
  });
});

/** SaaS step 3: serials and documents belong to a branch (E12, E16). */
describe('mockBackendInterceptor – selling per branch', () => {
  let http: HttpClient;
  const NOTEBOOK = 1; // serial: HQ 12 units, BN 2
  const MOUSE = 2; // HQ 3 at 350, BN 8 at 380
  const CASH = 1;
  /** Branch + its POS terminal (seed: terminals 1–2 at HQ, 3 at BN) */
  const HQ = { branch: '1', terminal: '1' };
  const BN = { branch: '2', terminal: '3' };
  type At = typeof HQ;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 17, 10, 0));
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
    // Selling itself is under test here; shifts have their own describe.
    const company = await call<CompanyInfo>('GET', 'settings/company');
    await call('PUT', 'settings/company', HQ, { ...company, requireShift: false });
  });
  afterEach(() => vi.useRealTimers());

  function call<T>(method: string, url: string, at: At = HQ, body?: unknown): Promise<T> {
    const headers = new HttpHeaders({ 'X-Branch-Id': at.branch, 'X-Terminal-Id': at.terminal });
    return firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, { body, headers }),
    );
  }
  const errorOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { error: { message: string } }) => e.error.message,
    );
  const serials = (at: At) => call<SerialNumber[]>('GET', `products/${NOTEBOOK}/serials`, at);
  const product = (id: number, at: At) => call<Product>('GET', `products/${id}`, at);
  /** One unit, priced like the POS does (`priceCart()` with the branch's promotions), paid in cash. */
  async function sell(at: At, productId: number, serial: string | null = null): Promise<Sale> {
    const items = [{ productId, factor: 1, qty: 1, serial }];
    const cart = priceCart(items, {
      products: await call<Product[]>('GET', 'products', at),
      promotions: await call<Promotion[]>('GET', 'promotions', at),
      categories: await call<Category[]>('GET', 'categories', at),
      date: todayIso(),
      vatRegistered: true,
      branchId: Number(at.branch),
    });
    const cash = Math.ceil(cart.total);
    return call<Sale>('POST', 'sales', at, {
      items,
      freeSerials: [],
      customer: '',
      expectedTotal: cart.total,
      payments: [{ methodId: CASH, amount: cash, reference: '', installmentMonths: null }],
    });
  }

  it('lists and sells only the serials of the branch (E16)', async () => {
    const atBn = await serials(BN);
    expect(atBn).toHaveLength(2);
    expect(atBn.every((s) => s.branchId === 2 && s.status === 'in_stock')).toBe(true);
    const [hqUnit] = await serials(HQ);
    expect(hqUnit.branchId).toBe(1);
    expect(await errorOf(sell(BN, NOTEBOOK, hqUnit.serial))).toBe(
      `ซีเรียล ${hqUnit.serial} อยู่ที่สาขา HQ — ขายที่สาขานี้ไม่ได้`,
    );
    expect(
      await errorOf(
        call('POST', `products/${NOTEBOOK}/serials`, BN, { serials: [hqUnit.serial], unitCost: 1 }),
      ),
    ).toBe(`รับเข้าไม่ได้ — ${hqUnit.serial}: อยู่ในคลังสาขา HQ`);
    expect(
      await errorOf(
        call('POST', `products/${NOTEBOOK}/serials/remove`, BN, {
          ids: [hqUnit.id],
          status: 'other',
          note: '',
        }),
      ),
    ).toBe('มี Serial ที่ไม่อยู่ในคลังแล้ว กรุณาโหลดใหม่');
  });

  it('sells and voids at BN out of / back into BN stock only; HQ cannot void it (E12, D3)', async () => {
    const sale = await sell(BN, MOUSE);
    expect(sale).toMatchObject({ branchId: 2, orderNo: 'POS-BN-3-20261017-0001' });
    expect(sale.lines[0].cogs).toBe(380);
    expect((await product(MOUSE, BN)).stock).toBe(7);
    expect((await product(MOUSE, HQ)).stock).toBe(3);
    expect(
      await errorOf(call('POST', `sales/${sale.id}/void`, HQ, { reason: 'ลูกค้าเปลี่ยนใจ' })),
    ).toBe('บิลนี้ขายที่สาขา BN — ยกเลิกได้ที่สาขานั้น');
    await call('POST', `sales/${sale.id}/void`, BN, { reason: 'ลูกค้าเปลี่ยนใจ' });
    expect(await product(MOUSE, BN)).toEqual(expect.objectContaining({ stock: 8, avgCost: 380 }));
    const card = await call<StockCardResult>('GET', `products/${MOUSE}/movements`, BN);
    expect(card.movements.map((m) => [m.type, m.qty, m.branchId])).toEqual([
      ['issue', -1, 2],
      ['receive', 1, 2],
    ]);
    expect((await call<StockCardResult>('GET', `products/${MOUSE}/movements`)).movements).toEqual(
      [],
    );
  });

  it('numbers documents per branch; a later invoice takes the branch of its bill (E21)', async () => {
    const atBn = await sell(BN, MOUSE);
    const atHq = await sell(HQ, NOTEBOOK, (await serials(HQ))[0].serial);
    expect([atBn.orderNo, atHq.orderNo]).toEqual([
      'POS-BN-3-20261017-0001',
      'POS-HQ-1-20261017-0001',
    ]);
    const buyer = {
      name: 'บริษัท ลูกค้า จำกัด',
      taxId: '0105550123451',
      branchType: 'head',
      branchNo: '',
      address: 'กรุงเทพฯ',
    };
    const invoice = await call<TaxInvoice>('POST', `sales/${atBn.id}/tax-invoice`, HQ, { buyer });
    expect(invoice).toMatchObject({ invoiceNo: 'INV-BN-20261017-0001', branchId: 2 });
  });

  it('lists the working branch by default, another or all only within the rights (E23)', async () => {
    const atBn = await sell(BN, MOUSE);
    const atHq = await sell(HQ, NOTEBOOK, (await serials(HQ))[0].serial);
    const ids = (list: Sale[]) => list.filter((x) => x.lines.length).map((x) => x.id);
    expect(ids(await call<Sale[]>('GET', 'sales'))).toEqual([atHq.id]);
    expect(ids(await call<Sale[]>('GET', 'sales?branchId=2'))).toEqual([atBn.id]);
    expect(ids(await call<Sale[]>('GET', 'sales?branchId=all')).sort()).toEqual([atBn.id, atHq.id]);
    const asStaff = (url: string) =>
      errorOf(
        firstValueFrom(
          http.get(`/api/${withRange(url)}`, {
            headers: { Authorization: `Bearer ${mockToken(1, 2)}`, 'X-Branch-Id': '1' },
          }),
        ),
      );
    expect(await asStaff('sales?branchId=2')).toBe('ไม่มีสิทธิ์ดูข้อมูลของสาขานี้');
    expect(await asStaff('shifts?branchId=all')).toBe('ดูทุกสาขาได้เฉพาะผู้ดูแลระบบระดับบริษัท');
    expect(await asStaff('sales')).toBeNull();
  });

  it('returns a serial sold at BN into BN stock on void', async () => {
    const [unit] = await serials(BN);
    const sale = await sell(BN, NOTEBOOK, unit.serial);
    expect((await product(NOTEBOOK, BN)).stock).toBe(1);
    await call('POST', `sales/${sale.id}/void`, BN, { reason: 'x' });
    expect((await serials(BN)).find((s) => s.id === unit.id)).toMatchObject({
      status: 'in_stock',
      branchId: 2,
    });
    expect((await product(NOTEBOOK, BN)).stock).toBe(2);
    expect((await product(NOTEBOOK, HQ)).stock).toBe(12);
  });

  it('moves a serial by issuing it at HQ and receiving it at BN (E16, before transfers)', async () => {
    const [unit] = await serials(HQ);
    await call('POST', `products/${NOTEBOOK}/serials/remove`, HQ, {
      ids: [unit.id],
      status: 'other',
      note: 'ย้ายไป BN',
    });
    const { received, fromOtherBranch } = await call<SerialReceiveResult>(
      'POST',
      `products/${NOTEBOOK}/serials`,
      BN,
      { serials: [unit.serial], unitCost: unit.cost, note: 'ย้ายจาก HQ' },
    );
    expect(received[0]).toMatchObject({ id: unit.id, branchId: 2, status: 'in_stock' });
    // The screen suggests a transfer next time (E32).
    expect(fromOtherBranch).toEqual([{ serial: unit.serial, branchCode: 'HQ' }]);
    expect((await product(NOTEBOOK, HQ)).stock).toBe(11);
    expect((await product(NOTEBOOK, BN)).stock).toBe(3);
    expect((await serials(HQ)).some((s) => s.id === unit.id)).toBe(false);
  });
});

/** SaaS step 4: every document belongs to a branch (E20, E24, E25). */
describe('mockBackendInterceptor – documents per branch', () => {
  let http: HttpClient;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 18, 10, 0));
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });
  afterEach(() => vi.useRealTimers());

  const call = <T>(method: string, url: string, branch = '1', terminal = '1', body?: unknown) =>
    firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, {
        body,
        headers: new HttpHeaders({ 'X-Branch-Id': branch, 'X-Terminal-Id': terminal }),
      }),
    );
  const errorOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => [e.status, e.error.message],
    );

  it('gives older documents the branch of their terminal, once (E20)', async () => {
    await call('GET', 'me');
    const db = JSON.parse(localStorage.getItem('an22.mock.db')!);
    delete db.docBranchFixed;
    // Stored by step 3: every older document went to the first branch.
    db.sales.push({
      id: 90,
      orderNo: 'POS3-20261016-0001',
      date: new Date(2026, 9, 16).toISOString(),
      total: 100,
      status: 'paid',
      terminalId: 3,
      branchId: 1,
    });
    db.taxInvoices.push({
      id: 90,
      invoiceNo: 'INV-20261016-0001',
      saleId: 90,
      orderNo: 'POS3-20261016-0001',
      date: new Date(2026, 9, 16).toISOString(),
      buyer: {},
    });
    db.shifts.push({
      id: 90,
      shiftNo: 'SH-20261016-01',
      terminalId: 3,
      cashier: 'x',
      openedAt: new Date(2026, 9, 16).toISOString(),
      branchId: 1,
    });
    localStorage.setItem('an22.mock.db', JSON.stringify(db));
    expect((await call<Sale>('GET', 'sales/90')).branchId).toBe(2);
    const stored = JSON.parse(localStorage.getItem('an22.mock.db')!);
    expect(stored.taxInvoices.find((t: TaxInvoice) => t.id === 90).branchId).toBe(2);
    expect(stored.shifts.find((s: Shift) => s.id === 90).branchId).toBe(2);
    expect(stored.docBranchFixed).toBe(true);
  });

  it('answers the seller details of the branch of a document (E22)', async () => {
    const here = await call<StoreInfo>('GET', 'settings/store');
    const bn = await call<StoreInfo>('GET', 'settings/store?branchId=2');
    expect(here.branchType).toBe('head');
    expect(bn).toMatchObject({
      branchType: 'branch',
      branchNo: '00001',
      placeName: 'ร้านไอทีดี คอมพิวเตอร์ สาขาบางนา',
    });
    expect(bn.name).toBe(here.name);
    expect(await errorOf(call('GET', 'settings/store?branchId=9'))).toEqual([404, 'ไม่พบสาขา']);
  });

  it('opens a shift in the terminal branch and refuses shift writes without a branch (E24)', async () => {
    const open = { terminalId: 3, openingFloat: 0, openingDenominations: [] };
    expect(await errorOf(call('POST', 'shifts/open', 'none', '3', open))).toEqual([
      400,
      'ไม่ได้เลือกสาขา กรุณาเลือกสาขาที่ทำงานก่อน',
    ]);
    const shift = await call<Shift>('POST', 'shifts/open', '2', '3', open);
    expect(shift.branchId).toBe(2);
  });
});

/** SaaS step 5: transfers between branches (E26–E29). */
describe('mockBackendInterceptor – transfers', () => {
  let http: HttpClient;
  const NOTEBOOK = 1; // serial: HQ 12 units
  const KEYBOARD = 3; // HQ 18 at 1,650 · BN 4 at 1,600
  const HQ = '1';
  const BN = '2';

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 18, 10, 0));
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });
  afterEach(() => vi.useRealTimers());

  const call = <T>(method: string, url: string, branch = HQ, body?: unknown, token?: string) => {
    let headers = new HttpHeaders({ 'X-Branch-Id': branch });
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);
    return firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, { body, headers }),
    );
  };
  const errorOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => [e.status, e.error.message],
    );
  const product = (id: number, branch: string) => call<Product>('GET', `products/${id}`, branch);
  const serialsAt = (branch: string) =>
    call<SerialNumber[]>('GET', `products/${NOTEBOOK}/serials`, branch);
  async function send(): Promise<Transfer> {
    const [unit] = (await serialsAt(HQ)).filter((s) => s.status === 'in_stock');
    return call<Transfer>('POST', 'transfers', HQ, {
      toBranchId: 2,
      note: 'เติมของสาขาบางนา',
      lines: [
        { productId: KEYBOARD, qty: 3, serials: [] },
        { productId: NOTEBOOK, qty: 1, serials: [unit.serial] },
      ],
    });
  }

  it('sends from HQ at its cost; serials are in transit and sold by neither branch', async () => {
    const t = await send();
    expect(t).toMatchObject({ transferNo: 'TR-HQ-20261018-0001', status: 'in_transit' });
    expect(t.lines[0]).toMatchObject({ sku: 'KB-020', qty: 3, unitCost: 1650, receivedQty: null });
    expect((await product(KEYBOARD, HQ)).stock).toBe(15);
    expect((await product(NOTEBOOK, HQ)).stock).toBe(11);
    const serial = t.lines[1].serials[0];
    expect((await serialsAt(HQ)).find((s) => s.serial === serial)?.status).toBe('in_transit');
    expect((await serialsAt(BN)).some((s) => s.serial === serial)).toBe(false);
    const card = await call<StockCardResult>('GET', `products/${KEYBOARD}/movements`, HQ);
    expect(card.movements.at(-1)).toMatchObject({ type: 'transfer_out', qty: -3, unitCost: 1650 });
    // Seen from both branches.
    expect((await call<Transfer[]>('GET', 'transfers?direction=in', BN)).map((x) => x.id)).toEqual([
      t.id,
    ]);
    expect(await call<Transfer[]>('GET', 'transfers?direction=in', HQ)).toEqual([]);
  });

  it('receives at BN: all in at the transfer cost, the shortfall written off there (E27 / E28)', async () => {
    const t = await send();
    const serial = t.lines[1].serials[0];
    const short = {
      lines: [
        { productId: KEYBOARD, receivedQty: 2, receivedSerials: [] },
        { productId: NOTEBOOK, receivedQty: 1, receivedSerials: [serial] },
      ],
      shortReason: '',
    };
    expect(await errorOf(call('POST', `transfers/${t.id}/receive`, HQ, short))).toEqual([
      400,
      'รับของได้ที่สาขาปลายทางเท่านั้น',
    ]);
    expect(await errorOf(call('POST', `transfers/${t.id}/receive`, BN, short))).toEqual([
      400,
      'กรุณาระบุเหตุผลของสินค้าที่ขาด / เสียหาย',
    ]);
    const received = await call<Transfer>('POST', `transfers/${t.id}/receive`, BN, {
      ...short,
      shortReason: 'กล่องแตก 1 ชิ้น',
    });
    expect(received).toMatchObject({ status: 'received', shortReason: 'กล่องแตก 1 ชิ้น' });
    // BN: 4 at 1,600 + 3 at 1,650 → average 1,621.4286; one written off.
    expect(await product(KEYBOARD, BN)).toEqual(
      expect.objectContaining({ stock: 6, avgCost: 1621.4286 }),
    );
    const card = await call<StockCardResult>('GET', `products/${KEYBOARD}/movements`, BN);
    expect(card.movements.map((m) => [m.type, m.qty])).toEqual([
      ['transfer_in', 3],
      ['issue', -1],
    ]);
    expect((await serialsAt(BN)).find((s) => s.serial === serial)?.status).toBe('in_stock');
    expect((await product(NOTEBOOK, BN)).stock).toBe(3);
  });

  it('cancels only at the source by an admin; goods go back at the same cost (E29)', async () => {
    const t = await send();
    expect(
      await errorOf(call('POST', `transfers/${t.id}/cancel`, BN, { reason: 'ส่งผิด' })),
    ).toEqual([400, 'ยกเลิกได้ที่สาขาต้นทางเท่านั้น']);
    expect(
      await errorOf(
        call('POST', `transfers/${t.id}/cancel`, HQ, { reason: 'ส่งผิด' }, mockToken(1, 2)),
      ),
    ).toEqual([403, 'ยกเลิกใบโอนได้เฉพาะผู้ดูแลระบบ']);
    const cancelled = await call<Transfer>('POST', `transfers/${t.id}/cancel`, HQ, {
      reason: 'ส่งผิด',
    });
    expect(cancelled.status).toBe('cancelled');
    expect(await product(KEYBOARD, HQ)).toEqual(
      expect.objectContaining({ stock: 18, avgCost: 1650 }),
    );
    expect((await product(NOTEBOOK, HQ)).stock).toBe(12);
    expect(await errorOf(call('POST', 'transfers', 'none', {}))).toEqual([
      400,
      'ไม่ได้เลือกสาขา กรุณาเลือกสาขาที่ทำงานก่อน',
    ]);
  });
});

describe('mockBackendInterceptor – companies (SaaS step 6)', () => {
  let http: HttpClient;
  const DEMO_ADMIN = mockToken(1, 1);
  const ACME_ADMIN = mockToken(2, 1);

  const call = <T>(method: string, url: string, body?: unknown, token?: string) => {
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, { body, headers }),
    );
  };
  const statusOf = (p: Promise<unknown>) =>
    p.then(
      () => 200,
      (e: { status: number }) => e.status,
    );
  const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null');

  /** A second company `ACME` whose admin has the same username as DEMO's (unique per company). */
  const plantAcme = () => {
    localStorage.setItem(
      'an22.mock.platform',
      JSON.stringify({
        companies: [
          { id: 1, code: 'DEMO', active: true },
          { id: 2, code: 'ACME', active: true },
        ],
        nextCompanyId: 3,
      }),
    );
    const acmeBranch: Branch = {
      id: 1,
      code: 'MAIN',
      name: 'สำนักงานใหญ่ ACME',
      branchNo: '00000',
      address: '1 ถนนสุขุมวิท กรุงเทพฯ',
      phone: '',
      receiptFooter: '',
      active: true,
    };
    const acmeAdmin: User = {
      id: 1,
      username: 'admin',
      name: 'ACME Admin',
      email: 'owner@acme.test',
      role: 'admin',
      active: true,
      branchIds: [],
      allBranches: true,
      createdAt: '2026-10-18T00:00:00.000Z',
    };
    localStorage.setItem(
      'an22.mock.db.2',
      JSON.stringify({
        users: [acmeAdmin],
        nextId: 2,
        passwords: { 1: 'acme-pass' },
        branches: [acmeBranch],
        nextBranchId: 2,
        companyInfo: {
          ...COMPANY_INFO_DEFAULTS,
          name: 'บริษัท แอคมี จำกัด',
          taxId: '0105561000014',
        },
      }),
    );
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('moves the company registry out of an older DEMO db once', async () => {
    localStorage.setItem(
      'an22.mock.db',
      JSON.stringify({ companies: [{ id: 1, code: 'DEMO', active: true }] }),
    );
    expect(await statusOf(call('GET', 'products', undefined, DEMO_ADMIN))).toBe(200);
    const platform = stored('an22.mock.platform');
    expect(platform.companies).toHaveLength(1);
    expect(platform.companies[0]).toMatchObject({
      id: 1,
      code: 'DEMO',
      active: true,
      planId: 'pro',
    });
    expect(platform.nextCompanyId).toBe(2);
    await call(
      'PUT',
      'settings/branch',
      { name: 'HQ', address: '1 ถนนสีลม', phone: '', receiptFooter: '' },
      DEMO_ADMIN,
    );
    expect(stored('an22.mock.db').companies).toBeUndefined();
  });

  it('logs in to each company with its own users, data and password', async () => {
    plantAcme();
    const login = (companyCode: string, password: string) =>
      call<LoginResponse>('POST', 'auth/login', { companyCode, username: 'admin', password });
    const acme = await login('acme', 'acme-pass');
    expect(sessionToken()).toBe(ACME_ADMIN);
    expect(acme.company).toMatchObject({ id: 2, code: 'ACME', name: 'บริษัท แอคมี จำกัด' });
    expect(acme.branches.map((b) => b.code)).toEqual(['MAIN']);
    expect(await statusOf(login('ACME', 'admin'))).toBe(401); // DEMO's password
    await login('DEMO', 'admin');
    expect(sessionToken()).toBe(DEMO_ADMIN);
  });

  it("never serves one company's data to another company's token", async () => {
    plantAcme();
    const demoProducts = await call<Product[]>('GET', 'products', undefined, DEMO_ADMIN);
    expect(demoProducts.length).toBeGreaterThan(0);
    expect(await call<Product[]>('GET', 'products', undefined, ACME_ADMIN)).toEqual([]);
    expect(await call<User[]>('GET', 'users', undefined, ACME_ADMIN)).toHaveLength(1);
    // an id of DEMO's in the URL is simply not found in ACME's data
    expect(
      await statusOf(call('GET', `products/${demoProducts[0].id}`, undefined, ACME_ADMIN)),
    ).toBe(404);

    const branch: Branch = (await call<Branch[]>('GET', 'branches', undefined, ACME_ADMIN))[0];
    await call('PUT', `branches/${branch.id}`, { ...branch, name: 'ACME สาขาหลัก' }, ACME_ADMIN);
    const demoBranches = await call<Branch[]>('GET', 'branches', undefined, DEMO_ADMIN);
    expect(demoBranches.map((b) => b.name)).not.toContain('ACME สาขาหลัก');
    expect(stored('an22.mock.db.2').branches[0].name).toBe('ACME สาขาหลัก');
  });

  it('answers 401 to a token of a company that is not registered or suspended', async () => {
    plantAcme();
    expect(await statusOf(call('GET', 'products', undefined, mockToken(3, 1)))).toBe(401);
    const platform = stored('an22.mock.platform');
    platform.companies[1].active = false;
    localStorage.setItem('an22.mock.platform', JSON.stringify(platform));
    expect(await statusOf(call('GET', 'products', undefined, ACME_ADMIN))).toBe(401);
    expect(await statusOf(call('GET', 'products', undefined, DEMO_ADMIN))).toBe(200);
  });
});

describe('mockBackendInterceptor – owner (E33)', () => {
  let http: HttpClient;
  const OWNER = mockToken(1, 1);
  const STAFF = mockToken(1, 2);

  const call = <T>(method: string, url: string, body?: unknown, token = OWNER) =>
    firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, {
        body,
        headers: { Authorization: `Bearer ${token}`, 'X-Branch-Id': '1' },
      }),
    );
  const failure = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => [e.status, e.error.message],
    );
  const newAdmin = {
    username: 'mgr',
    name: 'ผู้จัดการ',
    email: 'mgr@x.test',
    role: 'admin',
    active: true,
    allBranches: true,
    branchIds: [],
    password: '1234',
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('makes the first admin of every branch of older data the owner, once', async () => {
    localStorage.setItem(
      'an22.mock.db',
      JSON.stringify({
        users: [
          {
            id: 1,
            username: 'boss',
            name: 'Boss',
            email: 'b@x.test',
            role: 'admin',
            active: true,
            branchIds: [],
            allBranches: true,
            createdAt: '',
          },
          {
            id: 2,
            username: 'staff',
            name: 'Staff',
            email: '',
            role: 'user',
            active: true,
            branchIds: [1],
            allBranches: false,
            createdAt: '',
          },
        ],
      }),
    );
    const users = await call<User[]>('GET', 'users');
    expect(users.map((u) => u.role)).toEqual(['owner', 'user']);
    expect(JSON.parse(localStorage.getItem('an22.mock.db') ?? '{}').users[0].role).toBe('owner');
  });

  it('never makes an owner through the user form, nor deletes / deactivates / demotes one', async () => {
    expect(await failure(call('POST', 'users', { ...newAdmin, role: 'owner' }))).toEqual([
      400,
      'ตั้งเจ้าของบริษัทได้ด้วยการโอนความเป็นเจ้าของเท่านั้น',
    ]);
    const mgr = await call<User>('POST', 'users', newAdmin);
    const MGR = mockToken(1, mgr.id);
    const owner = await call<User>('GET', 'users/1');
    expect(await failure(call('DELETE', 'users/1', undefined, MGR))).toEqual([
      400,
      'ลบเจ้าของบริษัทไม่ได้ — โอนความเป็นเจ้าของให้ผู้ใช้อื่นก่อน',
    ]);
    expect(await failure(call('PUT', 'users/1', { ...owner, role: 'admin' }, MGR))).toEqual([
      400,
      'เปลี่ยนสิทธิ์ของเจ้าของบริษัทไม่ได้ — โอนความเป็นเจ้าของให้ผู้ใช้อื่นก่อน',
    ]);
    expect((await failure(call('PUT', 'users/1', { ...owner, email: '' })))?.[1]).toBe(
      'เจ้าของบริษัทต้องมีอีเมล (ใช้กู้รหัสผ่านและแจ้งเรื่องการเก็บเงิน)',
    );
    // the owner keeps every branch whatever the form sends
    const saved = await call<User>('PUT', 'users/1', {
      ...owner,
      allBranches: false,
      branchIds: [2],
    });
    expect([saved.allBranches, saved.branchIds]).toEqual([true, []]);
  });

  it('hands ownership over with the owner password; the old owner becomes an admin', async () => {
    const mgr = await call<User>('POST', 'users', newAdmin);
    const transfer = (userId: number, password: string, token = OWNER) =>
      call<User[]>('POST', 'company/owner', { userId, password }, token);
    const noMail = await call<User>('POST', 'users', {
      ...newAdmin,
      username: 'nomail',
      email: '',
      role: 'user',
      allBranches: false,
      branchIds: [1],
    });
    expect(await failure(transfer(mgr.id, 'admin', STAFF))).toEqual([
      403,
      'โอนความเป็นเจ้าของได้เฉพาะเจ้าของบริษัท',
    ]);
    expect(await failure(transfer(mgr.id, 'wrong'))).toEqual([400, 'รหัสผ่านไม่ถูกต้อง']);
    expect(await failure(transfer(noMail.id, 'admin'))).toEqual([
      400,
      'ผู้รับโอนต้องมีอีเมล — แก้ข้อมูลผู้ใช้ให้มีอีเมลก่อน',
    ]);
    const users = await transfer(mgr.id, 'admin');
    const roleOf = (id: number) => users.find((u) => u.id === id)?.role;
    expect([roleOf(1), roleOf(mgr.id)]).toEqual(['admin', 'owner']);
    expect(await failure(transfer(1, 'admin'))).toEqual([
      403,
      'โอนความเป็นเจ้าของได้เฉพาะเจ้าของบริษัท',
    ]);
  });
});

describe('mockBackendInterceptor – audit log (E40)', () => {
  let http: HttpClient;
  const OWNER = mockToken(1, 1);
  const STAFF = mockToken(1, 2);

  const call = <T>(method: string, url: string, body?: unknown, token = OWNER, branch = '1') =>
    firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, {
        body,
        headers: { Authorization: `Bearer ${token}`, 'X-Branch-Id': branch },
      }),
    );
  const statusOf = (p: Promise<unknown>) =>
    p.then(
      () => 200,
      (e: { status: number }) => e.status,
    );
  const log = (token = OWNER, query = '') =>
    call<AuditEvent[]>('GET', `audit-log${query}`, undefined, token);

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('records logins and failed logins of a known company', async () => {
    const login = (username: string, password: string) =>
      statusOf(
        firstValueFrom(http.post('/api/auth/login', { companyCode: 'DEMO', username, password })),
      );
    expect(await login('somchai', 'x')).toBe(401);
    expect(await login('somchai', '1234')).toBe(200);
    const events = await log();
    expect(events.map((e) => [e.action, e.userName, e.userId])).toEqual([
      ['login', 'สมชาย ใจดี', 2],
      ['login_failed', 'somchai', null],
    ]);
  });

  it('records important writes with who, branch and what — admins only', async () => {
    await call('PUT', 'settings/menu-access', { userMenus: ['pos', 'sales'] });
    const prices = await call<SkuPrice[]>('GET', 'prices');
    await call('DELETE', `prices/${prices[0].id}`);
    await call(
      'PUT',
      'settings/branch',
      { name: 'บางนา', address: 'บางนา กรุงเทพฯ', phone: '', receiptFooter: '' },
      OWNER,
      '2',
    );
    await call('GET', 'products'); // reads are never logged
    const events = await log();
    expect(events.map((e) => [e.action, e.branchId, e.userName])).toEqual([
      ['branch_settings', 2, 'Admin'],
      ['price_change', null, 'Admin'],
      ['menu_access', null, 'Admin'],
    ]);
    expect(events[1].detail).toBe('ลบช่วงราคา');
    expect(events[1].ref?.label).toContain('฿');
    expect(events[2].detail).toBe('ผู้ใช้ทั่วไปเห็น: ขายหน้าร้าน, การขาย');
    expect((await log(OWNER, '?action=price_change')).length).toBe(1);
    expect(await statusOf(log(STAFF))).toBe(403);
  });

  it("records the device's terminal only when it is one of the company's", async () => {
    const atTerminal = (terminal: string) =>
      firstValueFrom(
        http.put(
          '/api/settings/menu-access',
          { userMenus: ['pos'] },
          {
            headers: {
              Authorization: `Bearer ${OWNER}`,
              'X-Branch-Id': '1',
              'X-Terminal-Id': terminal,
            },
          },
        ),
      );
    await atTerminal('1');
    await atTerminal('99');
    const events = await log();
    expect(events.map((e) => e.terminalId)).toEqual([null, 1]);
  });

  it('shows a branch admin only the events of their branches', async () => {
    const bnAdmin = await call<User>('POST', 'users', {
      username: 'bnadmin',
      name: 'BN Admin',
      email: '',
      role: 'admin',
      active: true,
      allBranches: false,
      branchIds: [2],
      password: '1234',
    });
    await call(
      'PUT',
      'settings/branch',
      { name: 'บางนา', address: 'บางนา กรุงเทพฯ', phone: '', receiptFooter: '' },
      OWNER,
      '2',
    );
    await call(
      'PUT',
      'settings/branch',
      { name: 'สำนักงานใหญ่', address: 'สีลม กรุงเทพฯ', phone: '', receiptFooter: '' },
      OWNER,
      '1',
    );
    // (sent from BN: the branch admin may not work in HQ)
    const seen = await call<AuditEvent[]>(
      'GET',
      'audit-log',
      undefined,
      mockToken(1, bnAdmin.id),
      '2',
    );
    expect(seen.map((e) => [e.action, e.branchId])).toEqual([['branch_settings', 2]]);
  });
});

describe('mockBackendInterceptor – packages (E34)', () => {
  let http: HttpClient;
  const OWNER = mockToken(1, 1);
  const STAFF = mockToken(1, 2);

  const call = <T>(method: string, url: string, body?: unknown, token = OWNER) =>
    firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, {
        body,
        headers: { Authorization: `Bearer ${token}`, 'X-Branch-Id': '1' },
      }),
    );
  const failure = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => [e.status, e.error.message],
    );
  const newUser = (username: string, active = true) => ({
    username,
    name: username,
    email: '',
    role: 'user',
    active,
    allBranches: false,
    branchIds: [1],
    password: '1234',
  });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('gives DEMO the Pro package and counts active branches / users / terminals', async () => {
    expect(await call<SubscriptionInfo>('GET', 'company/subscription')).toMatchObject({
      planId: 'pro',
      usage: { branches: 2, users: 3, terminals: 3 },
    });
    expect(await failure(call('GET', 'company/subscription', undefined, STAFF))).toEqual([
      403,
      'ดูแพ็กเกจได้เฉพาะผู้ดูแลระบบ',
    ]);
  });

  it('lets only the owner change the package; a downgrade keeps what is over the limit', async () => {
    expect(await failure(call('PUT', 'company/plan', { planId: 'starter' }, STAFF))).toEqual([
      403,
      'เปลี่ยนแพ็กเกจได้เฉพาะเจ้าของบริษัท',
    ]);
    expect(await failure(call('PUT', 'company/plan', { planId: 'gold' }))).toEqual([
      400,
      'ไม่มีแพ็กเกจนี้',
    ]);
    const info = await call<SubscriptionInfo>('PUT', 'company/plan', { planId: 'starter' });
    expect(info.planId).toBe('starter');
    expect(JSON.parse(localStorage.getItem('an22.mock.platform') ?? '{}').companies[0].planId).toBe(
      'starter',
    );
    // 2 branches / 3 terminals stay usable, adding is blocked
    const branches = await call<Branch[]>('GET', 'branches');
    expect(branches.filter((b) => b.active)).toHaveLength(2);
    expect(
      await failure(
        call('POST', 'branches', {
          code: 'CM',
          name: 'เชียงใหม่',
          branchNo: '00002',
          address: 'เชียงใหม่',
          phone: '',
          receiptFooter: '',
          active: true,
        }),
      ),
    ).toEqual([403, 'แพ็กเกจ Starter ใช้สาขาได้ 1 สาขา — เปลี่ยนแพ็กเกจได้ที่เมนูบัญชีบริษัท']);
    expect(
      (
        await failure(
          call('POST', 'pos-terminals', { id: 9, name: 'x', posId: '', branchId: 1, active: true }),
        )
      )?.[1],
    ).toBe(
      'แพ็กเกจ Starter ใช้เครื่อง POS ที่ใช้งานได้ 2 เครื่อง — เปลี่ยนแพ็กเกจได้ที่เมนูบัญชีบริษัท',
    );
    const events = await call<AuditEvent[]>('GET', 'audit-log?action=plan_change');
    expect(events[0].detail).toBe('เปลี่ยนเป็นแพ็กเกจ Starter (฿590 / เดือน)');
  });

  it('counts only active users: an inactive one may be added, turning one on needs room', async () => {
    await call('PUT', 'company/plan', { planId: 'starter' }); // 5 users; DEMO has 3 active
    await call('POST', 'users', newUser('user4'));
    await call('POST', 'users', newUser('user5'));
    expect((await failure(call('POST', 'users', newUser('user6'))))?.[0]).toBe(403);
    const off = await call<User>('POST', 'users', newUser('user7', false));
    expect((await failure(call('PUT', `users/${off.id}`, { ...off, active: true })))?.[1]).toBe(
      'แพ็กเกจ Starter ใช้ผู้ใช้ที่ใช้งานได้ 5 คน — เปลี่ยนแพ็กเกจได้ที่เมนูบัญชีบริษัท',
    );
    // an edit of an active user is not "one more"
    const users = await call<User[]>('GET', 'users');
    const u4 = users.find((u) => u.username === 'user4') as User;
    expect(await call<User>('PUT', `users/${u4.id}`, { ...u4, name: 'สี่' })).toMatchObject({
      name: 'สี่',
    });
  });
});

describe('mockBackendInterceptor – billing (E35)', () => {
  let http: HttpClient;
  const OWNER = mockToken(1, 1);
  const STAFF = mockToken(1, 2);

  const call = <T>(method: string, url: string, body?: unknown, token = OWNER) =>
    firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, {
        body,
        headers: { Authorization: `Bearer ${token}`, 'X-Branch-Id': '1' },
      }),
    );
  const failure = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => [e.status, e.error.message],
    );
  /** DEMO on Starter whose next period started `daysAgo` days ago. */
  const plant = (daysAgo: number) =>
    localStorage.setItem(
      'an22.mock.platform',
      JSON.stringify({
        companies: [
          {
            id: 1,
            code: 'DEMO',
            active: true,
            planId: 'starter',
            subscription: { trialEndsOn: null, nextInvoiceOn: addDaysIso(todayIso(), -daysAgo) },
            suspendedReason: null,
          },
        ],
        nextCompanyId: 2,
        invoices: [],
        nextInvoiceId: 1,
      }),
    );

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('starts older companies with no trial and the first invoice next month', async () => {
    const info = await call<SubscriptionInfo>('GET', 'company/subscription');
    expect(info.status).toBe('active');
    expect(info.invoices).toEqual([]);
    expect(info.subscription.nextInvoiceOn.endsWith('-01')).toBe(true);
    expect(info.subscription.nextInvoiceOn > todayIso()).toBe(true);
    expect((await call<MeResponse>('GET', 'me')).billing).toBeNull();
  });

  it('issues the invoice of a period that started and warns admins once it is overdue', async () => {
    plant(10); // due 3 days ago, grace still running
    const info = await call<SubscriptionInfo>('GET', 'company/subscription');
    expect(info.status).toBe('past_due');
    expect(info.invoices).toHaveLength(1);
    expect(info.invoices[0]).toMatchObject({
      planId: 'starter',
      amount: 590,
      status: 'open',
      dueDate: addDaysIso(todayIso(), -3),
    });
    expect(info.invoices[0].invoiceNo).toMatch(/^SUB-\d{6}-0001$/);
    const me = await call<MeResponse>('GET', 'me');
    expect(me.billing?.level).toBe('error');
    expect(me.billing?.text).toContain('อีก 4 วัน');
    expect((await call<MeResponse>('GET', 'me', undefined, STAFF)).billing).toBeNull();
    // issued once
    expect((await call<SubscriptionInfo>('GET', 'company/subscription')).invoices).toHaveLength(1);
  });

  it('suspends the company after the grace period: 401, and login says why', async () => {
    plant(20);
    expect((await failure(call('GET', 'products')))?.[0]).toBe(401);
    const login = await failure(
      firstValueFrom(
        http.post('/api/auth/login', { companyCode: 'DEMO', username: 'admin', password: 'admin' }),
      ),
    );
    expect(login).toEqual([
      401,
      'บริษัทนี้ถูกระงับการใช้งานเพราะค้างชำระค่าบริการ — เจ้าของบริษัทติดต่อผู้ให้บริการเพื่อชำระเงิน',
    ]);
    const stored = JSON.parse(localStorage.getItem('an22.mock.platform') ?? '{}');
    expect(stored.companies[0]).toMatchObject({ active: false, suspendedReason: 'overdue' });
  });
});

describe('mockBackendInterceptor – signup + owner password reset (E37 / E41)', () => {
  let http: HttpClient;
  const post = <T>(url: string, body: unknown, token?: string) =>
    firstValueFrom(
      http.post<T>(`/api/${url}`, body, {
        headers: token ? { Authorization: `Bearer ${token}`, 'X-Branch-Id': '1' } : {},
      }),
    );
  const get = <T>(url: string, token: string) =>
    firstValueFrom(
      http.get<T>(`/api/${withRange(url)}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Branch-Id': '1' },
      }),
    );
  const failure = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => [e.status, e.error.message],
    );
  const payload = {
    companyCode: ' acme ',
    companyName: 'บริษัท แอคมี จำกัด',
    taxId: '0105550123451',
    vatRegistered: true,
    branch: { code: 'hq', name: 'สำนักงานใหญ่', branchNo: '00000', address: 'กรุงเทพฯ', phone: '' },
    owner: { name: 'สมศักดิ์', username: 'Boss', email: 'boss@acme.test', password: 'secret' },
    planId: 'starter',
  };
  const platform = () => JSON.parse(localStorage.getItem('an22.mock.platform') ?? '{}');

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('creates a company on a trial with only its first branch, owner and cash', async () => {
    const session = await post<LoginResponse>('auth/signup', payload);
    expect(session.company).toMatchObject({ id: 2, code: 'ACME', name: 'บริษัท แอคมี จำกัด' });
    expect(session.user).toMatchObject({ username: 'boss', role: 'owner', allBranches: true });
    expect(session.branches.map((b) => b.code)).toEqual(['HQ']);
    expect(sessionToken()).toBe(mockToken(2, 1));
    const info = await get<SubscriptionInfo>('company/subscription', sessionToken());
    expect(info).toMatchObject({ planId: 'starter', status: 'trial' });
    expect(info.subscription.trialEndsOn).toBe(addDaysIso(todayIso(), 14));
    expect(await get<Product[]>('products', sessionToken())).toEqual([]);
    expect(
      (await get<PaymentMethod[]>('payment-methods', sessionToken())).map((m) => m.type),
    ).toEqual(['cash']);
    expect(await get<unknown>('company/onboarding', sessionToken())).toEqual({
      terminals: 0,
      categories: 0,
      products: 0,
      prices: 0,
      users: 1,
    });
    const events = await get<AuditEvent[]>('audit-log', sessionToken());
    expect(events.map((e) => e.action)).toEqual(['signup']);
    // the new owner logs in with their own code; DEMO is untouched
    const login = await post<LoginResponse>('auth/login', {
      companyCode: 'ACME',
      username: 'boss',
      password: 'secret',
    });
    expect(login.company.id).toBe(2);
    expect((await get<Product[]>('products', mockToken(1, 1))).length).toBeGreaterThan(0);
  });

  it('refuses a taken code and an invalid form', async () => {
    expect(await failure(post('auth/signup', { ...payload, companyCode: 'demo' }))).toEqual([
      400,
      'รหัสบริษัทนี้ถูกใช้แล้ว',
    ]);
    expect(await failure(post('auth/signup', { ...payload, companyCode: 'x' }))).toEqual([
      400,
      'รหัสบริษัทใช้ได้เฉพาะ A-Z, 0-9 ยาว 3–20 ตัว',
    ]);
    expect(platform().companies).toHaveLength(1);
  });

  it('sends a single-use reset link only to the owner, with one answer for everything', async () => {
    await post('auth/signup', payload);
    const ask = (companyCode: string, email: string) =>
      post<{ message: string }>('auth/forgot-password', { companyCode, email });
    const same = (await ask('NOPE', 'x@y.z')).message;
    expect((await ask('ACME', 'someone@else.test')).message).toBe(same);
    expect(platform().outbox).toHaveLength(0);
    expect((await ask('acme', 'BOSS@acme.test')).message).toBe(same);
    const mail = platform().outbox[0];
    expect(mail).toMatchObject({ companyId: 2, to: 'boss@acme.test' });
    const token = new URLSearchParams(mail.body.split('?')[1]).get('token');

    expect((await failure(post('auth/reset-password', { token, password: '1' })))?.[0]).toBe(400);
    await post('auth/reset-password', { token, password: 'new-pass' });
    expect(await failure(post('auth/reset-password', { token, password: 'again-pass' }))).toEqual([
      400,
      'ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง หมดอายุ หรือใช้ไปแล้ว — ขอลิงก์ใหม่',
    ]);
    const login = await post<LoginResponse>('auth/login', {
      companyCode: 'ACME',
      username: 'boss',
      password: 'new-pass',
    });
    expect(login.user.role).toBe('owner');
  });
});

describe('mockBackendInterceptor – platform admin (E36)', () => {
  let http: HttpClient;
  const call = <T>(method: string, url: string, body?: unknown, token?: string) =>
    firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, {
        body,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    );
  const failure = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => [e.status, e.error.message],
    );
  const loginPlatform = async () =>
    (await call<PlatformLoginResponse>('POST', 'platform/auth/login', {
      username: 'platform',
      password: 'platform',
    })) && sessionToken(true);
  const plantOverdue = () =>
    localStorage.setItem(
      'an22.mock.platform',
      JSON.stringify({
        companies: [
          {
            id: 1,
            code: 'DEMO',
            active: true,
            planId: 'pro',
            subscription: { trialEndsOn: null, nextInvoiceOn: addDaysIso(todayIso(), -20) },
            suspendedReason: null,
          },
        ],
        nextCompanyId: 2,
      }),
    );

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('logs in apart from the companies; tokens of one side never pass on the other', async () => {
    expect(
      await failure(call('POST', 'platform/auth/login', { username: 'platform', password: 'x' })),
    ).toEqual([401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง']);
    const token = await loginPlatform();
    expect(token).toBe('mock-platform-token.p1');
    expect(
      (await failure(call('GET', 'platform/companies', undefined, mockToken(1, 1))))?.[0],
    ).toBe(401);
    expect((await failure(call('GET', 'products', undefined, token)))?.[0]).toBe(401);
    const rows = await call<PlatformCompanyRow[]>('GET', 'platform/companies', undefined, token);
    expect(rows.map((r) => [r.code, r.planId, r.status])).toEqual([['DEMO', 'pro', 'active']]);
    expect(rows[0].name).toBe(SEED_STORE_INFO.name);
  });

  it("never touches a branch's stock when it writes the company's data", async () => {
    // A platform write loads the company's data without any branch: it must not store the
    // unprojected (zero) stock fields into the branch the previous request worked in.
    const admin = mockToken(1, 1);
    const at = (branch: string) =>
      firstValueFrom(
        http.get<Product[]>('/api/products', {
          headers: { Authorization: `Bearer ${admin}`, 'X-Branch-Id': branch },
        }),
      );
    const stockOf = (products: Product[]) =>
      products
        .filter((p) => !p.serialControl)
        .map((p) => [p.sku, p.stock, p.avgCost, p.minStock, p.maxStock]);
    const hq = stockOf(await at('1'));
    const bn = stockOf(await at('2'));
    expect(hq.some(([, stock]) => (stock as number) > 0)).toBe(true);

    const token = await loginPlatform();
    await at('1'); // the last company request worked in HQ
    await call('PUT', 'platform/companies/1/owner-password', { password: 'owner-new' }, token);
    await call('POST', 'platform/companies/1/suspend', { note: 'ทดสอบ' }, token);
    await call('POST', 'platform/companies/1/reactivate', {}, token);

    expect(stockOf(await at('1'))).toEqual(hq);
    expect(stockOf(await at('2'))).toEqual(bn);
  });

  it('marks an overdue invoice paid and the company comes back on by itself', async () => {
    plantOverdue();
    const token = await loginPlatform();
    const detail = await call<PlatformCompanyDetail>(
      'GET',
      'platform/companies/1',
      undefined,
      token,
    );
    expect([detail.active, detail.suspendedReason]).toEqual([false, 'overdue']);
    expect(await failure(call('POST', 'platform/companies/1/reactivate', {}, token))).toEqual([
      400,
      'บริษัทค้างชำระ — บันทึกรับชำระใบแจ้งหนี้แทน',
    ]);
    const paid = await call<PlatformCompanyDetail>(
      'POST',
      `platform/invoices/${detail.invoices[0].id}/pay`,
      {},
      token,
    );
    expect([paid.active, paid.suspendedReason, paid.invoices[0].status]).toEqual([
      true,
      null,
      'paid',
    ]);
    const events = await call<AuditEvent[]>('GET', 'audit-log', undefined, mockToken(1, 1));
    expect(events[0]).toMatchObject({
      action: 'invoice_paid',
      actorKind: 'platform',
      userId: null,
    });
  });

  it('suspends with a reason, turns back on, changes the package and the owner password', async () => {
    const token = await loginPlatform();
    expect(
      (await failure(call('POST', 'platform/companies/1/suspend', { note: '' }, token)))?.[1],
    ).toBe('กรุณากรอกเหตุผลที่ระงับ');
    const suspended = await call<PlatformCompanyDetail>(
      'POST',
      'platform/companies/1/suspend',
      { note: 'ทดสอบ' },
      token,
    );
    expect([suspended.active, suspended.suspendNote]).toEqual([false, 'ทดสอบ']);
    expect((await failure(call('GET', 'products', undefined, mockToken(1, 1))))?.[0]).toBe(401);
    await call('POST', 'platform/companies/1/reactivate', {}, token);
    const changed = await call<PlatformCompanyDetail>(
      'PUT',
      'platform/companies/1/plan',
      { planId: 'standard' },
      token,
    );
    expect(changed.planId).toBe('standard');
    await call('PUT', 'platform/companies/1/owner-password', { password: 'owner-new' }, token);
    const login = await call<LoginResponse>('POST', 'auth/login', {
      companyCode: 'DEMO',
      username: 'admin',
      password: 'owner-new',
    });
    expect(login.user.role).toBe('owner');
    const actions = (await call<AuditEvent[]>('GET', 'audit-log', undefined, sessionToken())).map(
      (e) => e.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        'company_suspend',
        'company_reactivate',
        'plan_change',
        'user_password',
      ]),
    );
  });
});

describe('mockBackendInterceptor – export + deletion (E38 / E39)', () => {
  let http: HttpClient;
  const OWNER = mockToken(1, 1);
  const STAFF = mockToken(1, 2);
  const call = <T>(method: string, url: string, body?: unknown, token = OWNER) =>
    firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, {
        body,
        headers: { Authorization: `Bearer ${token}`, 'X-Branch-Id': '1' },
      }),
    );
  const failure = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { status: number; error: { message: string } }) => [e.status, e.error.message],
    );
  const login = (username: string, password: string) =>
    firstValueFrom(
      http.post<LoginResponse>('/api/auth/login', { companyCode: 'DEMO', username, password }),
    );
  const platformToken = async () =>
    (await firstValueFrom(
      http.post<PlatformLoginResponse>('/api/platform/auth/login', {
        username: 'platform',
        password: 'platform',
      }),
    )) && sessionToken(true);

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('exports every collection for the owner only, without passwords, and logs it', async () => {
    expect((await failure(call('GET', 'company/export', undefined, STAFF)))?.[0]).toBe(403);
    const dump = await call<CompanyExport>('GET', 'company/export');
    expect(dump).toMatchObject({ schemaVersion: 1, company: { id: 1, code: 'DEMO' } });
    expect(Object.keys(dump.data)).toEqual(
      expect.arrayContaining(['products', 'branchStock', 'sales', 'users', 'shifts', 'auditLog']),
    );
    expect(dump.data['passwords']).toBeUndefined();
    expect(dump.data['nextId']).toBeUndefined();
    const events = await call<AuditEvent[]>('GET', 'audit-log?action=company_export');
    expect(events).toHaveLength(1);
  });

  it('suspends everyone but the owner, who may only download or cancel', async () => {
    const ask = (body: Partial<DeletionRequest>) =>
      call<CompanyDeletion>('POST', 'company/deletion', {
        companyCode: 'DEMO',
        password: 'admin',
        reason: 'เลิกกิจการ',
        ...body,
      });
    expect(await failure(ask({ companyCode: 'X' }))).toEqual([
      400,
      'พิมพ์รหัสบริษัทให้ตรงเพื่อยืนยัน',
    ]);
    expect(await failure(ask({ password: 'wrong' }))).toEqual([400, 'รหัสผ่านไม่ถูกต้อง']);
    await ask({});
    // staff are logged out at once
    expect(await failure(call('GET', 'products', undefined, STAFF))).toEqual([
      401,
      'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    ]);
    const pending = await call<CompanyDeletion | null>('GET', 'company/deletion');
    expect(pending?.purgeAfter).toBe(addDaysIso(todayIso(), 30));
    expect((await failure(login('somchai', '1234')))?.[1]).toBe(
      'บริษัทนี้อยู่ระหว่างรอลบข้อมูล — ติดต่อเจ้าของบริษัท',
    );
    const session = await login('admin', 'admin');
    expect(session.company.deletionPurgeAfter).toBe(pending?.purgeAfter);
    expect((await failure(call('GET', 'products')))?.[0]).toBe(403);
    expect((await call<CompanyExport>('GET', 'company/export')).schemaVersion).toBe(1);
    // cancelled: back to normal for everyone
    await call('DELETE', 'company/deletion');
    expect((await call<Product[]>('GET', 'products', undefined, STAFF)).length).toBeGreaterThan(0);
    const actions = (await call<AuditEvent[]>('GET', 'audit-log')).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['deletion_request', 'deletion_cancel']));
  });

  it('lets the platform delete the data once due; the code stays taken', async () => {
    await call('POST', 'company/deletion', { companyCode: 'DEMO', password: 'admin', reason: '' });
    const token = await platformToken();
    const purge = () =>
      firstValueFrom(
        http.post<PlatformCompanyDetail>(
          '/api/platform/companies/1/purge',
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
    expect((await failure(purge()))?.[1]).toContain('ลบข้อมูลได้ตั้งแต่วันที่');
    const platform = JSON.parse(localStorage.getItem('an22.mock.platform') ?? '{}');
    platform.companies[0].deletion.purgeAfter = todayIso();
    localStorage.setItem('an22.mock.platform', JSON.stringify(platform));
    const gone = await purge();
    expect(gone.deletedAt).not.toBeNull();
    expect(gone.name).toBe(SEED_STORE_INFO.name);
    expect(localStorage.getItem('an22.mock.db')).toBeNull();
    expect((await failure(login('admin', 'admin')))?.[1]).toBe(
      'รหัสบริษัท ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง',
    );
    expect((await failure(call('GET', 'me')))?.[0]).toBe(401);
    const signup = await failure(
      firstValueFrom(
        http.post('/api/auth/signup', {
          companyCode: 'DEMO',
          companyName: 'ใหม่',
          taxId: '0105550123451',
          vatRegistered: true,
          branch: {
            code: 'HQ',
            name: 'สำนักงานใหญ่',
            branchNo: '00000',
            address: 'กรุงเทพฯ',
            phone: '',
          },
          owner: { name: 'x', username: 'boss', email: 'b@x.test', password: 'secret' },
          planId: 'starter',
        }),
      ),
    );
    expect(signup).toEqual([400, 'รหัสบริษัทนี้ถูกใช้แล้ว']);
  });
});

describe('mockBackendInterceptor – cost visibility (P5, E43–E45)', () => {
  let http: HttpClient;
  const NOTEBOOK = 1; // serial SKU with stock at HQ
  const MOUSE = 2; // 590, promo 1 → 531
  const STAFF = mockToken(1, 2); // สมชาย ใจดี (role user)

  const get = <T>(url: string, token?: string) =>
    firstValueFrom(
      http.get<T>(`/api/${withRange(url)}`, {
        headers: token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined,
      }),
    );
  const send = <T>(method: string, url: string, body: unknown, token?: string) =>
    firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, {
        body,
        headers: token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined,
      }),
    );
  const setStaffSeeCost = async (staffSeeCost: boolean) => {
    const info = await get<CompanyInfo>('settings/company');
    await send('PUT', 'settings/company', { ...info, staffSeeCost });
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('answers staff null for every cost while the company keeps it off (default)', async () => {
    const info = await get<CompanyInfo>('settings/company');
    expect(info.staffSeeCost).toBe(false);
    expect((await get<MeResponse>('me', STAFF)).canSeeCost).toBe(false);

    const products = await get<Product[]>('products', STAFF);
    expect(products.length).toBeGreaterThan(0);
    for (const p of products) {
      expect(p.cost).toBeNull();
      expect(p.avgCost).toBeNull();
      for (const s of p.suppliers) expect(s.cost).toBeNull();
    }
    expect(products.some((p) => p.stock > 0)).toBe(true); // quantities stay
    const serials = await get<SerialNumber[]>(`products/${NOTEBOOK}/serials`, STAFF);
    expect(serials.length).toBeGreaterThan(0);
    expect(serials.every((s) => s.cost === null)).toBe(true);
    const card = await get<StockCardResult>(`products/${MOUSE}/movements`, STAFF);
    expect(card.closing).toMatchObject({ avgCost: null, value: null });
    expect(card.closing.qty).toBeGreaterThan(0);
    expect(card.totals.inCost).toBeNull();
    for (const m of [...card.movements, ...card.openingMovements]) {
      expect([m.unitCost, m.totalCost, m.balanceAvgCost, m.balanceValue]).toEqual([
        null,
        null,
        null,
        null,
      ]);
    }
    const rows = await get<BranchStockRow[]>(`products/${MOUSE}/branch-stock`, STAFF);
    expect(rows.every((r) => r.avgCost === null)).toBe(true);
    // A POS sale (shifts off, terminal 1) to read back.
    const settings = await get<CompanyInfo>('settings/company');
    await send('PUT', 'settings/company', { ...settings, requireShift: false });
    await firstValueFrom(
      http.post(
        '/api/sales',
        {
          items: [{ productId: MOUSE, factor: 1, qty: 1, serial: null }],
          freeSerials: [],
          payments: [{ methodId: 1, amount: 531, reference: '', installmentMonths: null }],
          customer: '',
          expectedTotal: 531,
          buyer: null,
        },
        { headers: new HttpHeaders({ 'X-Terminal-Id': '1' }) },
      ),
    );
    const lines = (await get<Sale[]>('sales', STAFF)).flatMap((s) => s.lines);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.cogs).toBeNull();
  });

  it('keeps the numbers for admins, and for staff once the company turns it on', async () => {
    const admin = await get<Product>(`products/${MOUSE}`);
    expect(admin.cost).toBeGreaterThan(0);
    expect(admin.avgCost).toBeGreaterThan(0);
    expect((await get<MeResponse>('me')).canSeeCost).toBe(true);

    await setStaffSeeCost(true);
    expect((await get<MeResponse>('me', STAFF)).canSeeCost).toBe(true);
    expect(await get<Product>(`products/${MOUSE}`, STAFF)).toEqual(admin);
  });

  it('never takes costs from staff writing a SKU (E44)', async () => {
    const stored = await get<Product>(`products/${MOUSE}`);
    const asStaff = await get<Product>(`products/${MOUSE}`, STAFF);
    // The form sends back what it got (null costs) and a renamed short name.
    await send('PUT', `products/${MOUSE}`, { ...asStaff, shortName: 'เมาส์ใหม่' }, STAFF);
    await send('PUT', `products/${MOUSE}`, { ...asStaff, cost: 1, shortName: 'เมาส์ใหม่' }, STAFF);
    const after = await get<Product>(`products/${MOUSE}`);
    expect(after.shortName).toBe('เมาส์ใหม่');
    expect(after.cost).toBe(stored.cost);
    expect(after.suppliers).toEqual(stored.suppliers);

    const created = await send<Product>(
      'POST',
      'products',
      { ...asStaff, sku: 'NEW-P5', barcode: '', packUnits: [], cost: 500, shortName: 'ใหม่' },
      STAFF,
    );
    const fresh = await get<Product>(`products/${created.id}`);
    expect(fresh.cost).toBe(0);
    expect(fresh.suppliers.every((s) => s.cost === 0)).toBe(true);
  });

  it('tells staff a manual discount goes below cost without the numbers (E45)', async () => {
    const check = (value: number) =>
      send<{ issues: { cartIndex: number; message: string }[] }>(
        'POST',
        'sales/cost-check',
        {
          items: [
            {
              productId: MOUSE,
              factor: 1,
              qty: 1,
              serial: null,
              manualDiscount: { kind: 'percent', value },
            } satisfies CartItem,
          ],
          freeSerials: [],
          billManualDiscount: null,
        },
        STAFF,
      );
    expect((await check(1)).issues).toEqual([]);
    const below = await check(95);
    expect(below.issues).toHaveLength(1);
    expect(below.issues[0].cartIndex).toBe(0);
    expect(below.issues[0].message).toContain('ขายต่ำกว่าทุนหลังส่วนลดพิเศษ');
    expect(JSON.stringify(below)).not.toMatch(/cost/i);
  });
});

describe('mockBackendInterceptor – web server session (E48)', () => {
  let http: HttpClient;

  const call = <T>(method: string, url: string, body?: unknown) =>
    firstValueFrom(
      http.request<T>(method, `/api/${method === 'GET' ? withRange(url) : url}`, { body }),
    );
  const statusOf = (p: Promise<unknown>) =>
    p.then(
      () => 200,
      (e: { status: number }) => e.status,
    );
  const shopLogin = () =>
    call<LoginResponse>('POST', 'auth/login', {
      companyCode: 'DEMO',
      username: 'admin',
      password: 'admin',
    });
  const platformLogin = () =>
    call<PlatformLoginResponse>('POST', 'platform/auth/login', {
      username: 'platform',
      password: 'platform',
    });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('keeps the login token in the session and answers without it', async () => {
    expect(await statusOf(call('GET', 'me'))).toBe(401);
    const login = await shopLogin();
    expect(login).not.toHaveProperty('token');
    expect(sessionToken()).toBe(mockToken(1, 1));
    // later requests carry no Authorization of their own: the session's token is used
    expect((await call<MeResponse>('GET', 'me')).user.username).toBe('admin');
  });

  it('logout drops only its own session; the shop and platform sessions are apart', async () => {
    await shopLogin();
    const platform = await platformLogin();
    expect(platform).not.toHaveProperty('token');
    expect(sessionToken(true)).toBe('mock-platform-token.p1');
    expect(await statusOf(call('GET', 'platform/me'))).toBe(200);

    expect(await call('POST', 'platform/auth/logout')).toBeNull();
    expect(await statusOf(call('GET', 'platform/me'))).toBe(401);
    expect(await statusOf(call('GET', 'me'))).toBe(200);

    expect(await call('POST', 'auth/logout')).toBeNull();
    expect(await statusOf(call('GET', 'me'))).toBe(401);
    expect(sessionToken()).toBeNull();
  });

  it('a 401 drops the session; a refused login keeps the current one', async () => {
    await shopLogin();
    expect(
      await statusOf(
        call('POST', 'auth/login', { companyCode: 'DEMO', username: 'admin', password: 'x' }),
      ),
    ).toBe(401);
    expect(sessionToken()).toBe(mockToken(1, 1));

    // the user was deactivated meanwhile → 401 → the session's token is gone
    localStorage.setItem('an22.mock.session', JSON.stringify(mockToken(1, 999)));
    expect(await statusOf(call('GET', 'products'))).toBe(401);
    expect(sessionToken()).toBeNull();
  });

  it('signing up logs the new owner in through the session', async () => {
    const session = await call<LoginResponse>('POST', 'auth/signup', {
      companyCode: 'ACME',
      companyName: 'บริษัท แอคมี จำกัด',
      taxId: '',
      vatRegistered: false,
      branch: {
        code: 'HQ',
        name: 'สำนักงานใหญ่',
        branchNo: '00000',
        address: 'กรุงเทพฯ',
        phone: '',
      },
      owner: { name: 'บอส', username: 'boss', email: 'boss@acme.test', password: 'acme1234' },
      planId: 'starter',
    } satisfies SignupPayload);
    expect(session).not.toHaveProperty('token');
    expect((await call<MeResponse>('GET', 'me')).company.code).toBe('ACME');
  });
});

/** Response size limits of the lists (api plan "จำกัดขนาดคำตอบ", decided 2026-10-23). */
describe('mockBackendInterceptor – list limits', () => {
  let http: HttpClient;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([asAdminByDefault, mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  /** The raw request (no `withRange()`): the 400 message, or null when it passed. */
  const messageOf = (url: string) =>
    firstValueFrom(http.get(`/api/${url}`)).then(
      () => null,
      (e: { status: number; error: { message: string } }) => `${e.status} ${e.error.message}`,
    );

  it('needs from + to of at most 366 days on every dated list', async () => {
    const today = todayIso();
    const yearAgo = addDaysIso(today, -365);
    for (const path of [
      'sales',
      'shifts',
      'shifts/variance-report',
      'credit-notes',
      'tax-invoices',
      'audit-log',
      'products/1/movements',
    ]) {
      expect(await messageOf(path)).toBe('400 กรุณาเลือกช่วงวันที่ (ไม่เกิน 366 วัน)');
      expect(await messageOf(`${path}?from=${today}`)).toBe(
        '400 กรุณาเลือกช่วงวันที่ (ไม่เกิน 366 วัน)',
      );
      expect(await messageOf(`${path}?from=${addDaysIso(yearAgo, -1)}&to=${today}`)).toBe(
        '400 ช่วงวันที่ต้องไม่เกิน 366 วัน',
      );
      expect(await messageOf(`${path}?from=${yearAgo}&to=${today}`)).toBeNull();
    }
    // Format and order are checked first.
    expect(await messageOf('sales?from=2026-1-1&to=2026-02-01')).toBe(
      '400 รูปแบบวันที่ต้องเป็น YYYY-MM-DD',
    );
    expect(await messageOf(`sales?from=${today}&to=${yearAgo}`)).toBe(
      '400 วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด',
    );
  }, 30_000);

  it("takes one shift's bills / credit notes without a range", async () => {
    expect(await messageOf('sales?shiftId=1')).toBeNull();
    expect(await messageOf('credit-notes?shiftId=1')).toBeNull();
  });

  it('keeps undated lists open', async () => {
    expect(await messageOf('products')).toBeNull();
    expect(await messageOf('transfers')).toBeNull();
  });
});
