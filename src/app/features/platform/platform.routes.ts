import { inject } from '@angular/core';
import { CanMatchFn, Router, Routes } from '@angular/router';
import { map } from 'rxjs';
import { PlatformApi } from './data/platform-api.service';
import { PlatformAuth } from './data/platform-auth.service';
import CompanyDetail from './pages/company-detail/company-detail';
import CompanyList from './pages/company-list/company-list';
import Outbox from './pages/outbox/outbox';
import PlatformLayout from './pages/platform-layout/platform-layout';
import PlatformLogin from './pages/platform-login/platform-login';

/** Platform admin logged in (own session slot, E36 / E48), else its login page. */
const platformAuthGuard: CanMatchFn = () => {
  const router = inject(Router);
  return inject(PlatformAuth)
    .load()
    .pipe(map((loggedIn) => loggedIn || router.parseUrl('/platform/login')));
};
const platformGuestGuard: CanMatchFn = () => {
  const router = inject(Router);
  return inject(PlatformAuth)
    .load()
    .pipe(map((loggedIn) => !loggedIn || router.parseUrl('/platform')));
};

/**
 * The SaaS operator's pages (E36): one lazy chunk under `/platform`, not a `MENU` entry, never
 * reached from the shop menus. Navigation inside is SPA.
 */
export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of these pages.
    providers: [PlatformAuth, PlatformApi],
    children: [
      {
        path: 'login',
        title: 'เข้าสู่ระบบผู้ให้บริการ',
        canMatch: [platformGuestGuard],
        component: PlatformLogin,
      },
      {
        path: '',
        component: PlatformLayout,
        canMatch: [platformAuthGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'companies' },
          { path: 'companies', title: 'บริษัทลูกค้า', component: CompanyList },
          { path: 'companies/:id', title: 'บริษัทลูกค้า', component: CompanyDetail },
          { path: 'outbox', title: 'อีเมลที่ส่ง (mock)', component: Outbox },
        ],
      },
    ],
  },
] satisfies Routes;
