import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { SalesApi } from './sales-api.service';
import { SalesStore } from './sales.store';

describe('SalesStore', () => {
  const refused = () => throwError(() => new HttpErrorResponse({ status: 500 }));
  const api = {
    storeInfo: vi.fn(refused),
    promotions: vi.fn(() => of([])),
    paymentMethods: vi.fn(() => of([])),
    posTerminals: vi.fn(() => of([])),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [SalesStore, { provide: SalesApi, useValue: api }],
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
});
