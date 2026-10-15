import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from '@core/auth/auth.guard';
import { MENU } from '@core/navigation/menu.config';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('@layout/auth-layout/auth-layout').then((m) => m.AuthLayout),
    canMatch: [guestGuard],
    loadChildren: () => import('@features/auth/auth.routes'),
  },
  {
    path: '',
    loadComponent: () => import('@layout/main-layout/main-layout').then((m) => m.MainLayout),
    canMatch: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: MENU[0].path },
      // 1 menu = 1 lazy feature module (built from MENU)
      ...MENU.map(({ path, label, loadChildren, adminOnly }) => ({
        path,
        title: label,
        loadChildren,
        ...(adminOnly ? { canMatch: [adminGuard] } : {}),
      })),
    ],
  },
  {
    path: '**',
    title: 'ไม่พบหน้า',
    loadComponent: () => import('@shared/components/not-found/not-found'),
  },
];
