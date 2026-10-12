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
  Shift,
} from '@core/models';
import { TerminalService } from '@core/services/terminal.service';
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

  const shift: Shift = {
    id: 7,
    shiftNo: 'SH-20261012-01',
    terminalId: 2,
    cashier: 'สมชาย ใจดี',
    status: 'open',
    openedAt: new Date().toISOString(),
    openingFloat: 1000,
    openingDenominations: [],
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

  beforeEach(() => {
    localStorage.clear();
    // Logged in as a cashier (AuthService reads the stored user).
    localStorage.setItem('an22.user', JSON.stringify({ id: 2, name: 'สมชาย ใจดี', role: 'user' }));
    // This device is set to terminal 1 (Settings → "เครื่องนี้").
    localStorage.setItem('an22.pos.terminal', '1');
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
      // Selling itself is tested with shifts off; the shift tests below turn them on.
      storeInfo: vi.fn(() => of({ ...STORE_INFO_DEFAULTS, requireShift: false })),
      posTerminals: vi.fn(() =>
        of([
          { id: 1, name: 'หน้าร้าน', posId: 'E051', active: true },
          { id: 2, name: 'ชั้น 2', posId: '', active: false },
        ]),
      ),
      taxInvoiceOf: vi.fn(() => of(null)),
      buyerByTaxId: vi.fn(() => of(null)),
      currentShift: vi.fn(() => of(null)),
      shifts: vi.fn(() => of([])),
      openShift: vi.fn(() => of(shift)),
      shiftSummary: vi.fn(),
      cashMovements: vi.fn(() => of([])),
      addCashMovement: vi.fn(),
      countCheck: vi.fn(),
      closeShift: vi.fn(() => of({ ...shift, status: 'closed' })),
      verify: vi.fn(() => of({ user: { name: 'สมชาย ใจดี', role: 'user' } })),
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
      billManualDiscount: null,
      manualDiscountReason: '',
    });
    expect(result).toBe(sale);
    expect(store.lastSale()).toBe(sale);
    expect(store.items()).toEqual([]);
    expect(api.products).toHaveBeenCalledTimes(2); // stock reloaded
  });

  it('applies manual discounts within the staff ceiling and keeps them when parked', () => {
    store.add(1, 1, 2); // 200
    store.setLineDiscount(0, { kind: 'percent', value: 5 });
    expect(store.cart().total).toBe(190);
    expect(store.blocker()).toBe('กรุณาระบุเหตุผลส่วนลดพิเศษ');
    store.setManualReason('ลูกค้าประจำ');
    expect(store.blocker()).toBeNull();
    // not logged in as admin: above the store ceiling (default 5%) is blocked
    store.setBillDiscount({ kind: 'amount', value: 20 });
    expect(store.cart().total).toBe(170);
    expect(store.blocker()).toBe('ส่วนลดพิเศษ SKU-1 เกิน 5% — ให้ผู้ดูแลระบบทำรายการ');

    store.hold();
    expect(store.billManual()).toBeNull();
    expect(store.manualReason()).toBe('');
    store.resume(store.holds()[0].id);
    expect(store.billManual()).toEqual({ kind: 'amount', value: 20 });
    expect(store.manualReason()).toBe('ลูกค้าประจำ');
    expect(store.items()[0].manualDiscount).toEqual({ kind: 'percent', value: 5 });
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

  describe('shifts', () => {
    const withShifts = (current: Shift | null) => {
      api.storeInfo.mockReturnValue(of(STORE_INFO_DEFAULTS));
      api.currentShift.mockReturnValue(of(current));
      store.load();
      store.add(1);
    };

    it('blocks selling until this terminal has an open shift', () => {
      withShifts(null);
      expect(store.shiftLoaded()).toBe(true);
      expect(store.blocker()).toBe('ยังไม่ได้เปิดกะที่เครื่องนี้');
      store.openShift({ terminalId: 1, openingFloat: 1000, openingDenominations: [] }).subscribe();
      expect(store.shift()).toEqual(shift);
      expect(store.blocker()).toBeNull();
    });

    it('blocks selling on a device not set to an active registered terminal', () => {
      withShifts(shift);
      expect(store.terminalLabel()).toBe('เครื่อง 1 · หน้าร้าน');
      expect(store.blocker()).toBeNull();
      TestBed.inject(TerminalService).set(2);
      expect(store.blocker()).toBe('เครื่อง 2 ถูกปิดใช้งาน กรุณาให้ผู้ดูแลตั้งค่าใหม่');
      TestBed.inject(TerminalService).clear();
      expect(store.terminalLabel()).toBe('ยังไม่ได้ตั้งเลขเครื่อง');
      expect(store.blocker()).toBe(
        'เครื่องนี้ยังไม่ได้ตั้งเลขเครื่อง POS กรุณาให้ผู้ดูแลตั้งค่าที่เมนูตั้งค่า',
      );
    });

    it("blocks selling in someone else's shift and flags one left open", () => {
      withShifts({ ...shift, cashier: 'สมหญิง รักงาน', openedAt: '2020-01-01T00:00:00.000Z' });
      expect(store.blocker()).toBe('กะนี้เป็นของ สมหญิง รักงาน — ต้องปิดกะนั้นก่อนจึงจะขายได้');
      expect(store.shiftTooLong()).toBe(true);
    });

    it('closes the shift, keeps it for the Z report and clears the lock', () => {
      withShifts(shift);
      store.lock();
      expect(store.locked()).toBe(true);
      expect(localStorage.getItem('an22.pos.locked')).toBe('7');
      store
        .closeShift({
          counts: [],
          cashDenominations: [],
          depositAmount: 0,
          note: '',
          approval: null,
        })
        .subscribe();
      expect(api.closeShift).toHaveBeenCalledWith(7, expect.objectContaining({ approval: null }));
      expect(store.shift()).toBeNull();
      expect(store.closedShift()?.status).toBe('closed');
      expect(store.locked()).toBe(false);
      expect(localStorage.getItem('an22.pos.locked')).toBeNull();
    });

    it('unlocks only for the shift cashier or an admin', () => {
      withShifts(shift);
      store.lock();
      const unlock = () => {
        let result: string | null = 'pending';
        store.unlock({ username: 'x', password: 'y' }).subscribe((r) => (result = r));
        return result;
      };
      api.verify.mockReturnValueOnce(of({ user: { name: 'สมหญิง รักงาน', role: 'user' } }));
      expect(unlock()).toBe('ปลดล็อกได้เฉพาะ สมชาย ใจดี หรือผู้ดูแลระบบ');
      expect(store.locked()).toBe(true);
      expect(unlock()).toBeNull();
      expect(store.locked()).toBe(false);
    });

    it("defaults the opening float to what this terminal's last shift left", () => {
      localStorage.setItem('an22.pos.terminal', '2');
      api.shifts.mockReturnValue(
        of([
          { ...shift, id: 9, terminalId: 1, status: 'closed', floatLeft: 300 },
          { ...shift, id: 8, terminalId: 2, status: 'closed', floatLeft: 500 },
        ]),
      );
      let float = -1;
      TestBed.inject(TerminalService).set(2);
      store.lastFloatLeft().subscribe((f) => (float = f));
      expect(float).toBe(500);
    });
  });
});
