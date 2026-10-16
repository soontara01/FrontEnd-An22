import { Branch, branchError, isHeadOffice, normalizeCompanyCode } from './company.model';

describe('company model', () => {
  const hq: Branch = { id: 1, code: 'HQ', name: 'สำนักงานใหญ่', branchNo: '00000', active: true };

  it('normalizes the company code', () => {
    expect(normalizeCompanyCode('  demo ')).toBe('DEMO');
  });

  it('knows the head office', () => {
    expect(isHeadOffice(hq)).toBe(true);
    expect(isHeadOffice({ branchNo: '00001' })).toBe(false);
  });

  it('checks a branch: code, name, branch number, unique within the company', () => {
    const b = { code: 'BKK01', name: 'สาขาบางนา', branchNo: '00001' };
    expect(branchError(b, [hq])).toBeNull();
    expect(branchError({ ...b, code: 'bkk-1' }, [hq])).toBe(
      'รหัสสาขาต้องเป็น A-Z หรือ 0-9 ยาว 2–10 ตัว',
    );
    expect(branchError({ ...b, code: 'hq' }, [hq])).toBe('รหัสสาขานี้มีอยู่แล้ว');
    expect(branchError({ ...b, name: ' ' }, [hq])).toBe('กรุณากรอกชื่อสาขา');
    expect(branchError({ ...b, branchNo: '1' }, [hq])).toBe(
      'เลขที่สาขาต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)',
    );
    expect(branchError({ ...b, branchNo: '00000' }, [hq])).toBe('เลขที่สาขานี้มีอยู่แล้ว');
    // Editing itself is not a duplicate.
    expect(branchError(hq, [hq])).toBeNull();
  });
});
