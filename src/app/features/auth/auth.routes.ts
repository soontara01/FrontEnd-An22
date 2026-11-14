import { Routes } from '@angular/router';
import { authGuard, guestGuard } from '@core/auth/auth.guard';
import ForgotPassword from './pages/forgot-password/forgot-password';
import Login from './pages/login/login';
import ResetPassword from './pages/reset-password/reset-password';
import Signup from './pages/signup/signup';
import SelectBranch from './pages/select-branch/select-branch';

export default [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    title: 'เข้าสู่ระบบ',
    canMatch: [guestGuard],
    component: Login,
  },
  // Same page, always with the Microsoft Authenticator code after the password (E55).
  {
    path: 'login-mfa',
    title: 'เข้าสู่ระบบด้วย Microsoft Authenticator',
    canMatch: [guestGuard],
    component: Login,
    data: { mfa: true },
  },
  // Signing up (E37) and an owner's password reset (E41): no session needed.
  { path: 'signup', title: 'สมัครใช้งาน', canMatch: [guestGuard], component: Signup },
  {
    path: 'forgot-password',
    title: 'ลืมรหัสผ่าน',
    canMatch: [guestGuard],
    component: ForgotPassword,
  },
  {
    path: 'reset-password',
    title: 'ตั้งรหัสผ่านใหม่',
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
