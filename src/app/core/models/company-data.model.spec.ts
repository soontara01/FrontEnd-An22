import { deletionRequestError, purgeError } from './company-data.model';

describe('company data (E38 / E39)', () => {
  it('asks for the company code typed back and a password', () => {
    const p = { companyCode: ' demo ', password: 'x', reason: '' };
    expect(deletionRequestError(p, 'DEMO')).toBeNull();
    expect(deletionRequestError({ ...p, companyCode: 'DEM' }, 'DEMO')).toBe(
      'พิมพ์รหัสบริษัทให้ตรงเพื่อยืนยัน',
    );
    expect(deletionRequestError({ ...p, password: '' }, 'DEMO')).toBe(
      'กรุณากรอกรหัสผ่านเพื่อยืนยัน',
    );
  });

  it('lets the platform delete only a due request', () => {
    const d = { requestedAt: '', requestedBy: '', reason: '', purgeAfter: '2026-11-17' };
    expect(purgeError(null, '2026-12-01')).toBe('บริษัทนี้ไม่ได้ขอลบข้อมูล');
    expect(purgeError(d, '2026-11-16')).toBe('ลบข้อมูลได้ตั้งแต่วันที่ 17/11/2569');
    expect(purgeError(d, '2026-11-17')).toBeNull();
  });
});
