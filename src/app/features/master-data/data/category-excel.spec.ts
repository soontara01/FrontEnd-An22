import { Category } from '@core/models';
import {
  CategoryRawRow,
  buildCategoryTemplate,
  importPayload,
  readCategoryRows,
  saveOrder,
  validateCategoryRows,
} from './category-excel';

describe('Category Excel import', () => {
  const categories: Category[] = [
    { id: 1, code: 'IT', name: 'ไอที', parentId: null, level: 1, active: true, productCount: 0 },
    {
      id: 2,
      code: 'IT-NB',
      name: 'โน้ตบุ๊ก',
      parentId: 1,
      level: 2,
      active: true,
      productCount: 4,
    },
    { id: 3, code: 'IT-PC', name: 'พีซี', parentId: 1, level: 2, active: true, productCount: 0 },
    {
      id: 4,
      code: 'IT-PC-A',
      name: 'ออลอินวัน',
      parentId: 3,
      level: 3,
      active: false,
      productCount: 0,
    },
  ];
  const row = (rowNo: number, values: Partial<CategoryRawRow>): CategoryRawRow => ({
    rowNo,
    ...values,
  });
  const validate = (...rows: CategoryRawRow[]) => validateCategoryRows(rows, categories);

  it('creates a new department and a child of an existing category', () => {
    const [dept, child] = validate(
      row(2, { code: 'av', name: ' ภาพและเสียง ' }),
      row(3, { code: 'IT-TB', name: 'แท็บเล็ต', parentCode: 'it', active: 'n' }),
    );
    expect(dept).toMatchObject({
      action: 'create',
      code: 'AV',
      name: 'ภาพและเสียง',
      parentCode: '',
      level: 1,
      active: true,
    });
    expect(child).toMatchObject({ action: 'create', parentCode: 'IT', level: 2, active: false });
  });

  it('builds a new tree whatever the order of the rows, parents saved first', () => {
    const rows = validate(
      row(2, { code: 'AV-TV-OLED', name: 'โอแอลอีดี', parentCode: 'AV-TV' }),
      row(3, { code: 'AV-TV', name: 'ทีวี', parentCode: 'AV' }),
      row(4, { code: 'AV', name: 'ภาพและเสียง' }),
    );
    expect(rows.map((r) => r.errors)).toEqual([[], [], []]);
    expect(saveOrder(rows).map((r) => r.code)).toEqual(['AV', 'AV-TV', 'AV-TV-OLED']);
  });

  it('updates by code, blank cells keep the old values', () => {
    const [same, renamed] = validate(
      row(2, { code: 'IT-PC-A' }),
      row(3, { code: 'IT-PC', name: 'คอมตั้งโต๊ะ', parentCode: 'IT', active: 'N' }),
    );
    expect(same).toMatchObject({
      action: 'update',
      existingId: 4,
      name: 'ออลอินวัน',
      parentCode: 'IT-PC',
      active: false,
      level: 3,
    });
    expect(renamed).toMatchObject({ action: 'update', name: 'คอมตั้งโต๊ะ', active: false });
  });

  it('refuses moving a category to another parent', () => {
    const [moved, department] = validate(
      row(2, { code: 'IT-PC', parentCode: 'IT-NB' }),
      row(3, { code: 'IT', parentCode: 'IT-PC' }),
    );
    expect(moved.action).toBe('error');
    expect(moved.errors[0]).toContain('ย้ายหมวดแม่ไม่ได้');
    expect(department.errors[0]).toContain('ระดับแผนก');
  });

  it('checks code, name, the active flag and duplicates in the file', () => {
    const [noCode, badCode, longCode, noName, badFlag, dup1, dup2] = validate(
      row(2, { name: 'ไม่มีรหัส' }),
      row(3, { code: 'ก-1', name: 'ไทย' }),
      row(4, { code: 'A'.repeat(21), name: 'ยาว' }),
      row(5, { code: 'NO-NAME' }),
      row(6, { code: 'FLAG', name: 'x', active: 'yes' }),
      row(7, { code: 'DUP', name: 'x' }),
      row(8, { code: 'dup', name: 'y' }),
    );
    expect(noCode.errors).toEqual(['กรุณากรอกรหัสหมวดหมู่']);
    expect(badCode.errors[0]).toContain('A-Z');
    expect(longCode.errors[0]).toContain('ไม่เกิน 20');
    expect(noName.errors).toEqual(['กรุณากรอกชื่อหมวดหมู่']);
    expect(badFlag.errors).toEqual(['เปิดใช้งาน ต้องเป็น Y หรือ N']);
    expect(dup1.errors).toEqual(['รหัส DUP ซ้ำในไฟล์']);
    expect(dup2.action).toBe('error');
  });

  it('needs a parent that exists and can take children', () => {
    const [missing, hasSku] = validate(
      row(2, { code: 'X-1', name: 'x', parentCode: 'NOPE' }),
      row(3, { code: 'IT-NB-GAME', name: 'เกมมิ่ง', parentCode: 'IT-NB' }),
    );
    expect(missing.errors).toEqual(['ไม่พบหมวดแม่ NOPE']);
    expect(hasSku.errors).toEqual(['โน้ตบุ๊ก มี SKU อยู่ 4 รายการ แบ่งหมวดย่อยไม่ได้']);
  });

  it('stops at 3 levels, counting parents in the file', () => {
    const [underLeaf, l1, l2, l3, l4] = validate(
      row(2, { code: 'DEEP', name: 'x', parentCode: 'IT-PC-A' }),
      row(3, { code: 'A', name: 'x' }),
      row(4, { code: 'B', name: 'x', parentCode: 'A' }),
      row(5, { code: 'C', name: 'x', parentCode: 'B' }),
      row(6, { code: 'D', name: 'x', parentCode: 'C' }),
    );
    expect(underLeaf.errors[0]).toContain('ไม่เกิน 3 ระดับ');
    expect([l1.action, l2.action, l3.action]).toEqual(['create', 'create', 'create']);
    expect(l4.errors[0]).toContain('ไม่เกิน 3 ระดับ');
  });

  it('finds parent loops in the file', () => {
    const [a, b, self] = validate(
      row(2, { code: 'A', name: 'x', parentCode: 'B' }),
      row(3, { code: 'B', name: 'x', parentCode: 'A' }),
      row(4, { code: 'S', name: 'x', parentCode: 'S' }),
    );
    expect(a.errors).toEqual(['หมวดแม่อ้างกันเป็นวง']);
    expect(b.errors).toEqual(['หมวดแม่อ้างกันเป็นวง']);
    expect(self.errors).toEqual(['หมวดแม่อ้างกันเป็นวง']);
  });

  it('fails the children of a new parent row with an error, down the whole chain', () => {
    const [parent, child, grandchild, fine] = validate(
      row(2, { code: 'BAD' }),
      row(3, { code: 'BAD-1', name: 'x', parentCode: 'BAD' }),
      row(4, { code: 'BAD-1-1', name: 'x', parentCode: 'BAD-1' }),
      row(5, { code: 'IT-TB', name: 'x', parentCode: 'IT' }),
    );
    expect(parent.action).toBe('error');
    expect(child.errors).toEqual(['หมวดแม่ BAD (แถว 2) มีข้อผิดพลาด']);
    expect(grandchild.action).toBe('error');
    expect(fine.action).toBe('create');
    expect(saveOrder([parent, child, grandchild, fine]).map((r) => r.code)).toEqual(['IT-TB']);
  });

  it('keeps children of an existing parent whose own row has an error', () => {
    const [parent, child] = validate(
      row(2, { code: 'IT', active: 'maybe' }),
      row(3, { code: 'IT-TB', name: 'x', parentCode: 'IT' }),
    );
    expect(parent.action).toBe('error');
    expect(child.action).toBe('create');
  });

  it('looks up the parent id when the row is saved', () => {
    const [child] = validate(
      row(2, { code: 'AV-TV', name: 'ทีวี', parentCode: 'AV' }),
      row(3, { code: 'AV', name: 'ภาพและเสียง' }),
    );
    expect(importPayload(child, categories)).toBeNull();
    const created: Category = {
      id: 9,
      code: 'AV',
      name: 'ภาพและเสียง',
      parentId: null,
      level: 1,
      active: true,
      productCount: 0,
    };
    expect(importPayload(child, [...categories, created])).toEqual({
      code: 'AV-TV',
      name: 'ทีวี',
      active: true,
      parentId: 9,
    });
  });

  it('keeps the parent of an updated category', () => {
    const [same] = validate(row(2, { code: 'IT-PC-A', name: 'ใหม่' }));
    expect(importPayload(same, categories)?.parentId).toBe(3);
  });

  it('answers in Thai for a file that is not an xlsx', async () => {
    await expect(readCategoryRows(new File(['not a zip'], 'x.xlsx'))).rejects.toThrow(
      'อ่านไฟล์ไม่สำเร็จ',
    );
  });

  it('reads back its own template', async () => {
    const blob = await buildCategoryTemplate(categories);
    const rows = await readCategoryRows(new File([blob], 'categories.xlsx'));
    expect(rows.map((r) => r.code)).toEqual(['EX', 'EX-A', 'EX-A-1']);
    expect(rows[1]).toMatchObject({ rowNo: 3, parentCode: 'EX', active: 'Y' });
    expect(validateCategoryRows(rows, categories).map((r) => r.action)).toEqual([
      'create',
      'create',
      'create',
    ]);
  });
});
