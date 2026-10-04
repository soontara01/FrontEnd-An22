import { Routes } from '@angular/router';
import { PosApi } from './data/pos-api.service';
import { PosStore } from './data/pos.store';
import PosPage from './pages/pos-page/pos-page';

export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of this menu.
    providers: [PosApi, PosStore],
    children: [{ path: '', component: PosPage }],
  },
] satisfies Routes;
