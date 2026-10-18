import { Routes } from '@angular/router';
import { TransfersApi } from './data/transfers-api.service';
import { TransfersStore } from './data/transfers.store';
import TransferDetail from './pages/transfer-detail/transfer-detail';
import TransferForm from './pages/transfer-form/transfer-form';
import TransferList from './pages/transfer-list/transfer-list';

export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of this menu.
    providers: [TransfersApi, TransfersStore],
    children: [
      { path: '', component: TransferList },
      { path: 'new', title: 'สร้างใบโอน', component: TransferForm },
      { path: ':id', title: 'ใบโอนสินค้า', component: TransferDetail },
    ],
  },
] satisfies Routes;
