import { Routes } from '@angular/router';
import { SkuApi } from './data/sku-api.service';
import { SkuStore } from './data/sku.store';
import SkuDetail from './pages/sku-detail/sku-detail';
import SkuForm from './pages/sku-form/sku-form';
import SkuImport from './pages/sku-import/sku-import';
import SkuLabels from './pages/sku-labels/sku-labels';
import SkuList from './pages/sku-list/sku-list';

export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of this menu and shared by
    // its pages (list ↔ detail ↔ form navigate via routerLink without reloading).
    providers: [SkuApi, SkuStore],
    children: [
      { path: '', component: SkuList },
      { path: 'new', title: 'เพิ่ม SKU', component: SkuForm },
      // Static paths must come before ':id'.
      { path: 'import', title: 'นำเข้า SKU', component: SkuImport },
      { path: 'labels', title: 'พิมพ์ป้าย', component: SkuLabels },
      { path: ':id', title: 'รายละเอียด SKU', component: SkuDetail },
      { path: ':id/edit', title: 'แก้ไข SKU', component: SkuForm },
    ],
  },
] satisfies Routes;
