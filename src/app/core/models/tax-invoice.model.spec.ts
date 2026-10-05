import {
  EMPTY_BUYER,
  buyerBranchLabel,
  buyerError,
  buyerIdLabel,
  buyerIdShort,
  defaultBuyerBranch,
  invoiceTotals,
  currentInvoice,
  invoiceRefState,
  normalizeBuyer,
  reissueError,
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
      idType: 'tax_id',
      taxId: '0105550123451',
      branchType: 'head',
      branchNo: '',
      address: 'กรุงเทพฯ',
    });
  });

  it('identifies a foreign buyer by passport number, without a branch', () => {
    const tourist = normalizeBuyer({
      name: 'John Smith',
      idType: 'passport',
      taxId: ' ab-1234567 ',
      branchType: 'branch',
      branchNo: '00001',
      address: 'Hotel ABC, Bangkok',
    });
    expect(tourist).toMatchObject({ taxId: 'AB1234567', branchType: 'none', branchNo: '' });
    expect(buyerError(tourist)).toBeNull();
    expect(buyerError({ ...tourist, taxId: 'AB12' })).toBe(
      'เลขที่หนังสือเดินทางต้องเป็นตัวอักษรอังกฤษ/ตัวเลข 6–20 ตัว',
    );
    expect(buyerError({ ...tourist, taxId: 'AB/123456' })).not.toBeNull();
    expect(buyerIdLabel(tourist)).toBe('เลขที่หนังสือเดินทาง');
    expect(buyerIdShort(tourist)).toBe('Passport AB1234567');
    expect(buyerIdLabel(buyer)).toBe('เลขประจำตัวผู้เสียภาษี');
    expect(buyerIdShort(buyer)).toBe('0105550123451');
    // stored before the ID type existed → Thai tax ID
    expect(normalizeBuyer({ ...buyer, idType: undefined }).idType).toBe('tax_id');
  });

  it('keeps "no branch" for buyers who are not VAT registrants', () => {
    const person = normalizeBuyer({ ...buyer, branchType: 'none', branchNo: '00001' });
    expect(person.branchType).toBe('none');
    expect(person.branchNo).toBe('');
    expect(buyerError(person)).toBeNull();
    expect(buyerBranchLabel(person)).toBe('');
    expect(buyerBranchLabel(buyer)).toBe('สำนักงานใหญ่');
    expect(buyerBranchLabel({ branchType: 'branch', branchNo: '00002' })).toBe('สาขา 00002');
    expect(EMPTY_BUYER.branchType).toBe('none');
  });

  it('suggests head office for a company tax ID and no branch for a national ID', () => {
    expect(defaultBuyerBranch('0-1055-50123-45-1')).toBe('head');
    expect(defaultBuyerBranch('1101700230708')).toBe('none');
    expect(defaultBuyerBranch('')).toBe('none');
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

  it('cancels and reissues only a valid invoice of a paid bill, with a reason', () => {
    const valid = { cancelledAt: null };
    expect(reissueError({ status: 'paid' }, valid, buyer, 'ชื่อผิด')).toBeNull();
    expect(reissueError({ status: 'paid' }, valid, buyer, ' ')).toBe(
      'กรุณาระบุเหตุผลที่ยกเลิกใบเดิม',
    );
    expect(reissueError({ status: 'paid' }, null, buyer, 'x')).toBe(
      'บิลนี้ไม่มีใบกำกับภาษีเต็มรูปที่ใช้งานอยู่',
    );
    expect(reissueError({ status: 'paid' }, { cancelledAt: 'x' }, buyer, 'x')).toBe(
      'บิลนี้ไม่มีใบกำกับภาษีเต็มรูปที่ใช้งานอยู่',
    );
    expect(reissueError({ status: 'cancelled' }, valid, buyer, 'x')).toBe(
      'ออกใบใหม่ได้เฉพาะบิลที่ชำระแล้ว',
    );
    expect(reissueError({ status: 'paid' }, valid, { ...buyer, name: '' }, 'x')).toBe(
      'กรุณากรอกชื่อผู้ซื้อ',
    );
  });

  it('picks the valid invoice of a bill, else the latest', () => {
    const a = { id: 1, cancelledAt: 'x' } as never;
    const b = { id: 2, cancelledAt: null } as never;
    expect(currentInvoice([a, b])).toBe(b);
    expect(currentInvoice([a])).toBe(a);
    expect(currentInvoice([])).toBeNull();
  });

  it('follows a cancelled invoice quoted by an earlier document to its valid replacement', () => {
    const inv = (invoiceNo: string, cancelledAt: string | null, replacedByNo: string | null) => ({
      invoiceNo,
      cancelledAt,
      replacedByNo,
    });
    const list = [
      inv('INV-1', 'x', 'INV-2'),
      inv('INV-2', 'x', 'INV-3'),
      inv('INV-3', null, null),
      inv('INV-9', 'x', null),
    ];
    expect(invoiceRefState('INV-3', list)).toBeNull();
    expect(invoiceRefState('INV-404', list)).toBeNull();
    expect(invoiceRefState('INV-1', list)).toEqual({ replacedBy: 'INV-3' });
    expect(invoiceRefState('INV-2', list)).toEqual({ replacedBy: 'INV-3' });
    expect(invoiceRefState('INV-9', list)).toEqual({ replacedBy: null });
    expect(invoiceRefState('A', [inv('A', 'x', 'B'), inv('B', 'x', 'A')])).toEqual({
      replacedBy: null,
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
