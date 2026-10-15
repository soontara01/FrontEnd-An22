import { provideNativeDateAdapter } from '@angular/material/core';
import { Routes } from '@angular/router';
import { adminGuardTo } from '@core/auth/auth.guard';
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
      // Only admins create / edit promotions (server → 403); others go back to the list.
      {
        path: 'new',
        title: 'เพิ่มโปรโมชั่น',
        component: PromotionForm,
        canMatch: [adminGuardTo('/promotions')],
      },
      { path: ':id', title: 'โปรโมชั่น', component: PromotionDetail },
      {
        path: ':id/edit',
        title: 'แก้ไขโปรโมชั่น',
        component: PromotionForm,
        canMatch: [adminGuardTo('/promotions')],
      },
    ],
  },
] satisfies Routes;
