import {
  PosTerminal,
  missingPosId,
  normalizePosTerminal,
  posTerminalError,
  terminalError,
  terminalLabel,
  terminalOrderPrefix,
} from './pos-terminal.model';

describe('pos terminal model', () => {
  const t1: PosTerminal = {
    id: 1,
    name: 'หน้าร้าน',
    posId: 'E051234567890',
    branchId: 1,
    active: true,
  };
  const t2: PosTerminal = { id: 2, name: 'ชั้น 2', posId: '', branchId: 1, active: true };
  const branches = [
    { id: 1, active: true },
    { id: 2, active: false },
  ];

  it('accepts a valid terminal', () => {
    expect(posTerminalError(t2, [t1], branches)).toBeNull();
    expect(posTerminalError({ ...t2, posId: 'E059999' }, [t1], branches)).toBeNull();
  });

  it('validates the number, name and POS ID', () => {
    expect(posTerminalError({ ...t2, id: 0 }, [t1], branches)).toBe(
      'เลขเครื่องต้องเป็นจำนวนเต็ม 1–999',
    );
    expect(posTerminalError({ ...t2, id: 1.5 }, [t1], branches)).toBe(
      'เลขเครื่องต้องเป็นจำนวนเต็ม 1–999',
    );
    expect(posTerminalError({ ...t2, id: 1 }, [t1], branches)).toBe('มีเครื่อง 1 อยู่แล้ว');
    expect(posTerminalError({ ...t2, name: ' ' }, [t1], branches)).toBe('กรุณากรอกชื่อเครื่อง');
    expect(posTerminalError({ ...t2, name: 'x'.repeat(41) }, [t1], branches)).toBe(
      'ชื่อเครื่องต้องไม่เกิน 40 ตัวอักษร',
    );
    expect(posTerminalError({ ...t2, posId: 'x'.repeat(31) }, [t1], branches)).toBe(
      'POS ID ต้องไม่เกิน 30 ตัวอักษร',
    );
    expect(posTerminalError({ ...t2, posId: ' E051234567890 ' }, [t1], branches)).toBe(
      'POS ID E051234567890 ใช้กับเครื่องอื่นแล้ว',
    );
  });

  it('allows several terminals without a POS ID', () => {
    expect(posTerminalError({ ...t2, id: 3 }, [t1, t2], branches)).toBeNull();
  });

  it('labels, trims and warns', () => {
    expect(terminalLabel(1, [t1, t2])).toBe('เครื่อง 1 · หน้าร้าน');
    expect(terminalLabel(9, [t1])).toBe('เครื่อง 9');
    expect(normalizePosTerminal({ ...t1, name: ' a ', posId: ' b ' })).toEqual({
      ...t1,
      name: 'a',
      posId: 'b',
    });
    expect(missingPosId(t2, true)).toBe(true);
    expect(missingPosId(t2, false)).toBe(false);
    expect(missingPosId({ ...t2, active: false }, true)).toBe(false);
    expect(missingPosId(t1, true)).toBe(false);
  });

  it('lets only an active registered terminal sell', () => {
    expect(terminalError(1, [t1, t2], null)).toBeNull();
    expect(terminalError(null, [t1], null)).toBe(
      'เครื่องนี้ยังไม่ได้ตั้งเลขเครื่อง POS กรุณาให้ผู้ดูแลตั้งค่าที่เมนูตั้งค่า',
    );
    expect(terminalError(3, [t1], null)).toBe(
      'ไม่พบเครื่อง 3 ในทะเบียนเครื่อง POS กรุณาให้ผู้ดูแลตั้งค่าใหม่',
    );
    expect(terminalError(2, [{ ...t2, active: false }], null)).toBe(
      'เครื่อง 2 ถูกปิดใช้งาน กรุณาให้ผู้ดูแลตั้งค่าใหม่',
    );
  });

  it('needs an active branch and sells only in its own branch (E8)', () => {
    expect(posTerminalError({ ...t2, branchId: 9 }, [t1], branches)).toBe(
      'กรุณาเลือกสาขาของเครื่อง',
    );
    expect(posTerminalError({ ...t2, branchId: 2 }, [t1], branches)).toBe(
      'สาขานี้ปิดใช้งานแล้ว เครื่องที่ใช้งานต้องอยู่สาขาที่ใช้งาน',
    );
    expect(posTerminalError({ ...t2, branchId: 2, active: false }, [t1], branches)).toBeNull();
    expect(terminalError(1, [t1], 1)).toBeNull();
    expect(terminalError(1, [t1], 2)).toBe(
      'เครื่อง 1 เป็นเครื่องของสาขาอื่น — สลับไปสาขาของเครื่อง หรือให้ผู้ดูแลตั้งเครื่องนี้ใหม่',
    );
    expect(terminalError(1, [t1], 2, [{ id: 1, code: 'HQ', name: 'สำนักงานใหญ่' }])).toBe(
      'เครื่อง 1 เป็นเครื่องของสาขา HQ · สำนักงานใหญ่ — สลับไปสาขานั้น หรือให้ผู้ดูแลตั้งเครื่องนี้ใหม่',
    );
  });

  it('numbers bills per terminal and day', () => {
    expect(terminalOrderPrefix('HQ', 2, '2026-10-12')).toBe('POS-HQ-2-20261012-');
  });
});
