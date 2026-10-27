import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Production build stand-in for `lazy-mock-backend.interceptor.ts` (`fileReplacements` in
 * `angular.json`): no `import()` of the mock, so its chunk (seed data, mock passwords) is not
 * built into `dist/` at all (C3-1). Passes every request on — production never mocks.
 */
export const lazyMockBackendInterceptor: HttpInterceptorFn = (req, next) => next(req);
