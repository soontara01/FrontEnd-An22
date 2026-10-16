import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Branch, LoginResponse } from '../models';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let http: HttpTestingController;
  const assign = vi.fn();

  const branch = (id: number, active = true): Branch => ({
    id,
    code: `B${id}`,
    name: `สาขา ${id}`,
    branchNo: String(id - 1).padStart(5, '0'),
    active,
  });
  const response = (branches: Branch[] = [branch(1)]): LoginResponse => ({
    token: 'mock-jwt-token.t1.u1',
    user: {
      id: 1,
      username: 'admin',
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
    company: { id: 1, code: 'DEMO', name: 'ร้านตัวอย่าง', taxId: '', active: true },
    branches,
  });
  const credentials = { companyCode: ' demo ', username: 'admin', password: 'admin' };

  const create = () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DOCUMENT, useValue: { location: { assign } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  };
  const login = (service: AuthService, res = response()) => {
    service.login(credentials).subscribe();
    http.expectOne({ method: 'POST', url: '/api/auth/login' }).flush(res);
  };

  beforeEach(() => {
    localStorage.clear();
    assign.mockClear();
  });

  afterEach(() => http.verify());

  it('starts logged out', () => {
    const service = create();
    expect(service.isLoggedIn()).toBe(false);
    expect(service.user()).toBeNull();
  });

  it('login stores the session, remembers the company code and picks the only branch', () => {
    const service = create();
    login(service);

    expect(service.isLoggedIn()).toBe(true);
    expect(service.user()?.name).toBe('Admin');
    expect(service.company()?.code).toBe('DEMO');
    expect(service.currentBranch()?.id).toBe(1);
    expect(service.companyCode()).toBe('DEMO');
    expect(localStorage.getItem('an22.token')).toBe('"mock-jwt-token.t1.u1"');
  });

  it('keeps a remembered branch that is still allowed, else none of several', () => {
    localStorage.setItem('an22.branch', '2');
    const service = create();
    login(service, response([branch(1), branch(2)]));
    expect(service.currentBranch()?.id).toBe(2);

    localStorage.setItem('an22.branch', '3');
    login(service, response([branch(1), branch(2), branch(3, false)]));
    expect(service.currentBranch()).toBeNull();
  });

  it('logout clears the session but keeps the company code, then reloads to login', () => {
    const service = create();
    login(service);

    service.logout();

    expect(service.isLoggedIn()).toBe(false);
    expect(service.company()).toBeNull();
    expect(localStorage.getItem('an22.token')).toBeNull();
    expect(localStorage.getItem('an22.companyCode')).toBe('"DEMO"');
    expect(assign).toHaveBeenCalledWith('/auth/login');
  });

  it('treats a session saved without a company (before SaaS) as logged out (E1)', () => {
    localStorage.setItem('an22.token', JSON.stringify('mock-jwt-token'));
    localStorage.setItem('an22.user', JSON.stringify(response().user));
    const service = create();
    expect(service.isLoggedIn()).toBe(false);
    expect(service.token()).toBeNull();
    expect(localStorage.getItem('an22.user')).toBeNull();
  });

  it('forgets the company code on request', () => {
    const service = create();
    service.setCompanyCode('demo');
    expect(service.companyCode()).toBe('DEMO');
    service.setCompanyCode('');
    expect(localStorage.getItem('an22.companyCode')).toBeNull();
  });
});
