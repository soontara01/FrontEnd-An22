import { Routes } from '@angular/router';
import { BranchStore } from './data/branch.store';
import { CategoryStore } from './data/category.store';
import { MasterDataApi } from './data/master-data-api.service';
import { PaymentMethodStore } from './data/payment-method.store';
import { PosTerminalStore } from './data/pos-terminal.store';
import { SupplierStore } from './data/supplier.store';
import BranchList from './pages/branch-list/branch-list';
import CategoryTree from './pages/category-tree/category-tree';
import MasterDataShell from './pages/master-data-shell/master-data-shell';
import PaymentMethodList from './pages/payment-method-list/payment-method-list';
import PosTerminalList from './pages/pos-terminal-list/pos-terminal-list';
import SupplierForm from './pages/supplier-form/supplier-form';
import SupplierList from './pages/supplier-list/supplier-list';

/**
 * "ข้อมูลหลัก": master data shared by other menus (SKU, Inventory, POS payment methods; purchasing later).
 * Tabs live in MasterDataShell; add a child route + tab for each new master.
 */
export default [
  {
    path: '',
    component: MasterDataShell,
    // Feature-scoped services: created once per page load of this menu.
    providers: [
      MasterDataApi,
      CategoryStore,
      SupplierStore,
      PaymentMethodStore,
      PosTerminalStore,
      BranchStore,
    ],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'categories' },
      { path: 'categories', title: 'หมวดหมู่สินค้า', component: CategoryTree },
      { path: 'suppliers', title: 'ผู้จำหน่าย', component: SupplierList },
      { path: 'suppliers/new', title: 'เพิ่มผู้จำหน่าย', component: SupplierForm },
      { path: 'suppliers/:id/edit', title: 'แก้ไขผู้จำหน่าย', component: SupplierForm },
      { path: 'payment-methods', title: 'ช่องทางชำระเงิน', component: PaymentMethodList },
      { path: 'terminals', title: 'เครื่อง POS', component: PosTerminalList },
      { path: 'branches', title: 'สาขา', component: BranchList },
    ],
  },
] satisfies Routes;
