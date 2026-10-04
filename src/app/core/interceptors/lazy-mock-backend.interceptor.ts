import { HttpInterceptorFn } from '@angular/common/http';
import { EnvironmentInjector, inject, runInInjectionContext } from '@angular/core';
import { defer, shareReplay, switchMap } from 'rxjs';

/**
 * Loads the mock backend (seed data + every handler) on the first request, so it lives in its
 * own lazy chunk instead of the initial bundle. Registered only when `environment.useMock`;
 * with a real backend the chunk is never downloaded.
 */
const mockModule$ = defer(() => import('./mock-backend.interceptor')).pipe(shareReplay(1));

export const lazyMockBackendInterceptor: HttpInterceptorFn = (req, next) => {
  // The real interceptor injects services, so run it in the caller's injection context.
  const injector = inject(EnvironmentInjector);
  return mockModule$.pipe(
    switchMap(({ mockBackendInterceptor }) =>
      runInInjectionContext(injector, () => mockBackendInterceptor(req, next)),
    ),
  );
};
