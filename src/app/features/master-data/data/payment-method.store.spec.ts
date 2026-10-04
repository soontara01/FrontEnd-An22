import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PAYMENT_METHOD_DEFAULTS, PaymentMethod } from '@core/models';
import { MasterDataApi } from './master-data-api.service';
import { PaymentMethodStore } from './payment-method.store';

describe('PaymentMethodStore', () => {
  const method = (id: number, sortOrder: number, extra: Partial<PaymentMethod> = {}) =>
    ({
      ...PAYMENT_METHOD_DEFAULTS,
      id,
      code: `M-${id}`,
      name: `M${id}`,
      type: 'card',
      sortOrder,
      ...extra,
    }) as PaymentMethod;
  const methods = [
    method(1, 2, { type: 'cash' }),
    method(2, 1, { feePercent: 1.6 }),
    method(3, 3, { active: false }),
  ];
  const api = {
    paymentMethods: vi.fn(() => of(methods)),
    reorderPaymentMethods: vi.fn((ids: number[]) =>
      of(ids.map((id, i) => ({ ...methods.find((m) => m.id === id)!, sortOrder: i + 1 }))),
    ),
  };

  let store: PaymentMethodStore;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [PaymentMethodStore, { provide: MasterDataApi, useValue: api }],
    });
    store = TestBed.inject(PaymentMethodStore);
    store.load();
  });

  it('sorts by POS order and summarises', () => {
    expect(store.methods().map((m) => m.id)).toEqual([2, 1, 3]);
    expect(store.posButtons().map((m) => m.id)).toEqual([2, 1]);
    expect([store.count(), store.activeCount(), store.withFeeCount()]).toEqual([3, 2, 1]);
    expect(store.isLastActiveCash(1)).toBe(true);
  });

  it('moves a method and ignores moves past the ends', () => {
    store.move(1, -1).subscribe();
    expect(api.reorderPaymentMethods).toHaveBeenCalledWith([1, 2, 3]);
    expect(store.methods().map((m) => m.id)).toEqual([1, 2, 3]);
    store.move(1, -1).subscribe();
    expect(api.reorderPaymentMethods).toHaveBeenCalledTimes(1);
  });
});
