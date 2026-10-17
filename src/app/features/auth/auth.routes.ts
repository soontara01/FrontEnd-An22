import { Routes } from '@angular/router';
import { authGuard, guestGuard } from '@core/auth/auth.guard';
import Login from './pages/login/login';
import SelectBranch from './pages/select-branch/select-branch';

export default [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    title: 'เข้าสู่ระบบ',
    canMatch: [guestGuard],
    component: Login,
  },
  {
    path: 'select-branch',
    title: 'เลือกสาขา',
    canMatch: [authGuard],
    component: SelectBranch,
  },
] satisfies Routes;
