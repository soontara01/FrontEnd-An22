import { provideNativeDateAdapter } from '@angular/material/core';
import { Routes } from '@angular/router';
import { SalesApi } from './data/sales-api.service';
import { SalesStore } from './data/sales.store';
import CreditNoteForm from './pages/credit-note-form/credit-note-form';
import SaleDetail from './pages/sale-detail/sale-detail';
import SaleList from './pages/sale-list/sale-list';
import SalesTaxReportPage from './pages/sales-tax-report/sales-tax-report';
import TaxInvoiceForm from './pages/tax-invoice-form/tax-invoice-form';

export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of this menu.
    // provideNativeDateAdapter: date-range picker on the bill list.
    providers: [SalesApi, SalesStore, provideNativeDateAdapter()],
    children: [
      { path: '', component: SaleList },
      // Before ':id' so the literal path wins.
      { path: 'tax-report', title: 'รายงานภาษีขาย', component: SalesTaxReportPage },
      { path: ':id', title: 'บิลขาย', component: SaleDetail },
      { path: ':id/credit-note', title: 'ออกใบลดหนี้', component: CreditNoteForm },
      { path: ':id/tax-invoice', title: 'ใบกำกับภาษีเต็มรูป', component: TaxInvoiceForm },
    ],
  },
] satisfies Routes;
