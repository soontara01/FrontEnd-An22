# FrontEnd-An22

An Angular 22 app built as **one SPA per menu**: each menu is its own lazy-loaded module. Switching menus does a full page reload, and navigation inside a menu stays SPA.

- Angular 22 (standalone, zoneless, signals) + Angular Material 3
- State is held in signals-based services
- Mock backend (an interceptor), so you can work without a real API
- Vitest + ESLint + Prettier

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Dev server at http://localhost:4200 (log in with **admin / admin**) |
| `npm run build` | Production build, output to `dist/frontend-an22/browser` |
| `npm test` | Unit tests (Vitest) |
| `npx ng lint` | ESLint |

## Structure

```
src/app/
├─ core/                    # singletons used across the whole app (providedIn: 'root')
│  ├─ auth/                 # AuthService (signals), authGuard, guestGuard
│  ├─ http/                 # ApiService: wraps HttpClient + environment.apiUrl
│  ├─ interceptors/         # loading, auth (Bearer token), error, mock-backend
│  ├─ services/             # LoadingService, NotificationService, StorageService, ThemeService
│  ├─ navigation/           # menu.config.ts  ← list of menus = list of lazy modules
│  ├─ error/                # GlobalErrorHandler
│  └─ models/
├─ layout/
│  ├─ main-layout/          # toolbar + sidenav (built from MENU) + router-outlet
│  └─ auth-layout/          # layout for the login page
├─ shared/                  # reusable UI that holds no state
│  ├─ components/           # confirm-dialog, page-header, empty-state, loading-spinner, not-found
│  ├─ pipes/                # thaiDate
│  ├─ directives/           # appAutofocus
│  └─ material.ts           # MATERIAL: frequently used Material modules
└─ features/                # 1 folder = 1 lazy module
   ├─ auth/                 # /auth/login
   ├─ dashboard/            # /dashboard
   ├─ users/                # /users (CRUD) + data/ (UsersApi, UsersStore)
   └─ settings/             # /settings
```

Path aliases: `@core/*`, `@shared/*`, `@layout/*`, `@features/*`, `@env/*`

### SPA per menu: 1 menu = 1 lazy module

- `core/navigation/menu.config.ts` is the only place menus are defined. The sidebar and the routes are both built from it.
- Each module has a `<name>.routes.ts` with a `default export`. Pages inside a module are imported statically, so each module builds into **one chunk**.
- **Switching menus = full page reload.** Menu links use a plain `href` (not `routerLink`). The browser loads a fresh page, and the app boots and downloads only that menu's chunk. Login and logout also do a full reload.
- **Inside a menu, it's SPA.** For example `/users` → `/users/new` → `/users/1/edit` uses `routerLink`, with no reload.
- Services that belong to a single feature (such as `UsersStore`) go in the `providers` of the feature routes. They live only for the current page load of that menu. Data that must survive a menu switch goes in localStorage through `StorageService` (token, theme, mock data).

## Adding a new menu (new module)

1. Create `src/app/features/reports/reports.routes.ts`:
   ```ts
   import { Routes } from '@angular/router';
   import Reports from './pages/reports/reports';

   export default [{ path: '', component: Reports }] satisfies Routes;
   ```
2. Create the page component at `features/reports/pages/reports/reports.ts` (`export default class Reports {}`).
3. Add an entry to `MENU` in `core/navigation/menu.config.ts`:
   ```ts
   { label: 'รายงาน', icon: 'bar_chart', path: 'reports',
     loadChildren: () => import('@features/reports/reports.routes') },
   ```

That's all. The sidebar gets the new menu item and the route is lazy loaded automatically.

## Switching from the mock to a real API

1. Set `useMock: false` in `src/environments/environment*.ts`, and set `apiUrl` (default `/api`).
2. During development, `proxy.conf.json` forwards `/api` to `http://localhost:8080`. Change it to the real backend address.
3. The backend must provide `POST /auth/login → { token, user }` and `GET/POST /users`, `GET/PUT/DELETE /users/:id`.

## Deploy (SPA)

Every route must fall back to `index.html`:
- nginx: see `deploy/nginx.conf`
- IIS: copy `deploy/web.config` next to `index.html` (the URL Rewrite module is required)
