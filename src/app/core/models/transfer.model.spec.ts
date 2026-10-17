import {
  Transfer,
  TransferContext,
  TransferPayload,
  cancelTransferError,
  receiveTransferError,
  shortQty,
  transferError,
} from './transfer.model';

describe('transfer model', () => {
  const ctx: TransferContext = {
    fromBranchId: 1,
    branches: [
      { id: 1, code: 'HQ', active: true },
      { id: 2, code: 'BN', active: true },
      { id: 3, code: 'OLD', active: false },
    ],
    products: [
      { id: 1, sku: 'NB', stock: 2, unit: 'เครื่อง', serialControl: true, itemType: 'stock' },
      { id: 2, sku: 'MS', stock: 5, unit: 'ชิ้น', serialControl: false, itemType: 'stock' },
      { id: 9, sku: 'SV', stock: 0, unit: 'ครั้ง', serialControl: false, itemType: 'service' },
    ],
    serials: [
      { serial: 'NB-1', productId: 1, branchId: 1, status: 'in_stock' },
      { serial: 'NB-2', productId: 1, branchId: 2, status: 'in_stock' },
      { serial: 'NB-3', productId: 1, branchId: 1, status: 'in_transit' },
    ],
  };
  const send = (lines: TransferPayload['lines'], toBranchId = 2): TransferPayload => ({
    toBranchId,
    lines,
    note: '',
  });

  it('checks a new transfer against the source stock (E26)', () => {
    expect(
      transferError(
        send([
          { productId: 2, qty: 5, serials: [] },
          { productId: 1, qty: 1, serials: ['NB-1'] },
        ]),
        ctx,
      ),
    ).toBeNull();
    expect(transferError(send([], 1), ctx)).toBe('สาขาปลายทางต้องไม่ใช่สาขาต้นทาง');
    expect(transferError(send([], 3), ctx)).toBe('สาขา OLD ปิดใช้งานแล้ว');
    expect(transferError(send([]), ctx)).toBe('ยังไม่มีรายการสินค้าที่จะโอน');
    expect(transferError(send([{ productId: 2, qty: 6, serials: [] }]), ctx)).toBe(
      'MS มีสต็อกไม่พอ (คงเหลือ 5 ชิ้น)',
    );
    expect(transferError(send([{ productId: 9, qty: 1, serials: [] }]), ctx)).toBe(
      'SV เป็นสินค้าบริการ ไม่มีสต็อก',
    );
    // Another branch's unit, or one already on the road, cannot be sent from here.
    for (const serial of ['NB-2', 'NB-3']) {
      expect(transferError(send([{ productId: 1, qty: 1, serials: [serial] }]), ctx)).toBe(
        `ซีเรียล ${serial} ไม่อยู่ในคลังของ NB ที่สาขานี้`,
      );
    }
    expect(transferError(send([{ productId: 1, qty: 2, serials: ['NB-1'] }]), ctx)).toBe(
      'NB: จำนวนต้องเท่ากับจำนวน Serial',
    );
  });

  const sent = {
    status: 'in_transit' as const,
    fromBranchId: 1,
    toBranchId: 2,
    lines: [
      { productId: 2, sku: 'MS', qty: 3, serials: [] as string[] },
      { productId: 1, sku: 'NB', qty: 2, serials: ['NB-1', 'NB-4'] },
    ],
  } as Pick<Transfer, 'status' | 'fromBranchId' | 'toBranchId' | 'lines'>;

  it('receives once at the destination; a shortfall needs a reason (E27)', () => {
    const all = {
      lines: [
        { productId: 2, receivedQty: 3, receivedSerials: [] },
        { productId: 1, receivedQty: 2, receivedSerials: ['NB-1', 'NB-4'] },
      ],
      shortReason: '',
    };
    expect(receiveTransferError(sent, all, 2)).toBeNull();
    expect(receiveTransferError(sent, all, 1)).toBe('รับของได้ที่สาขาปลายทางเท่านั้น');
    const short = {
      lines: [
        { productId: 2, receivedQty: 2, receivedSerials: [] },
        { productId: 1, receivedQty: 1, receivedSerials: ['NB-1'] },
      ],
      shortReason: '',
    };
    expect(receiveTransferError(sent, short, 2)).toBe('กรุณาระบุเหตุผลของสินค้าที่ขาด / เสียหาย');
    expect(receiveTransferError(sent, { ...short, shortReason: 'กล่องแตก' }, 2)).toBeNull();
    expect(
      receiveTransferError(
        sent,
        { ...all, lines: [all.lines[0], { ...all.lines[1], receivedSerials: ['NB-1', 'X'] }] },
        2,
      ),
    ).toBe('ซีเรียล X ไม่อยู่ในใบโอนนี้');
    expect(receiveTransferError({ ...sent, status: 'received' }, all, 2)).toBe(
      'ใบโอนนี้รับหรือยกเลิกไปแล้ว',
    );
    expect(shortQty({ qty: 3, receivedQty: 2 })).toBe(1);
    expect(shortQty({ qty: 3, receivedQty: null })).toBe(0);
  });

  it('cancels only in transit, at the source, by an admin, with a reason (E29)', () => {
    expect(cancelTransferError(sent, 1, true, 'ส่งผิด')).toBeNull();
    expect(cancelTransferError(sent, 2, true, 'ส่งผิด')).toBe('ยกเลิกได้ที่สาขาต้นทางเท่านั้น');
    expect(cancelTransferError(sent, 1, false, 'ส่งผิด')).toBe('ยกเลิกใบโอนได้เฉพาะผู้ดูแลระบบ');
    expect(cancelTransferError(sent, 1, true, ' ')).toBe('กรุณาระบุเหตุผลการยกเลิก');
    expect(cancelTransferError({ ...sent, status: 'cancelled' }, 1, true, 'x')).toBe(
      'ยกเลิกได้เฉพาะใบโอนที่ยังไม่ได้รับ',
    );
  });
});
