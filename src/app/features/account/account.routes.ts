import { Routes } from '@angular/router';
import { AccountApi } from './data/account-api.service';
import AccountShell from './pages/account-shell/account-shell';
import AuditLog from './pages/audit-log/audit-log';
import CompanyData from './pages/company-data/company-data';
import Subscription from './pages/subscription/subscription';

/**
 * "บัญชีบริษัท" (SaaS step 6, admins): the company's own account — package (E34, changed by the
 * owner), billing (E35), audit log (E40) and the company's data: export / deletion (E38 / E39,
 * owner). Tabs live in AccountShell.
 */
export default [
  {
    path: '',
    component: AccountShell,
    // Feature-scoped services: created once per page load of this menu.
    providers: [AccountApi],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'subscription' },
      { path: 'subscription', title: 'แพ็กเกจ', component: Subscription },
      { path: 'audit-log', title: 'ประวัติการใช้งาน', component: AuditLog },
      { path: 'data', title: 'ข้อมูลบริษัท', component: CompanyData },
    ],
  },
] satisfies Routes;
