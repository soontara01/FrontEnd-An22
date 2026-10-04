import { LoadChildren } from '@angular/router';

export interface MenuItem {
  label: string;
  /** Material Symbols icon name */
  icon: string;
  /** Route path (also used for routerLink) */
  path: string;
  /** Lazy-loaded feature routes: 1 menu = 1 feature module = 1 chunk, loaded once */
  loadChildren: LoadChildren;
}

/**
 * Single source of truth for the side menu AND the lazy feature routes.
 * To add a menu: create `features/<name>/<name>.routes.ts` and add one entry here.
 */
export const MENU: MenuItem[] = [
  {
    label: 'แดชบอร์ด',
    icon: 'dashboard',
    path: 'dashboard',
    loadChildren: () => import('@features/dashboard/dashboard.routes'),
  },
  {
    label: 'การขาย',
    icon: 'point_of_sale',
    path: 'sales',
    loadChildren: () => import('@features/sales/sales.routes'),
  },
  {
    label: 'คลังสินค้า',
    icon: 'inventory_2',
    path: 'inventory',
    loadChildren: () => import('@features/inventory/inventory.routes'),
  },
  {
    label: 'จัดการ SKU',
    icon: 'barcode',
    path: 'sku',
    loadChildren: () => import('@features/sku/sku.routes'),
  },
  {
    label: 'จัดการราคา',
    icon: 'sell',
    path: 'pricing',
    loadChildren: () => import('@features/pricing/pricing.routes'),
  },
  {
    label: 'ข้อมูลหลัก',
    icon: 'dataset',
    path: 'master-data',
    loadChildren: () => import('@features/master-data/master-data.routes'),
  },
  {
    label: 'ผู้ใช้งาน',
    icon: 'group',
    path: 'users',
    loadChildren: () => import('@features/users/users.routes'),
  },
  {
    label: 'ตั้งค่า',
    icon: 'settings',
    path: 'settings',
    loadChildren: () => import('@features/settings/settings.routes'),
  },
];
