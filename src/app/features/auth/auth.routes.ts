import { Routes } from '@angular/router';
import Login from './pages/login/login';

export default [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    title: 'เข้าสู่ระบบ',
    component: Login,
  },
] satisfies Routes;
