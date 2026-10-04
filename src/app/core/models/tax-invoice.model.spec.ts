import {
  EMPTY_BUYER,
  buyerError,
  invoiceTotals,
  normalizeBuyer,
  taxInvoiceError,
} from './tax-invoice.model';

describe('tax invoice model', () => {
  const buyer = normalizeBuyer({
    name: ' บริษัท ลูกค้า จำกัด ',
    taxId: '0-1055-50123-45-1',
    branchType: 'head',
    branchNo: '00009',
    address: ' กรุงเทพฯ ',
  });
  const sale = { status: 'paid' as const, lines: [{}] as never[], taxInvoiceNo: null };

  it('normalizes buyer text, tax ID and the branch of a head office', () => {
    expect(buyer).toEqual({
      name: 'บริษัท ลูกค้า จำกัด',
      taxId: '0105550123451',
      branchType: 'head',
      branchNo: '',
      address: 'กรุงเทพฯ',
    });
  });

  it('validates the buyer', () => {
    expect(buyerError(buyer)).toBeNull();
    expect(buyerError(EMPTY_BUYER)).toBe('กรุณากรอกชื่อผู้ซื้อ');
    expect(buyerError({ ...buyer, taxId: '0105550123452' })).toBe(
      'เลขประจำตัวผู้เสียภาษีผู้ซื้อต้องเป็น 13 หลักที่ถูกต้อง',
    );
    expect(buyerError({ ...buyer, branchType: 'branch', branchNo: '1' })).toBe(
      'เลขที่สาขาผู้ซื้อต้องเป็นตัวเลข 5 หลัก',
    );
    expect(buyerError({ ...buyer, address: '' })).toBe('กรุณากรอกที่อยู่ผู้ซื้อ');
  });

  it('splits the total into VAT-able net, VAT and exempt goods', () => {
    const lines = [
      { vatType: 'vat7', amount: 10700 },
      { vatType: 'exempt', amount: 250.5 },
    ] as never[];
    expect(invoiceTotals({ lines, total: 10950.5, vat: 700 })).toEqual({
      net: 10000,
      vat: 700,
      exempt: 250.5,
      total: 10950.5,
    });
  });

  it('issues once per paid POS bill of a VAT-registered store', () => {
    expect(taxInvoiceError(sale, buyer)).toBeNull();
    expect(taxInvoiceError(sale, buyer, { vatRegistered: false })).toBe(
      'ร้านไม่ได้จดทะเบียน VAT ออกใบกำกับภาษีไม่ได้',
    );
    expect(taxInvoiceError({ ...sale, status: 'cancelled' }, buyer)).toBe(
      'ออกใบกำกับภาษีได้เฉพาะบิลขายหน้าร้านที่ชำระแล้ว',
    );
    expect(taxInvoiceError({ ...sale, lines: [] }, buyer)).toBe(
      'ออกใบกำกับภาษีได้เฉพาะบิลขายหน้าร้านที่ชำระแล้ว',
    );
    expect(taxInvoiceError({ ...sale, taxInvoiceNo: 'INV-1' }, buyer)).toBe(
      'บิลนี้ออกใบกำกับภาษีเต็มรูปแล้ว (INV-1)',
    );
  });
});
