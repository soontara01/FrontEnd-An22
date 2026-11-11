import {
  Branch,
  Category,
  PRODUCT_DEFAULTS,
  PROMOTION_DEFAULTS,
  Product,
  Promotion,
} from '@core/models';
import {
  PromotionRawRow,
  PromotionValidationContext,
  buildPromotionTemplate,
  exportPromotionsToExcel,
  parseExcelDate,
  readPromotionRows,
  validatePromotionRows,
} from './promotion-excel';

describe('Promotion Excel import', () => {
  const product = (id: number, sku: string, extra: Partial<Product> = {}): Product => ({
    ...PRODUCT_DEFAULTS,
    id,
    sku,
    name: sku,
    ...extra,
  });
  const products = [
    product(1, 'NB-001'),
    product(2, 'MS-001'),
    product(3, 'SV-SETUP'),
    product(4, 'OLD-1', { saleStatus: 'discontinued' }),
  ];
  const categories: Category[] = [
    { id: 10, code: 'IT', name: 'ไอที', parentId: null, level: 1, active: true, productCount: 0 },
  ];
  const branch = (id: number, code: string): Branch =>
    ({ id, code, name: code, active: true }) as Branch;
  const branches = [branch(1, 'HQ'), branch(2, 'BN')];

  const promo = (id: number, extra: Partial<Promotion>): Promotion => ({
    ...PROMOTION_DEFAULTS,
    id,
    code: `P-${id}`,
    name: `โปร ${id}`,
    startDate: '2026-12-01',
    scope: { all: false, productIds: [1], categoryIds: [] },
    ...extra,
  });
  const today = '2026-11-11';
  const promotions = [
    promo(1, {
      code: 'NB10',
      endDate: '2026-12-31',
      scope: { all: false, productIds: [1, 2], categoryIds: [10] },
      minQty: 2,
      discount: { kind: 'percent', value: 10, maxDiscount: 500 },
      note: 'ปลายปี',
    }),
    promo(2, {
      code: 'BILL',
      type: 'bill_discount',
      startDate: '2026-11-01',
      scope: { all: true, productIds: [], categoryIds: [] },
      minQty: 0,
      minAmount: 5000,
      discount: { kind: 'amount', value: 200, maxDiscount: null },
      branchIds: [2],
    }),
    promo(3, {
      code: 'FREE',
      type: 'free_goods',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      minQty: 0,
      minAmount: 3000,
      discount: null,
      freeGoods: {
        items: [
          { productId: 3, qty: 1 },
          { productId: 2, qty: 2 },
        ],
        repeat: true,
        maxSets: 3,
      },
    }),
  ];
  const ctx = (extra: Partial<PromotionValidationContext> = {}): PromotionValidationContext => ({
    products,
    categories,
    branches,
    promotions,
    today,
    isCompanyAdmin: true,
    ...extra,
  });
  const row = (rowNo: number, values: Partial<PromotionRawRow>): PromotionRawRow => ({
    rowNo,
    ...values,
  });
  const validate = (rows: PromotionRawRow[], extra: Partial<PromotionValidationContext> = {}) =>
    validatePromotionRows(rows, ctx(extra));

  it('reads all three types into payloads', () => {
    const [item, bill, free] = validate([
      row(2, {
        code: 'new-1',
        name: ' ลดโน้ตบุ๊ก ',
        type: 'ลดราคาสินค้า',
        startDate: '1/12/2569',
        endDate: '31/12/2026',
        productCodes: 'nb-001, MS-001',
        categoryCodes: 'IT',
        discountKind: '%',
        discountValue: '15',
        maxDiscount: '1,000',
        priority: '5',
        stackable: 'y',
      }),
      row(3, {
        code: 'NEW-2',
        name: 'ลดท้ายบิล',
        type: 'ลดท้ายบิล',
        startDate: '1/12/2569',
        productCodes: 'NB-001', // ignored: a bill discount covers the whole bill
        minAmount: '2000',
        discountKind: 'บาท',
        discountValue: '100',
        branchCodes: 'HQ',
      }),
      row(4, {
        code: 'NEW-3',
        name: 'ซื้อ 2 แถม 1',
        type: 'ของแถม',
        startDate: '1/12/2569',
        scopeAll: 'Y',
        minQty: '2',
        freeItems: 'SV-SETUP, MS-001:2',
        repeat: 'Y',
      }),
    ]);
    expect(item.action).toBe('create');
    expect(item.payload).toMatchObject({
      code: 'NEW-1',
      name: 'ลดโน้ตบุ๊ก',
      startDate: '2026-12-01',
      endDate: '2026-12-31',
      priority: 5,
      stackable: true,
      enabled: true,
      minQty: 1,
      scope: { all: false, productIds: [1, 2], categoryIds: [10] },
      discount: { kind: 'percent', value: 15, maxDiscount: 1000 },
      freeGoods: null,
      branchIds: [],
    });
    expect(bill.action).toBe('create');
    expect(bill.payload).toMatchObject({
      scope: { all: true, productIds: [], categoryIds: [] },
      minAmount: 2000,
      discount: { kind: 'amount', value: 100, maxDiscount: null },
      branchIds: [1],
      endDate: null,
    });
    expect(free.action).toBe('create');
    expect(free.payload).toMatchObject({
      discount: null,
      minQty: 2,
      scope: { all: true, productIds: [], categoryIds: [] },
      freeGoods: {
        items: [
          { productId: 3, qty: 1 },
          { productId: 2, qty: 2 },
        ],
        repeat: true,
        maxSets: null,
      },
    });
  });

  it('names unknown codes, bad values and codes repeated in the file', () => {
    const [a, b, c] = validate([
      row(2, {
        code: 'X1',
        name: 'x',
        type: 'ลดราคาสินค้า',
        startDate: '31/2/2569',
        productCodes: 'NOPE',
        discountKind: 'ครึ่ง',
        discountValue: '10',
        enabled: 'yes',
      }),
      row(3, { code: 'X2', name: 'x', type: 'ลดเยอะ', startDate: '1/12/2569' }),
      row(4, {
        code: 'x2',
        name: 'y',
        type: 'ของแถม',
        startDate: '1/12/2569',
        freeItems: 'NB-001:abc',
      }),
    ]);
    expect(a.action).toBe('error');
    expect(a.errors).toEqual(
      expect.arrayContaining([
        'วันเริ่ม ไม่ใช่วันที่ (วัน/เดือน/ปี เช่น 1/12/2569)',
        'ไม่พบSKU NOPE',
        'ชนิดส่วนลด ต้องเป็น % หรือ บาท',
        'เปิดใช้งาน ต้องเป็น Y หรือ N',
      ]),
    );
    expect(b.errors).toEqual(expect.arrayContaining(['รหัส X2 ซ้ำในไฟล์']));
    expect(b.errors.some((e) => e.startsWith('ประเภท "ลดเยอะ" ไม่ถูกต้อง'))).toBe(true);
    expect(c.errors).toContain('จำนวนของแถม NB-001:abc ต้องเป็นตัวเลข');
  });

  it('runs the shared promotion rules (discontinued SKU, end before start)', () => {
    const [a, b] = validate([
      row(2, {
        code: 'X1',
        name: 'x',
        type: 'ลดราคาสินค้า',
        startDate: '1/12/2569',
        productCodes: 'OLD-1',
        discountKind: '%',
        discountValue: '10',
      }),
      row(3, {
        code: 'X2',
        name: 'x',
        type: 'ลดราคาสินค้า',
        startDate: '10/12/2569',
        endDate: '1/12/2569',
        scopeAll: 'Y',
        discountKind: '%',
        discountValue: '10',
      }),
    ]);
    expect(a.errors).toEqual(['OLD-1 เลิกจำหน่ายแล้ว']);
    expect(b.errors).toEqual(['วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม']);
  });

  it('lets only company admins limit a promotion to branches', () => {
    const [own, existing] = validate(
      [
        row(2, {
          code: 'X1',
          name: 'x',
          type: 'ลดท้ายบิล',
          startDate: '1/12/2569',
          discountKind: 'บาท',
          discountValue: '10',
          branchCodes: 'BN',
        }),
        // A stored promotion limited to BN, sent back for every branch
        row(3, {
          code: 'BILL',
          name: 'x',
          type: 'ลดท้ายบิล',
          startDate: '1/11/2569',
          discountKind: 'บาท',
          discountValue: '200',
        }),
      ],
      { isCompanyAdmin: false },
    );
    const scopeError = 'โปรที่จำกัดสาขาสร้าง / แก้ได้เฉพาะผู้ดูแลระบบระดับบริษัท';
    expect(own.errors).toEqual([scopeError]);
    expect(existing.errors).toEqual([scopeError]);
  });

  describe('export', () => {
    const exported = async (list: Promotion[]) => {
      const blob = await exportPromotionsToExcel(list, { products, categories, branches });
      return readPromotionRows(new File([blob], 'promotions.xlsx'));
    };

    it('reads back as unchanged, so nothing is sent', async () => {
      const rows = await exported(promotions);
      expect(rows.map((r) => r.code)).toEqual(['BILL', 'FREE', 'NB10']);
      expect(rows[1]).toMatchObject({ freeItems: 'SV-SETUP:1, MS-001:2', startDate: '1/10/2569' });
      const checked = validate(rows);
      expect(checked.map((r) => r.errors)).toEqual([[], [], []]);
      expect(checked.map((r) => r.action)).toEqual(['unchanged', 'unchanged', 'unchanged']);
    });

    it('a started promotion takes an earlier end date but not a new discount', async () => {
      const rows = await exported(promotions);
      const free = rows.find((r) => r.code === 'FREE')!;
      const bill = rows.find((r) => r.code === 'BILL')!;
      const nb = rows.find((r) => r.code === 'NB10')!;
      const checked = validate([
        { ...free, endDate: '30/11/2569', note: 'ปิดเร็ว' },
        { ...bill, discountValue: '300' },
        { ...nb, discountValue: '20' }, // not started yet: anything may change
      ]);
      expect(checked[0]).toMatchObject({ action: 'update', existingId: 3 });
      expect(checked[0].payload).toMatchObject({ endDate: '2026-11-30', note: 'ปิดเร็ว' });
      expect(checked[1].action).toBe('error');
      expect(checked[1].errors[0]).toContain('โปรที่เริ่มแล้วแก้ได้เฉพาะ');
      expect(checked[2].action).toBe('update');
    });
  });

  it('reads back its own template', async () => {
    const blob = await buildPromotionTemplate({ products, categories, branches });
    const rows = await readPromotionRows(new File([blob], 'promotions.xlsx'));
    expect(rows.map((r) => r.code)).toEqual(['EX-ITEM', 'EX-BILL', 'EX-FREE']);
    const checked = validate(rows);
    expect(checked.map((r) => r.errors)).toEqual([[], [], []]);
    expect(checked.map((r) => r.action)).toEqual(['create', 'create', 'create']);
  });

  it('answers in Thai for a file that is not an xlsx', async () => {
    await expect(readPromotionRows(new File(['not a zip'], 'x.xlsx'))).rejects.toThrow(
      'อ่านไฟล์ไม่สำเร็จ',
    );
  });

  it('parses Thai and Christian years and Excel date cells', () => {
    expect(parseExcelDate('1/12/2569')).toBe('2026-12-01');
    expect(parseExcelDate('01-12-2026')).toBe('2026-12-01');
    expect(parseExcelDate(new Date(Date.UTC(2026, 11, 1)))).toBe('2026-12-01');
    expect(parseExcelDate('')).toBeUndefined();
    expect(parseExcelDate('2026-12-01')).toBeNull();
    expect(parseExcelDate('29/2/2569')).toBeNull();
  });
});
