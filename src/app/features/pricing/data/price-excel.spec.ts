import { PRODUCT_DEFAULTS, Product, SkuPrice } from '@core/models';
import {
  PriceRawRow,
  buildPriceTemplate,
  exportPricesToExcel,
  readPriceRows,
  saveOrder,
  validatePriceRows,
} from './price-excel';

describe('Price Excel import', () => {
  const product = (id: number, sku: string): Product => ({
    ...PRODUCT_DEFAULTS,
    id,
    sku,
    name: `สินค้า ${sku}`,
  });
  const products = [product(1, 'NB-001'), product(2, 'MS-001')];
  const prices: SkuPrice[] = [
    { id: 1, productId: 1, price: 26900, startDate: '2026-01-01', endDate: '2026-06-30', note: '' },
    { id: 2, productId: 1, price: 24900, startDate: '2026-07-01', endDate: '2026-12-31', note: '' },
    { id: 3, productId: 1, price: 23900, startDate: '2027-01-01', endDate: null, note: 'ปีใหม่' },
    { id: 4, productId: 2, price: 590, startDate: '2026-01-01', endDate: null, note: '' },
  ];
  const today = '2026-11-13';
  const row = (rowNo: number, values: Partial<PriceRawRow>): PriceRawRow => ({ rowNo, ...values });
  const validate = (...rows: PriceRawRow[]) => validatePriceRows(rows, products, prices);
  const exported = async () => {
    const blob = await exportPricesToExcel(prices, products, today);
    return readPriceRows(new File([blob], 'prices.xlsx'));
  };

  it('exports current + scheduled periods that read back unchanged', async () => {
    const rows = await exported();
    expect(rows.map((r) => [r.sku, r.price, r.startDate, r.endDate ?? ''])).toEqual([
      ['MS-001', '590', '1/1/2569', ''],
      ['NB-001', '24900', '1/7/2569', '31/12/2569'],
      ['NB-001', '23900', '1/1/2570', ''],
    ]);
    expect(rows[0].name).toBeUndefined(); // reference column is not read
    const checked = validatePriceRows(rows, products, prices);
    expect(checked.map((r) => r.errors)).toEqual([[], [], []]);
    expect(checked.map((r) => r.action)).toEqual(['unchanged', 'unchanged', 'unchanged']);
    expect(saveOrder(checked)).toEqual([]);
  });

  it('ends the open current price the day before a new open price', () => {
    const [r] = validate(row(2, { sku: 'ms-001', price: '550', startDate: '1/12/2569' }));
    expect(r).toMatchObject({
      action: 'create',
      sku: 'MS-001',
      payload: { productId: 2, price: 550, startDate: '2026-12-01', endDate: null, note: '' },
    });
    expect(r.closes).toEqual([
      {
        id: 4,
        payload: {
          productId: 2,
          price: 590,
          startDate: '2026-01-01',
          endDate: '2026-11-30',
          note: '',
        },
        label: expect.stringContaining('฿590'),
      },
    ]);
  });

  it('moves the end of an exported row instead when it is in the file too', async () => {
    const rows = await exported();
    const checked = validatePriceRows(
      [...rows, row(9, { sku: 'MS-001', price: '550', startDate: '1/12/2569' })],
      products,
      prices,
    );
    const old = checked.find((r) => r.existingId === 4)!;
    const fresh = checked.find((r) => r.rowNo === 9)!;
    expect(old).toMatchObject({ action: 'update', payload: { endDate: '2026-11-30' } });
    expect(old.closedFor).toContain('แถว 9');
    expect(fresh).toMatchObject({ action: 'create', closes: [] });
    expect(saveOrder(checked).map((r) => r.rowNo)).toEqual([old.rowNo, 9]);
  });

  it('refuses an overlap that closing cannot fix', () => {
    const [laterPeriod, shorter, ownRows] = validate(
      // runs into the scheduled 23,900 from 1/1/2570
      row(2, { sku: 'NB-001', price: '22900', startDate: '1/12/2569' }),
      // the open 590 would be left without a price after 31/12/2569
      row(3, { sku: 'MS-001', price: '550', startDate: '1/12/2569', endDate: '31/12/2569' }),
      // a new row of the file is never moved
      row(4, { sku: 'MS-001', price: '500', startDate: '15/12/2569' }),
    );
    expect(laterPeriod.errors).toEqual([expect.stringContaining('฿23,900')]);
    expect(laterPeriod.closes).toEqual([]);
    expect(shorter.errors).toEqual([expect.stringContaining('฿590')]);
    expect(ownRows.action).toBe('create'); // row 3 failed, so it closes the open 590 itself
    expect(ownRows.closes.map((c) => c.payload.endDate)).toEqual(['2026-12-14']);
  });

  it('updates a scheduled period matched by SKU + start date', () => {
    const [r] = validate(
      row(2, { sku: 'NB-001', price: '23,500', startDate: '1/1/2027', note: 'ปีใหม่' }),
    );
    expect(r).toMatchObject({ action: 'update', existingId: 3, closes: [] });
    expect(r.payload?.price).toBe(23500);
  });

  it('names bad cells and start dates repeated for one SKU', () => {
    const [a, b, c, d, e] = validate(
      row(2, { sku: 'NOPE', price: '10', startDate: '1/12/2569' }),
      row(3, { sku: 'NB-001', price: '-5', startDate: '31/2/2569' }),
      row(4, { sku: 'NB-001', price: '1.555', startDate: '1/12/2569', endDate: '1/11/2569' }),
      row(5, { sku: 'MS-001', price: '500', startDate: '1/3/2570' }),
      row(6, { sku: 'MS-001', price: '510', startDate: '1/3/2570' }),
    );
    expect(a.errors).toEqual(['ไม่พบ SKU NOPE']);
    expect(b.errors).toEqual([
      'ราคาต้องไม่ติดลบ',
      'วันเริ่ม ไม่ใช่วันที่ (วัน/เดือน/ปี เช่น 1/12/2569)',
    ]);
    expect(c.errors).toEqual([
      'ราคาทศนิยมไม่เกิน 2 ตำแหน่ง',
      'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม',
    ]);
    expect(d.errors).toEqual(['วันเริ่ม 1/3/2570 ซ้ำในไฟล์ (SKU เดียวกัน)']);
    expect(e.action).toBe('error');
  });

  it('reads back its own template', async () => {
    const blob = await buildPriceTemplate(products);
    const rows = await readPriceRows(new File([blob], 'prices.xlsx'));
    const checked = validatePriceRows(rows, products, prices);
    expect(checked.map((r) => [r.sku, r.action])).toEqual([
      ['MS-001', 'create'],
      ['NB-001', 'update'], // same start as the scheduled 23,900 → edits it
    ]);
    expect(checked[0].closes).toHaveLength(1);
  });

  it('answers in Thai for a file that is not an xlsx', async () => {
    await expect(readPriceRows(new File(['not a zip'], 'x.xlsx'))).rejects.toThrow(
      'อ่านไฟล์ไม่สำเร็จ',
    );
  });
});
