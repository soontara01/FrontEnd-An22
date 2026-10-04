import {
  STORE_INFO_DEFAULTS,
  normalizeStoreInfo,
  receiptTitle,
  storeInfoError,
} from './store-info.model';

describe('store info model', () => {
  const valid = {
    ...STORE_INFO_DEFAULTS,
    name: 'ร้านทดสอบ',
    taxId: '0105550123451',
    address: 'กรุงเทพฯ',
  };

  it('accepts a complete VAT-registered store', () => {
    expect(storeInfoError(valid)).toBeNull();
  });

  it('validates name, tax ID, branch number and address', () => {
    expect(storeInfoError({ ...valid, name: ' ' })).toBe('กรุณากรอกชื่อร้าน');
    expect(storeInfoError({ ...valid, taxId: '0105550123452' })).toBe(
      'เลขประจำตัวผู้เสียภาษีต้องเป็น 13 หลักที่ถูกต้อง',
    );
    expect(storeInfoError({ ...valid, vatRegistered: false, taxId: '' })).toBeNull();
    expect(storeInfoError({ ...valid, vatRegistered: false, taxId: '123' })).toBe(
      'เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง',
    );
    expect(storeInfoError({ ...valid, branchType: 'branch', branchNo: '12' })).toBe(
      'เลขที่สาขาต้องเป็นตัวเลข 5 หลัก',
    );
    expect(storeInfoError({ ...valid, branchType: 'branch', branchNo: '00012' })).toBeNull();
    expect(storeInfoError({ ...valid, address: '' })).toBe('กรุณากรอกที่อยู่');
  });

  it('normalizes text and drops the branch number of a head office', () => {
    const n = normalizeStoreInfo({
      ...valid,
      name: ' A ',
      taxId: '0-1055-50123-45-1',
      branchNo: '00001',
    });
    expect(n).toMatchObject({ name: 'A', taxId: '0105550123451', branchNo: '' });
  });

  it('titles the receipt by VAT registration', () => {
    expect(receiptTitle({ vatRegistered: true })).toBe('ใบกำกับภาษีอย่างย่อ/ใบเสร็จรับเงิน');
    expect(receiptTitle({ vatRegistered: false })).toBe('ใบเสร็จรับเงิน');
  });
});
