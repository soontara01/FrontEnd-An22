import { Routes } from '@angular/router';
import { SalesApi } from './data/sales-api.service';
import { SalesStore } from './data/sales.store';
import SaleList from './pages/sale-list/sale-list';

export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of this menu.
    providers: [SalesApi, SalesStore],
    children: [{ path: '', component: SaleList }],
  },
] satisfies Routes;
