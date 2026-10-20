import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Branch, Company, MeResponse, User } from '../models';
import { AuthService } from './auth.service';

/**
 * Specs only: logs `AuthService` in as if `GET /me` answered when the page opened — the session
 * lives in memory, never in localStorage (E48). Needs `provideHttpClientTesting()`.
 */
export function signInForTest(session: {
  user: Partial<User>;
  company: Partial<Company>;
  branches?: Partial<Branch>[];
  canSeeCost?: boolean;
}): AuthService {
  const auth = TestBed.inject(AuthService);
  auth.restore().subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne((req) => req.url.endsWith('/me'))
    .flush({ billing: null, canSeeCost: false, branches: [], ...session } as MeResponse);
  return auth;
}
