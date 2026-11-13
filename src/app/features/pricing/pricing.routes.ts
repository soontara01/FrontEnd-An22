import { provideThaiDateAdapter } from '@shared/utils/thai-date-adapter';
import { Routes } from '@angular/router';
import { adminGuardTo } from '@core/auth/auth.guard';
import { PricingApi } from './data/pricing-api.service';
import { PricingStore } from './data/pricing.store';
import PriceImport from './pages/price-import/price-import';
import PriceOverview from './pages/price-overview/price-overview';
import SkuPrices from './pages/sku-prices/sku-prices';

export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of this menu.
    // The date adapter is only needed here (datepickers in the price form dialog).
    providers: [PricingApi, PricingStore, provideThaiDateAdapter()],
    children: [
      { path: '', component: PriceOverview },
      // Only admins change prices (server → 403); others go back to the overview.
      {
        path: 'import',
        title: 'นำเข้าราคา',
        component: PriceImport,
        canMatch: [adminGuardTo('/pricing')],
      },
      { path: ':productId', title: 'ราคาตาม SKU', component: SkuPrices },
    ],
  },
] satisfies Routes;
