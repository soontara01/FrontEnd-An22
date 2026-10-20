import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PROMOTION_DEFAULTS, Promotion } from '@core/models';
import { PromotionsApi } from '../../data/promotions-api.service';
import { PromotionsStore } from '../../data/promotions.store';
import PromotionList from './promotion-list';

describe('PromotionList', () => {
  const promo = (id: number, code: string, branchIds: number[]): Promotion => ({
    ...PROMOTION_DEFAULTS,
    id,
    code,
    name: code,
    startDate: '2000-01-01',
    branchIds,
  });

  it('shows the branches a promotion is limited to, "ทุกสาขา" otherwise (D2)', async () => {
    TestBed.configureTestingModule({
      imports: [PromotionList],
      providers: [
        PromotionsStore,
        {
          provide: PromotionsApi,
          useValue: {
            list: () =>
              of([promo(1, 'P-ALL', []), promo(2, 'P-HQ', [1]), promo(3, 'P-HQBN', [1, 2])]),
            products: () => of([]),
            categories: () => of([]),
            branches: () =>
              of([
                { id: 1, code: 'HQ', name: 'สำนักงานใหญ่', active: true },
                { id: 2, code: 'BN', name: 'บางนา', active: true },
              ]),
          },
        },
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    const fixture = TestBed.createComponent(PromotionList);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('tr.mat-mdc-row')];
    const branchOf = (code: string) =>
      rows
        .find((r) => r.textContent?.includes(code + ' '))
        ?.querySelector('.mat-column-branches')
        ?.textContent?.trim();
    expect(branchOf('P-ALL')).toBe('ทุกสาขา');
    expect(branchOf('P-HQ')).toBe('HQ');
    expect(branchOf('P-HQBN')).toBe('HQ, BN');
  });
});
