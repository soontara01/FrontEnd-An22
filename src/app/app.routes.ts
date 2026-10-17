import { Routes } from '@angular/router';
import { adminGuard, authGuard, branchGuard, menuGuard } from '@core/auth/auth.guard';
import { MENU } from '@core/navigation/menu.config';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('@layout/auth-layout/auth-layout').then((m) => m.AuthLayout),
    // Guards per page: login for guests, branch choice for logged-in users (auth.routes.ts).
    loadChildren: () => import('@features/auth/auth.routes'),
  },
  {
    path: '',
    loadComponent: () => import('@layout/main-layout/main-layout').then((m) => m.MainLayout),
    canMatch: [authGuard, branchGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: MENU[0].path },
      // 1 menu = 1 lazy feature module (built from MENU)
      ...MENU.map(({ path, label, loadChildren, adminOnly }) => ({
        path,
        title: label,
        loadChildren,
        // Admin-only menus first; then the menus the admin lets the `user` role see.
        canMatch: adminOnly ? [adminGuard, menuGuard(path)] : [menuGuard(path)],
      })),
    ],
  },
  {
    path: '**',
    title: 'ไม่พบหน้า',
    loadComponent: () => import('@shared/components/not-found/not-found'),
  },
];
