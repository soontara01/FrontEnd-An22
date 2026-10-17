import { provideThaiDateAdapter } from '@shared/utils/thai-date-adapter';
import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { adminGuardTo } from '@core/auth/auth.guard';
import { SalesApi } from './data/sales-api.service';
import { SalesStore } from './data/sales.store';
import CreditNoteForm from './pages/credit-note-form/credit-note-form';
import SaleDetail from './pages/sale-detail/sale-detail';
import SaleList from './pages/sale-list/sale-list';
import SalesTaxReportPage from './pages/sales-tax-report/sales-tax-report';
import ShiftDetail from './pages/shift-detail/shift-detail';
import ShiftList from './pages/shift-list/shift-list';
import TaxReportSummary from './pages/tax-report-summary/tax-report-summary';
import ExchangeForm from './pages/exchange-form/exchange-form';
import TaxInvoiceForm from './pages/tax-invoice-form/tax-invoice-form';

export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of this menu.
    // provideThaiDateAdapter: date-range picker on the bill list.
    providers: [SalesApi, SalesStore, provideThaiDateAdapter()],
    children: [
      { path: '', component: SaleList },
      // Before ':id' so the literal path wins.
      // Accounting report: admin only (P4, server → 403); others go back to the bill list.
      {
        path: 'tax-report',
        title: 'รายงานภาษีขาย',
        component: SalesTaxReportPage,
        canMatch: [adminGuardTo('/sales')],
      },
      // Every branch: company admins only (D6); others go to the report of their branch.
      {
        path: 'tax-report/summary',
        title: 'สรุปภาษีขายทุกสาขา',
        component: TaxReportSummary,
        canMatch: [
          () =>
            inject(AuthService).isCompanyAdmin() || inject(Router).parseUrl('/sales/tax-report'),
        ],
      },
      { path: 'shifts', title: 'กะขาย', component: ShiftList },
      { path: 'shifts/:id', title: 'กะขาย', component: ShiftDetail },
      { path: ':id', title: 'บิลขาย', component: SaleDetail },
      { path: ':id/credit-note', title: 'ออกใบลดหนี้', component: CreditNoteForm },
      { path: ':id/exchange', title: 'เปลี่ยนสินค้า', component: ExchangeForm },
      { path: ':id/tax-invoice', title: 'ใบกำกับภาษีเต็มรูป', component: TaxInvoiceForm },
    ],
  },
] satisfies Routes;
