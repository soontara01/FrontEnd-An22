import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoginResponse } from '../models';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;
  const assign = vi.fn();

  const response: LoginResponse = {
    token: 'abc',
    user: {
      id: 1,
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
  };

  beforeEach(() => {
    localStorage.clear();
    assign.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DOCUMENT, useValue: { location: { assign } } },
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts logged out', () => {
    expect(service.isLoggedIn()).toBe(false);
    expect(service.user()).toBeNull();
  });

  it('login stores token and user', () => {
    service.login({ username: 'admin', password: 'admin' }).subscribe();
    http.expectOne({ method: 'POST', url: '/api/auth/login' }).flush(response);

    expect(service.isLoggedIn()).toBe(true);
    expect(service.user()?.name).toBe('Admin');
    expect(localStorage.getItem('an22.token')).toBe('"abc"');
  });

  it('logout clears state and reloads to the login page', () => {
    service.login({ username: 'admin', password: 'admin' }).subscribe();
    http.expectOne('/api/auth/login').flush(response);

    service.logout();

    expect(service.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('an22.token')).toBeNull();
    expect(assign).toHaveBeenCalledWith('/auth/login');
  });
});
