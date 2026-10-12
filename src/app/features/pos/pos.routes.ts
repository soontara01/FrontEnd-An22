import { Routes } from '@angular/router';
import { PosApi } from './data/pos-api.service';
import { PosStore } from './data/pos.store';
import PosPage from './pages/pos-page/pos-page';
import ShiftClose from './pages/shift-close/shift-close';

export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of this menu.
    providers: [PosApi, PosStore],
    children: [
      { path: '', component: PosPage },
      { path: 'shift-close', component: ShiftClose },
    ],
  },
] satisfies Routes;
