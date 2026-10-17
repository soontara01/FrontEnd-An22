import {
  BRANCH_DEFAULTS,
  Branch,
  COMPANY_INFO_DEFAULTS,
  branchError,
  companyInfoError,
  companyInfoOf,
  isHeadOffice,
  normalizeCompanyCode,
  storeInfoOf,
} from './company.model';

describe('company model', () => {
  const hq: Branch = {
    ...BRANCH_DEFAULTS,
    id: 1,
    code: 'HQ',
    name: 'สำนักงานใหญ่',
    branchNo: '00000',
    address: '99/9 พญาไท',
  };

  it('normalizes the company code', () => {
    expect(normalizeCompanyCode('  demo ')).toBe('DEMO');
  });

  it('knows the head office', () => {
    expect(isHeadOffice(hq)).toBe(true);
    expect(isHeadOffice({ branchNo: '00001' })).toBe(false);
  });

  it('checks a branch: code, number, one active branch, printed details', () => {
    const b = {
      ...BRANCH_DEFAULTS,
      code: 'BKK01',
      name: 'สาขาบางนา',
      branchNo: '00001',
      address: 'บางนา',
    };
    expect(branchError(b, [hq])).toBeNull();
    expect(branchError({ ...b, code: 'bkk-1' }, [hq])).toBe(
      'รหัสสาขาต้องเป็น A-Z หรือ 0-9 ยาว 2–10 ตัว',
    );
    expect(branchError({ ...b, code: 'hq' }, [hq])).toBe('รหัสสาขานี้มีอยู่แล้ว');
    expect(branchError({ ...b, branchNo: '1' }, [hq])).toBe(
      'เลขที่สาขาต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)',
    );
    expect(branchError({ ...b, branchNo: '00000' }, [hq])).toBe('เลขที่สาขานี้มีอยู่แล้ว');
    expect(branchError({ ...b, name: ' ' }, [hq])).toBe('กรุณากรอกชื่อสาขา');
    expect(branchError({ ...b, address: '' }, [hq])).toBe('กรุณากรอกที่อยู่');
    expect(branchError({ ...b, receiptFooter: 'x'.repeat(201) }, [hq])).toBe(
      'ข้อความท้ายใบเสร็จต้องไม่เกิน 200 ตัวอักษร',
    );
    // Editing itself is not a duplicate, but the last active branch stays active.
    expect(branchError(hq, [hq])).toBeNull();
    expect(branchError({ ...hq, active: false }, [hq])).toBe(
      'ต้องมีสาขาที่ใช้งานอยู่อย่างน้อย 1 สาขา',
    );
  });

  it('checks company settings', () => {
    const company = { ...COMPANY_INFO_DEFAULTS, name: 'ร้าน', taxId: '0105550123451' };
    expect(companyInfoError(company)).toBeNull();
    expect(companyInfoError({ ...company, name: ' ' })).toBe('กรุณากรอกชื่อร้าน');
    expect(companyInfoError({ ...company, taxId: '1' })).toBe(
      'เลขประจำตัวผู้เสียภาษีต้องเป็น 13 หลักที่ถูกต้อง',
    );
    expect(companyInfoError({ ...company, shiftMaxHours: 0 })).toBe(
      'ชั่วโมงเตือนกะเปิดค้างต้องเป็นจำนวนเต็ม 1–48',
    );
  });

  it('puts the printed store details together from company + branch (E11)', () => {
    const company = { ...COMPANY_INFO_DEFAULTS, name: 'บริษัท ก จำกัด', taxId: '0105550123451' };
    const info = storeInfoOf(company, hq);
    expect(info).toMatchObject({
      name: 'บริษัท ก จำกัด',
      placeName: 'สำนักงานใหญ่',
      branchType: 'head',
      branchNo: '',
      address: '99/9 พญาไท',
    });
    expect(storeInfoOf(company, { ...hq, branchNo: '00001' })).toMatchObject({
      branchType: 'branch',
      branchNo: '00001',
    });
    expect(companyInfoOf(info)).toEqual(company);
  });
});
