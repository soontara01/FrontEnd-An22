import {
  PosTerminal,
  missingPosId,
  normalizePosTerminal,
  posTerminalError,
  terminalLabel,
  terminalOrderPrefix,
} from './pos-terminal.model';

describe('pos terminal model', () => {
  const t1: PosTerminal = { id: 1, name: 'หน้าร้าน', posId: 'E051234567890', active: true };
  const t2: PosTerminal = { id: 2, name: 'ชั้น 2', posId: '', active: true };

  it('accepts a valid terminal', () => {
    expect(posTerminalError(t2, [t1])).toBeNull();
    expect(posTerminalError({ ...t2, posId: 'E059999' }, [t1])).toBeNull();
  });

  it('validates the number, name and POS ID', () => {
    expect(posTerminalError({ ...t2, id: 0 }, [t1])).toBe('เลขเครื่องต้องเป็นจำนวนเต็ม 1–999');
    expect(posTerminalError({ ...t2, id: 1.5 }, [t1])).toBe('เลขเครื่องต้องเป็นจำนวนเต็ม 1–999');
    expect(posTerminalError({ ...t2, id: 1 }, [t1])).toBe('มีเครื่อง 1 อยู่แล้ว');
    expect(posTerminalError({ ...t2, name: ' ' }, [t1])).toBe('กรุณากรอกชื่อเครื่อง');
    expect(posTerminalError({ ...t2, name: 'x'.repeat(41) }, [t1])).toBe(
      'ชื่อเครื่องต้องไม่เกิน 40 ตัวอักษร',
    );
    expect(posTerminalError({ ...t2, posId: 'x'.repeat(31) }, [t1])).toBe(
      'POS ID ต้องไม่เกิน 30 ตัวอักษร',
    );
    expect(posTerminalError({ ...t2, posId: ' E051234567890 ' }, [t1])).toBe(
      'POS ID E051234567890 ใช้กับเครื่องอื่นแล้ว',
    );
  });

  it('allows several terminals without a POS ID', () => {
    expect(posTerminalError({ ...t2, id: 3 }, [t1, t2])).toBeNull();
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

  it('numbers bills per terminal and day', () => {
    expect(terminalOrderPrefix(2, '2026-10-12')).toBe('POS2-20261012-');
  });
});
