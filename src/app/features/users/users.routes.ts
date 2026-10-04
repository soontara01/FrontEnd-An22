import { Routes } from '@angular/router';
import UserList from './pages/user-list/user-list';
import UserForm from './pages/user-form/user-form';
import { UsersApi } from './data/users-api.service';
import { UsersStore } from './data/users.store';

export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of this menu and shared by
    // its pages (list ↔ form navigate via routerLink without reloading).
    providers: [UsersApi, UsersStore],
    children: [
      { path: '', component: UserList },
      { path: 'new', title: 'เพิ่มผู้ใช้', component: UserForm },
      { path: ':id/edit', title: 'แก้ไขผู้ใช้', component: UserForm },
    ],
  },
] satisfies Routes;
