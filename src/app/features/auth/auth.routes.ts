import { Routes } from '@angular/router';
import { authGuard, guestGuard } from '@core/auth/auth.guard';
import ForgotPassword from './pages/forgot-password/forgot-password';
import Login from './pages/login/login';
import ResetPassword from './pages/reset-password/reset-password';
import SelectBranch from './pages/select-branch/select-branch';

export default [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    title: 'เข้าสู่ระบบ',
    canMatch: [guestGuard],
    component: Login,
  },
  // Every login asks the Authenticator code now (E57): the old URL leads to the one login page.
  { path: 'login-mfa', redirectTo: 'login' },
  // An owner's password reset (E41) / first password (E59): no session needed. Nobody signs up
  // by themselves any more (E59) — `/auth/signup` falls to the app's 404.
  {
    path: 'forgot-password',
    title: 'ลืมรหัสผ่าน',
    canMatch: [guestGuard],
    component: ForgotPassword,
  },
  {
    path: 'reset-password',
    title: 'ตั้งรหัสผ่าน',
    canMatch: [guestGuard],
    component: ResetPassword,
  },
  {
    path: 'select-branch',
    title: 'เลือกสาขา',
    canMatch: [authGuard],
    component: SelectBranch,
  },
] satisfies Routes;
