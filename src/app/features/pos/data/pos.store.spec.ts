import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import {
  PAYMENT_METHOD_DEFAULTS,
  PRODUCT_DEFAULTS,
  PaymentMethod,
  Product,
  SALE_DEFAULTS,
  STORE_INFO_DEFAULTS,
  Sale,
} from '@core/models';
import { PosApi } from './pos-api.service';
import { HeldBill, PosStore } from './pos.store';

describe('PosStore', () => {
  const product = (id: number, over: Partial<Product> = {}): Product => ({
    ...PRODUCT_DEFAULTS,
    id,
    sku: `SKU-${id}`,
    name: `สินค้า ${id}`,
    currentPrice: 100,
    stock: 10,
    ...over,
  });
  const methods: PaymentMethod[] = [
    { ...PAYMENT_METHOD_DEFAULTS, id: 2, code: 'QR', name: 'QR', type: 'qr', sortOrder: 2 },
    { ...PAYMENT_METHOD_DEFAULTS, id: 1, code: 'CASH', name: 'เงินสด', type: 'cash', sortOrder: 1 },
    {
      ...PAYMENT_METHOD_DEFAULTS,
      id: 3,
      code: 'OFF',
      name: 'ปิด',
      type: 'card',
      active: false,
    },
  ];
  const sale = { ...SALE_DEFAULTS, id: 1, orderNo: 'POS-1' } as Sale;
  let api: Record<keyof PosApi, ReturnType<typeof vi.fn>>;
  let store: PosStore;

  beforeEach(() => {
    localStorage.clear();
    api = {
      products: vi.fn(() =>
        of([
          product(1, { stock: 50, packUnits: [{ unit: 'แพ็ค', factor: 10, barcode: 'P10' }] }),
          product(2, { serialControl: true, stock: 2 }),
        ]),
      ),
      promotions: vi.fn(() => of([])),
      categories: vi.fn(() => of([])),
      paymentMethods: vi.fn(() => of(methods)),
      serials: vi.fn(() => of([])),
      checkout: vi.fn(() => of(sale)),
      storeInfo: vi.fn(() => of(STORE_INFO_DEFAULTS)),
      taxInvoiceOf: vi.fn(() => of(null)),
      buyerByTaxId: vi.fn(() => of(null)),
    };
    TestBed.configureTestingModule({ providers: [PosStore, { provide: PosApi, useValue: api }] });
    store = TestBed.inject(PosStore);
    store.load();
  });

  it('lists active tender buttons in order', () => {
    expect(store.methods().map((m) => m.id)).toEqual([1, 2]);
  });

  it('merges a SKU in the same unit and keeps packs and serials on their own lines', () => {
    store.add(1);
    store.add(1);
    store.add(1, 10);
    store.addSerials(2, ['A', 'B']);
    store.addSerials(2, ['A']);
    expect(store.items()).toEqual([
      { productId: 1, factor: 1, qty: 2, serial: null },
      { productId: 1, factor: 10, qty: 1, serial: null },
      { productId: 2, factor: 1, qty: 1, serial: 'A' },
      { productId: 2, factor: 1, qty: 1, serial: 'B' },
    ]);
    expect(store.cart().total).toBe(200 + 1000 + 200);
    expect(store.blocker()).toBeNull();

    store.setQty(0, 0); // ignored
    store.setQty(0, 5);
    store.remove(1);
    expect(store.items().map((i) => i.qty)).toEqual([5, 1, 1]);
  });

  it('reports blocking issues from the pricing engine', () => {
    expect(store.blocker()).toBe('ยังไม่มีสินค้าในบิล');
    store.add(1, 1, 51);
    expect(store.blocker()).toBe('SKU-1 สต็อกไม่พอ (คงเหลือ 50 ชิ้น)');
  });

  it('parks bills in storage and resumes them (parking the current one)', () => {
    store.setCustomer('คุณเอ');
    store.add(1);
    store.hold();
    expect(store.items()).toEqual([]);
    expect(store.customer()).toBe('');
    const [held] = store.holds();
    expect(held).toMatchObject({ customer: 'คุณเอ', total: 100 });
    expect(JSON.parse(localStorage.getItem('an22.pos.holds') ?? '[]') as HeldBill[]).toHaveLength(
      1,
    );

    store.add(1, 10);
    store.resume(held.id);
    expect(store.customer()).toBe('คุณเอ');
    expect(store.items()).toEqual([{ productId: 1, factor: 1, qty: 1, serial: null }]);
    expect(store.holds()).toHaveLength(1); // the pack bill was parked instead
    store.discardHold(store.holds()[0].id);
    expect(store.holds()).toEqual([]);
  });

  it('submits the cart with the expected total and clears it on success', () => {
    store.add(1, 1, 2);
    store.setCustomer(' คุณบี ');
    const payments = [{ methodId: 1, amount: 200, reference: '', installmentMonths: null }];
    let result: Sale | undefined;
    store.checkout(payments).subscribe((s) => (result = s));
    expect(api.checkout).toHaveBeenCalledWith({
      items: [{ productId: 1, factor: 1, qty: 2, serial: null }],
      freeSerials: [],
      payments,
      customer: 'คุณบี',
      expectedTotal: 200,
      buyer: null,
    });
    expect(result).toBe(sale);
    expect(store.lastSale()).toBe(sale);
    expect(store.items()).toEqual([]);
    expect(api.products).toHaveBeenCalledTimes(2); // stock reloaded
  });

  it('sends the full-tax-invoice buyer, keeps it when parked and loads the issued invoice', () => {
    const buyer = {
      name: 'บริษัท บี จำกัด',
      taxId: '0105550123451',
      branchType: 'head' as const,
      branchNo: '',
      address: 'กรุงเทพฯ',
    };
    store.add(1);
    store.setBuyer(buyer);
    store.hold();
    expect(store.buyer()).toBeNull();
    store.resume(store.holds()[0].id);
    expect(store.buyer()).toEqual(buyer);

    const invoice = { id: 7, invoiceNo: 'INV-1', saleId: 1 };
    api.checkout.mockReturnValueOnce(of({ ...sale, taxInvoiceNo: 'INV-1' }));
    api.taxInvoiceOf.mockReturnValueOnce(of(invoice));
    store.checkout([]).subscribe();
    expect(api.checkout).toHaveBeenCalledWith(
      expect.objectContaining({ buyer, customer: 'บริษัท บี จำกัด' }),
    );
    expect(store.lastInvoice()).toBe(invoice);
    expect(store.buyer()).toBeNull();
  });

  it('keeps the cart and reloads master data when the server rejects the sale', () => {
    api.checkout.mockReturnValueOnce(throwError(() => new Error('price changed')));
    store.add(1);
    store.checkout([]).subscribe({ error: () => undefined });
    expect(store.items()).toHaveLength(1);
    expect(api.promotions).toHaveBeenCalledTimes(2);
  });
});
