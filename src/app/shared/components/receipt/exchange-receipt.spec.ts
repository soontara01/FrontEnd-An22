import { TestBed } from '@angular/core/testing';
import { Exchange, SALE_DEFAULTS, STORE_INFO_DEFAULTS, Sale, SaleLine } from '@core/models';
import { ExchangeReceipt } from './exchange-receipt';

describe('ExchangeReceipt', () => {
  const line = { serial: 'NB-1', warrantyMonths: 12, unit: 'เครื่อง' } as SaleLine;
  const sale: Sale = {
    ...SALE_DEFAULTS,
    id: 1,
    orderNo: 'POS-20261001-0001',
    date: new Date(2026, 9, 1, 10, 0).toISOString(),
    customer: '',
    lines: [line],
    subtotal: 24900,
    total: 24900,
    itemCount: 1,
    status: 'paid',
  };
  const exchange: Exchange = {
    id: 1,
    exNo: 'EX-20261005-0001',
    saleId: 1,
    orderNo: sale.orderNo,
    saleDate: sale.date,
    date: new Date(2026, 9, 5, 11, 0).toISOString(),
    cashier: 'Admin',
    reason: 'เครื่องเปิดไม่ติด',
    lines: [
      {
        saleLineIndex: 0,
        productId: 1,
        sku: 'NB',
        name: 'โน้ตบุ๊ก',
        shortName: 'โน้ตบุ๊ก',
        unit: 'เครื่อง',
        factor: 1,
        qty: 1,
        oldSerial: 'NB-1',
        newSerial: 'NB-2',
        restock: false,
        costIn: 19900,
        costOut: 19900,
      },
    ],
  };

  it('shows the bill, old → new serial and the warranty from the sale day', () => {
    const fixture = TestBed.createComponent(ExchangeReceipt);
    fixture.componentRef.setInput('exchange', exchange);
    fixture.componentRef.setInput('sale', sale);
    fixture.componentRef.setInput('store', { ...STORE_INFO_DEFAULTS, name: 'ร้าน' });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, '') ?? '';
    expect(text).toContain('ใบเปลี่ยนสินค้า');
    expect(text).toContain('EX-20261005-0001');
    expect(text).toContain('อ้างอิงบิลPOS-20261001-0001');
    expect(text).toContain('คืนSNNB-1');
    expect(text).toContain('รับSNNB-2');
    expect(text).toContain('ของเดิม:ชำรุด');
    expect(text).toContain('รับประกันถึง1ต.ค.2570(นับจากวันขายเดิม)');
  });
});
