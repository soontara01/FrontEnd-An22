import { TestBed } from '@angular/core/testing';
import { SALE_DEFAULTS, STORE_INFO_DEFAULTS, Sale, SaleLine, TaxInvoice } from '@core/models';
import { TaxInvoiceDocument } from './tax-invoice-document';
import { TaxInvoiceSlip } from './tax-invoice-slip';

describe('TaxInvoiceDocument', () => {
  const line = (over: Partial<SaleLine>): SaleLine => ({
    productId: 1,
    sku: 'A',
    name: 'โน้ตบุ๊ก',
    shortName: 'โน้ตบุ๊ก',
    unit: 'เครื่อง',
    factor: 1,
    qty: 1,
    unitPrice: 10700,
    listPrice: 10700,
    itemDiscount: 0,
    billDiscount: 0,
    amount: 10700,
    vatType: 'vat7',
    itemType: 'stock',
    vat: 700,
    promotionIds: [],
    freeOfPromotionId: null,
    serial: 'SN-1',
    warrantyMonths: 0,
    cogs: 0,
    ...over,
  });
  const sale: Sale = {
    ...SALE_DEFAULTS,
    id: 1,
    orderNo: 'POS-20261004-0001',
    date: new Date(2026, 9, 4, 10).toISOString(),
    customer: '',
    lines: [
      line({}),
      line({
        name: 'หนังสือ',
        vatType: 'exempt',
        amount: 250.5,
        unitPrice: 250.5,
        vat: 0,
        serial: null,
      }),
    ],
    subtotal: 10950.5,
    total: 10950.5,
    vat: 700,
    itemCount: 2,
    status: 'paid',
    taxInvoiceNo: 'INV-20261004-0001',
  };
  const invoice: TaxInvoice = {
    id: 1,
    invoiceNo: 'INV-20261004-0001',
    saleId: 1,
    orderNo: sale.orderNo,
    saleDate: sale.date,
    date: sale.date,
    buyer: {
      name: 'บริษัท ลูกค้า จำกัด',
      taxId: '0105550123451',
      branchType: 'branch',
      branchNo: '00002',
      address: 'เชียงใหม่',
    },
    issuedBy: 'Admin',
    cancelledAt: null,
    atSale: false,
  };
  const store = { ...STORE_INFO_DEFAULTS, name: 'ร้าน', taxId: '0105550123451', address: 'กทม.' };

  const render = (copy = false, inv = invoice) => {
    const fixture = TestBed.createComponent(TaxInvoiceDocument);
    fixture.componentRef.setInput('sale', sale);
    fixture.componentRef.setInput('invoice', inv);
    fixture.componentRef.setInput('store', store);
    fixture.componentRef.setInput('copy', copy);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, '') ?? '';
  };

  it('shows both parties, the bill reference, VAT split and the total in words', () => {
    const text = render();
    expect(text).toContain('ใบกำกับภาษี/ใบเสร็จรับเงิน');
    expect(text).toContain('ต้นฉบับ');
    expect(text).toContain('บริษัทลูกค้าจำกัด');
    expect(text).toContain('0105550123451(สาขา00002)');
    expect(text).toContain('INV-20261004-0001');
    expect(text).toContain('อ้างอิงใบเสร็จPOS-20261004-0001');
    expect(text).toContain('S/NSN-1');
    expect(text).toContain('มูลค่าสินค้ายกเว้นภาษี250.50');
    expect(text).toContain('มูลค่าสินค้าที่ต้องเสียภาษี10,000.00');
    expect(text).toContain('ภาษีมูลค่าเพิ่ม7%700.00');
    expect(text).toContain('จำนวนเงินรวมทั้งสิ้น10,950.50');
    expect(text).toContain('(หนึ่งหมื่นเก้าร้อยห้าสิบบาทห้าสิบสตางค์)');
  });

  it('refers to the abbreviated receipt only when issued after the sale', () => {
    expect(render()).toContain('ออกแทนใบกำกับภาษีอย่างย่อ');
    const atSale = render(false, { ...invoice, atSale: true });
    expect(atSale).not.toContain('ออกแทน');
    expect(atSale).not.toContain('POS-20261004-0001');
  });

  it('marks copies and cancelled invoices', () => {
    expect(render(true)).toContain('สำเนา');
    expect(render(false, { ...invoice, cancelledAt: sale.date })).toContain('ยกเลิกแล้ว');
  });

  it('prints the same content on the 80 mm slip', () => {
    const fixture = TestBed.createComponent(TaxInvoiceSlip);
    fixture.componentRef.setInput('sale', sale);
    fixture.componentRef.setInput('invoice', { ...invoice, atSale: true });
    fixture.componentRef.setInput('store', store);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, '') ?? '';
    expect(text).toContain('ใบกำกับภาษี/ใบเสร็จรับเงิน');
    expect(text).toContain('ต้นฉบับ');
    expect(text).toContain('ผู้ซื้อบริษัทลูกค้าจำกัด');
    expect(text).toContain('0105550123451(สาขา00002)');
    expect(text).not.toContain('POS-20261004-0001');
    expect(text).toContain('มูลค่าสินค้าที่ต้องเสียภาษี10,000.00');
    expect(text).toContain('ภาษีมูลค่าเพิ่ม7%700.00');
    expect(text).toContain('(หนึ่งหมื่นเก้าร้อยห้าสิบบาทห้าสิบสตางค์)');
    expect(text).not.toContain('ออกแทน');
  });
});
