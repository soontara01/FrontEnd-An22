import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { SalesApi } from './sales-api.service';
import { SalesStore } from './sales.store';

describe('SalesStore', () => {
  const refused = () => throwError(() => new HttpErrorResponse({ status: 500 }));
  const api = {
    storeInfo: vi.fn(refused),
    promotions: vi.fn(() => of([])),
    paymentMethods: vi.fn(() => of([])),
    posTerminals: vi.fn(() => of([])),
    exchangesOf: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        SalesStore,
        { provide: SalesApi, useValue: api },
        { provide: AuthService, useValue: { currentBranch: signal({ id: 1 }) } },
      ],
    });
  });

  it('keeps a failed lookup out of the error handler and tries it again next time (B13)', () => {
    const store = TestBed.inject(SalesStore);
    // An unhandled error would be rethrown by rxjs and fail the test run.
    store.loadLookups();
    expect(store.storeInfo()).toBeNull();
    expect(api.storeInfo).toHaveBeenCalledTimes(1);

    api.storeInfo.mockReturnValueOnce(of({ name: 'ร้าน' }) as never);
    store.loadLookups();
    expect(api.storeInfo).toHaveBeenCalledTimes(2);
    expect(store.storeInfo()).toEqual({ name: 'ร้าน' });
  });

  it('prints documents of another branch with the details of that branch, fetched once (E22)', () => {
    const store = TestBed.inject(SalesStore);
    api.storeInfo.mockReturnValueOnce(of({ name: 'HQ' }) as never);
    store.loadLookups();
    expect(store.storeInfoFor(1)).toEqual({ name: 'HQ' });
    expect(store.storeInfoFor(null)).toEqual({ name: 'HQ' });

    api.storeInfo.mockReturnValueOnce(of({ name: 'BN' }) as never);
    expect(store.storeInfoFor(2)).toBeNull();
    store.loadBranchInfo(2);
    store.loadBranchInfo(2);
    expect(api.storeInfo).toHaveBeenLastCalledWith(2);
    expect(api.storeInfo).toHaveBeenCalledTimes(2);
    expect(store.storeInfoFor(2)).toEqual({ name: 'BN' });
  });
  it('collects the serials handed out by exchanges of the listed bills (C3-9)', () => {
    const store = TestBed.inject(SalesStore);
    const bill = (id: number, exchangeNos: string[]) => ({ id, exchangeNos }) as never;
    api.exchangesOf.mockImplementation((id: number) =>
      id === 2 ? of([{ lines: [{ newSerial: 'SN-NEW' }, { newSerial: null }] }]) : refused(),
    );
    let result = new Map<number, string[]>();
    store
      .exchangedSerials([bill(1, []), bill(2, ['EX-1']), bill(3, ['EX-2'])])
      .subscribe((m) => (result = m));
    // Only bills with exchanges are asked; a failed one keeps the others searchable.
    expect(api.exchangesOf).toHaveBeenCalledTimes(2);
    expect(result.get(2)).toEqual(['SN-NEW']);
    expect(result.get(3)).toEqual([]);
    expect(result.has(1)).toBe(false);
  });
});
