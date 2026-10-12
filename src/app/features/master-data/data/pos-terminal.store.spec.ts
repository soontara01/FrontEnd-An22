import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PosTerminal } from '@core/models';
import { MasterDataApi } from './master-data-api.service';
import { PosTerminalStore } from './pos-terminal.store';

describe('PosTerminalStore', () => {
  const terminals: PosTerminal[] = [
    { id: 3, name: 'ชั้น 3', posId: '', active: true },
    { id: 1, name: 'หน้าร้าน', posId: 'E051', active: true },
    { id: 4, name: 'สำรอง', posId: '', active: false },
  ];
  const api = {
    posTerminals: vi.fn(() => of(terminals)),
    storeInfo: vi.fn(() => of({ vatRegistered: true })),
    removePosTerminal: vi.fn(() => of(undefined)),
  };

  let store: PosTerminalStore;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [PosTerminalStore, { provide: MasterDataApi, useValue: api }],
    });
    store = TestBed.inject(PosTerminalStore);
    store.load();
  });

  it('sorts by number, summarises and suggests the next free number', () => {
    expect(store.terminals().map((t) => t.id)).toEqual([1, 3, 4]);
    expect([store.count(), store.activeCount(), store.missingPosIdCount()]).toEqual([3, 2, 1]);
    expect(store.nextId()).toBe(2);
  });

  it('loads once unless forced and drops a removed terminal', () => {
    store.load();
    expect(api.posTerminals).toHaveBeenCalledTimes(1);
    store.remove(3).subscribe();
    expect(store.terminals().map((t) => t.id)).toEqual([1, 4]);
    expect(store.nextId()).toBe(2);
  });
});
