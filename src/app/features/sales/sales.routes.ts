import { provideNativeDateAdapter } from '@angular/material/core';
import { Routes } from '@angular/router';
import { SalesApi } from './data/sales-api.service';
import { SalesStore } from './data/sales.store';
import SaleDetail from './pages/sale-detail/sale-detail';
import SaleList from './pages/sale-list/sale-list';

export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of this menu.
    // provideNativeDateAdapter: date-range picker on the bill list.
    providers: [SalesApi, SalesStore, provideNativeDateAdapter()],
    children: [
      { path: '', component: SaleList },
      { path: ':id', title: 'บิลขาย', component: SaleDetail },
    ],
  },
] satisfies Routes;
