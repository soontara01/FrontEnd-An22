import { provideNativeDateAdapter } from '@angular/material/core';
import { Routes } from '@angular/router';
import { PromotionsApi } from './data/promotions-api.service';
import { PromotionsStore } from './data/promotions.store';
import PromotionDetail from './pages/promotion-detail/promotion-detail';
import PromotionForm from './pages/promotion-form/promotion-form';
import PromotionList from './pages/promotion-list/promotion-list';

export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of this menu.
    // The date adapter is only needed here (period datepickers in the form).
    providers: [PromotionsApi, PromotionsStore, provideNativeDateAdapter()],
    children: [
      { path: '', component: PromotionList },
      { path: 'new', title: 'เพิ่มโปรโมชั่น', component: PromotionForm },
      { path: ':id', title: 'โปรโมชั่น', component: PromotionDetail },
      { path: ':id/edit', title: 'แก้ไขโปรโมชั่น', component: PromotionForm },
    ],
  },
] satisfies Routes;
