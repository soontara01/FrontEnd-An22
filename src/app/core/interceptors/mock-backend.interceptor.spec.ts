import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import {
  CartItem,
  CreditNote,
  CreditNoteLineInput,
  Category,
  PRODUCT_DEFAULTS,
  PaymentInput,
  Product,
  Sale,
  StoreInfo,
  TaxInvoice,
  SerialNumber,
  SerialReceiveResult,
  SUPPLIER_DEFAULTS,
  SkuPrice,
  StockCardResult,
  Supplier,
} from '../models';
import { addDaysIso, storeInfoError, todayIso } from '../models';
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
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });
  afterEach(() => vi.useRealTimers());

  const get = <T>(url: string) => firstValueFrom(http.get<T>(`/api/${url}`));
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
      orderNo: 'POS-20261004-0001',
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
      note: 'ของแถม POS-20261004-0001',
    });

    const next = await sell([item(ESIM)], 199, [pay(QR, 199)]);
    expect(next.orderNo).toBe('POS-20261004-0002');
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
      cnNo: 'CN-20261005-0001',
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
    expect(second.cnNo).toBe('CN-20261005-0002');
    expect((await product(MOUSE)).stock).toBe(mouseBefore);
    expect(await errorOf(post(`sales/${sale.id}/credit-notes`, damaged))).toBe(
      'MS-010 คืนได้ไม่เกิน 0 ชิ้น',
    );

    expect(await get<CreditNote[]>(`sales/${sale.id}/credit-notes`)).toHaveLength(2);
    expect(await get<CreditNote[]>('credit-notes?from=2026-10-05&to=2026-10-05')).toHaveLength(2);
    expect(await get<CreditNote[]>('credit-notes?from=2026-10-04&to=2026-10-04')).toHaveLength(0);
  });

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
    expect(invoice).toMatchObject({ invoiceNo: 'INV-20261004-0001', orderNo: sale.orderNo, buyer });
    expect((await get<Sale>(`sales/${sale.id}`)).taxInvoiceNo).toBe('INV-20261004-0001');
    expect(await errorOf(post(`sales/${sale.id}/tax-invoice`, { buyer }))).toBe(
      'บิลนี้ออกใบกำกับภาษีเต็มรูปแล้ว (INV-20261004-0001)',
    );
    expect(await get('tax-invoices/buyer?taxId=0105550123451')).toEqual(buyer);
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
      invoiceNo: 'INV-20261004-0001',
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
    expect(sale.taxInvoiceNo).toBe('INV-20261004-0001');
    const invoice = await get<TaxInvoice>(`sales/${sale.id}/tax-invoice`);
    expect(invoice).toMatchObject({
      atSale: true,
      orderNo: sale.orderNo,
      buyer,
      cancelledAt: null,
    });
    expect(invoice.date).toBe(sale.date);
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
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
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
