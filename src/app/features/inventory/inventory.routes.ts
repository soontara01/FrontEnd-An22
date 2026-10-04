import { Routes } from '@angular/router';
import { InventoryApi } from './data/inventory-api.service';
import { InventoryStore } from './data/inventory.store';
import ProductList from './pages/product-list/product-list';
import ReorderSuggestions from './pages/reorder-suggestions/reorder-suggestions';
import SerialLabels from './pages/serial-labels/serial-labels';
import StockCard from './pages/stock-card/stock-card';

export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of this menu
    // (shared by the stock list and the reorder page — SPA inside this menu).
    providers: [InventoryApi, InventoryStore],
    children: [
      { path: '', component: ProductList },
      { path: 'reorder', title: 'แนะนำสั่งซื้อ', component: ReorderSuggestions },
      { path: 'stock-card/:productId', title: 'บัตรสต็อก', component: StockCard },
      { path: 'serial-labels/:productId', title: 'พิมพ์ป้าย Serial', component: SerialLabels },
    ],
  },
] satisfies Routes;
