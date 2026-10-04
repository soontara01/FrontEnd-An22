import { TestBed } from '@angular/core/testing';
import { SALE_DEFAULTS, STORE_INFO_DEFAULTS, Sale, SaleLine, StoreInfo } from '@core/models';
import { Receipt } from './receipt';

describe('Receipt', () => {
  const line = (over: Partial<SaleLine>): SaleLine => ({
    productId: 1,
    sku: 'A',
    name: 'สินค้า A',
    shortName: 'สินค้า A',
    unit: 'ชิ้น',
    factor: 1,
    qty: 1,
    unitPrice: 107,
    listPrice: 107,
    itemDiscount: 0,
    billDiscount: 0,
    amount: 107,
    vatType: 'vat7',
    itemType: 'stock',
    vat: 7,
    promotionIds: [],
    freeOfPromotionId: null,
    serial: null,
    warrantyMonths: 0,
    cogs: 0,
    ...over,
  });
  const sale: Sale = {
    ...SALE_DEFAULTS,
    id: 1,
    orderNo: 'POS-20261004-0001',
    date: new Date(2026, 9, 4, 14, 5).toISOString(),
    customer: '',
    lines: [
      line({ serial: 'SN1', warrantyMonths: 12, itemDiscount: 7, amount: 100, vat: 6.54 }),
      line({
        sku: 'B',
        shortName: 'หนังสือ',
        vatType: 'exempt',
        unitPrice: 50,
        amount: 50,
        vat: 0,
      }),
    ],
    payments: [
      {
        methodId: 1,
        name: 'เงินสด',
        type: 'cash',
        amount: 150,
        tendered: 200,
        reference: '',
        installmentMonths: null,
      },
    ],
    subtotal: 157,
    itemDiscount: 7,
    total: 150,
    vat: 6.54,
    change: 50,
    itemCount: 2,
    status: 'paid',
  };
  const store: StoreInfo = {
    ...STORE_INFO_DEFAULTS,
    name: 'ร้านทดสอบ',
    taxId: '0105550123451',
    address: 'กรุงเทพฯ',
    posId: 'POS-1',
  };

  const render = (inputs: { sale?: Sale; store?: StoreInfo; copy?: boolean } = {}) => {
    const fixture = TestBed.createComponent(Receipt);
    fixture.componentRef.setInput('sale', inputs.sale ?? sale);
    fixture.componentRef.setInput('store', inputs.store ?? store);
    fixture.componentRef.setInput('copy', inputs.copy ?? false);
    fixture.detectChanges();
    // Whitespace-free, so adjacent <span>s compare like printed columns.
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, '') ?? '';
  };

  it('prints an abbreviated tax invoice with VAT-able / exempt amounts', () => {
    const text = render();
    expect(text).toContain('ใบกำกับภาษีอย่างย่อ/ใบเสร็จรับเงิน');
    expect(text).toContain('เลขประจำตัวผู้เสียภาษี0105550123451(สำนักงานใหญ่)');
    expect(text).toContain('POSIDPOS-1');
    expect(text).toContain('POS-20261004-0001');
    expect(text).toContain('SNSN1');
    expect(text).toContain('รับประกัน12เดือน');
    expect(text).toContain('มูลค่าสินค้ามีภาษี93.46');
    expect(text).toContain('ภาษีมูลค่าเพิ่ม7%6.54');
    expect(text).toContain('มูลค่าสินค้ายกเว้นภาษี(E)50.00');
    expect(text).toContain('เงินทอน50.00');
    expect(text).not.toContain('สำเนา');
  });

  it('prints a plain receipt for a non-VAT store and marks copies / voided bills', () => {
    const text = render({
      store: { ...store, vatRegistered: false },
      sale: { ...sale, status: 'cancelled' },
      copy: true,
    });
    expect(text).toContain('ใบเสร็จรับเงิน');
    expect(text).not.toContain('ใบกำกับภาษี');
    expect(text).not.toContain('ภาษีมูลค่าเพิ่ม7%');
    expect(text).toContain('***สำเนา***');
    expect(text).toContain('***ยกเลิกแล้ว***');
  });
});
