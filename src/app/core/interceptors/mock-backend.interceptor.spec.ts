import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import {
  Category,
  PRODUCT_DEFAULTS,
  Product,
  SerialNumber,
  SerialReceiveResult,
  SUPPLIER_DEFAULTS,
  SkuPrice,
  StockCardResult,
  Supplier,
} from '../models';
import { addDaysIso, todayIso } from '../models';
import { mockBackendInterceptor } from './mock-backend.interceptor';

/** Exercises the mock backend's serial-number rules end to end through HttpClient. */
describe('mockBackendInterceptor – serials', () => {
  let http: HttpClient;
  const NOTEBOOK = 1; // seed: serialControl, prefix NB, length 12, stock 12
  const MOUSE = 2; // seed: not serial-controlled

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  const get = <T>(url: string) => firstValueFrom(http.get<T>(`/api/${url}`));
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
    expect(back.received[0]).toMatchObject({ id: first.id, status: 'in_stock' });
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
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  afterEach(() => vi.useRealTimers());

  const get = <T>(url: string) => firstValueFrom(http.get<T>(`/api/${url}`));
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
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  const get = <T>(url: string) => firstValueFrom(http.get<T>(`/api/${url}`));
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
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  const get = <T>(url: string) => firstValueFrom(http.get<T>(`/api/${url}`));
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
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  const get = <T>(url: string) => firstValueFrom(http.get<T>(`/api/${url}`));
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

    const card = (await get<StockCardResult>(`products/${MOUSE}/movements`)).movements;
    expect(card.map((m) => m.type)).toEqual(['opening', 'receive', 'issue']);
    expect(card[0]).toMatchObject({ qty: 3, unitCost: 350, balanceValue: 1050 });
    expect(card[1]).toMatchObject({ qty: 20, totalCost: 6000, balanceQty: 23, note: 'INV-001' });
    expect(card[2]).toMatchObject({ qty: -1, unitCost: 306.52, balanceQty: 22 });
    expect(card[2].balanceValue).toBeCloseTo(22 * 306.5217, 1);
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
    expect(all.movements.map((m) => m.type)).toEqual(['opening', 'receive']);

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
    const card = (await get<StockCardResult>('products/80/movements')).movements;
    expect(card).toEqual([
      expect.objectContaining({ type: 'opening', qty: 4, unitCost: 50, balanceValue: 200 }),
    ]);
  });
});
