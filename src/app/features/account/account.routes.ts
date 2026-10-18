import { Routes } from '@angular/router';
import { AccountApi } from './data/account-api.service';
import AccountShell from './pages/account-shell/account-shell';
import AuditLog from './pages/audit-log/audit-log';

/**
 * "บัญชีบริษัท" (SaaS step 6, admins): the company's own account — audit log (E40); the package,
 * billing and data tabs are the owner's. Tabs live in AccountShell.
 */
export default [
  {
    path: '',
    component: AccountShell,
    // Feature-scoped services: created once per page load of this menu.
    providers: [AccountApi],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'audit-log' },
      { path: 'audit-log', title: 'ประวัติการใช้งาน', component: AuditLog },
    ],
  },
] satisfies Routes;
