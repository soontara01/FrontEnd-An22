import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, UrlSegment, UrlTree, provideRouter } from '@angular/router';
import { authGuard, guestGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('auth guards', () => {
  const isLoggedIn = signal(false);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { isLoggedIn } }],
    });
  });

  const run = (guard: typeof authGuard) =>
    TestBed.runInInjectionContext(() =>
      guard({} as Route, [] as UrlSegment[], {} as Parameters<typeof authGuard>[2]),
    );

  it('authGuard redirects to /auth/login when logged out', () => {
    isLoggedIn.set(false);
    const result = run(authGuard);
    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/auth/login');
  });

  it('authGuard allows when logged in', () => {
    isLoggedIn.set(true);
    expect(run(authGuard)).toBe(true);
  });

  it('guestGuard redirects home when logged in', () => {
    isLoggedIn.set(true);
    expect(String(run(guestGuard))).toBe('/');
  });
});
