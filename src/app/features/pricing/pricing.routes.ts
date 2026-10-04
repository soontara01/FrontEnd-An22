import { provideNativeDateAdapter } from '@angular/material/core';
import { Routes } from '@angular/router';
import { PricingApi } from './data/pricing-api.service';
import { PricingStore } from './data/pricing.store';
import PriceOverview from './pages/price-overview/price-overview';
import SkuPrices from './pages/sku-prices/sku-prices';

export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of this menu.
    // The date adapter is only needed here (datepickers in the price form dialog).
    providers: [PricingApi, PricingStore, provideNativeDateAdapter()],
    children: [
      { path: '', component: PriceOverview },
      { path: ':productId', title: 'ราคาตาม SKU', component: SkuPrices },
    ],
  },
] satisfies Routes;
