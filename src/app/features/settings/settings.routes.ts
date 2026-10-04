import { Routes } from '@angular/router';
import { SettingsApi } from './data/settings-api.service';
import Settings from './pages/settings/settings';

export default [
  {
    path: '',
    // Feature-scoped services: created once per page load of this menu.
    providers: [SettingsApi],
    children: [{ path: '', component: Settings }],
  },
] satisfies Routes;
