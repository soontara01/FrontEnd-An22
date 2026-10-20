import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { GlobalErrorHandler } from '@core/error/global-error-handler';
import { branchInterceptor } from '@core/interceptors/branch.interceptor';
import { errorInterceptor } from '@core/interceptors/error.interceptor';
import { loadingInterceptor } from '@core/interceptors/loading.interceptor';
import { terminalInterceptor } from '@core/interceptors/terminal.interceptor';
import { lazyMockBackendInterceptor } from '@core/interceptors/lazy-mock-backend.interceptor';
import { environment } from '@env/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideHttpClient(
      withFetch(),
      withInterceptors([
        // No auth header: the web server adds the token from the session cookie (E48).
        loadingInterceptor,
        terminalInterceptor,
        branchInterceptor,
        errorInterceptor,
        // Mock must be last: it replaces the real backend call. Loaded lazily (own chunk).
        ...(environment.useMock ? [lazyMockBackendInterceptor] : []),
      ]),
    ),
    // Who is logged in (`GET /me`) before the first route is matched — guards read it.
    provideAppInitializer(() => inject(AuthService).restore()),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
    { provide: MAT_DATE_LOCALE, useValue: 'th-TH' },
  ],
};
