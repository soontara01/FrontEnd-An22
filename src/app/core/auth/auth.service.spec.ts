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
    address: '',
    phone: '',
    receiptFooter: '',
    active,
  });
  const response = (branches: Branch[] = [branch(1)]): LoginResponse => ({
    user: {
      id: 1,
      username: 'admin',
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      active: true,
      branchIds: [],
      allBranches: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
    company: { id: 1, code: 'DEMO', name: 'ร้านตัวอย่าง', taxId: '', active: true },
    branches,
    billing: null,
    canSeeCost: true,
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
    // E48: the session stays in memory — only the company code / branch of the device are stored
    expect(Object.keys(localStorage).sort()).toEqual(['an22.branch', 'an22.companyCode']);
  });

  it('restore() loads the session from /me, a 401 just means logged out (E48)', () => {
    const service = create();
    service.restore().subscribe();
    http.expectOne({ method: 'GET', url: '/api/me' }).flush(response());
    expect(service.isLoggedIn()).toBe(true);
    expect(service.currentBranch()?.id).toBe(1);

    const done = vi.fn();
    service.restore().subscribe({ next: done, error: () => expect.unreachable() });
    http
      .expectOne({ method: 'GET', url: '/api/me' })
      .flush({ message: 'x' }, { status: 401, statusText: 'Unauthorized' });
    expect(done).toHaveBeenCalled();
    expect(service.isLoggedIn()).toBe(false);
    expect(service.unavailable()).toBe(false);
  });

  it('restore() failing with a server error opens logged out and says so (V2-U-14)', () => {
    const service = create();
    service.restore().subscribe({ error: () => expect.unreachable() });
    http
      .expectOne({ method: 'GET', url: '/api/me' })
      .flush({ message: 'x' }, { status: 500, statusText: 'Server Error' });
    expect(service.isLoggedIn()).toBe(false);
    expect(service.unavailable()).toBe(true);

    login(service);
    expect(service.unavailable()).toBe(false);
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

    // the web server ends its session first (E48) — also when that fails; until then the session
    // stays, so open pages do not reload without a branch (V2-U-04)
    expect(service.isLoggedIn()).toBe(true);
    expect(assign).not.toHaveBeenCalled();
    http.expectOne({ method: 'POST', url: '/api/auth/logout' }).flush(null);
    expect(service.isLoggedIn()).toBe(false);
    expect(service.company()).toBeNull();
    expect(localStorage.getItem('an22.companyCode')).toBe('"DEMO"');
    expect(assign).toHaveBeenCalledWith('/auth/login');

    assign.mockClear();
    login(service);
    service.logout();
    http
      .expectOne({ method: 'POST', url: '/api/auth/logout' })
      .flush(null, { status: 500, statusText: 'Error' });
    expect(assign).toHaveBeenCalledWith('/auth/login');
  });

  it('shows cost to admins always, to staff when the session says so (E43)', () => {
    const service = create();
    const staff = response();
    staff.user = { ...staff.user, role: 'user' };
    login(service, { ...staff, canSeeCost: false });
    expect(service.canSeeCost()).toBe(false);

    // The company turned it on: the next page load's /me says so.
    const { user, company, branches } = staff;
    service.refresh().subscribe();
    http
      .expectOne({ method: 'GET', url: '/api/me' })
      .flush({ user, company, branches, canSeeCost: true });
    expect(service.canSeeCost()).toBe(true);

    login(service, { ...response(), canSeeCost: false }); // an admin always sees it
    expect(service.canSeeCost()).toBe(true);
    service.logout();
    http.expectOne({ method: 'POST', url: '/api/auth/logout' }).flush(null);
    expect(service.canSeeCost()).toBe(false);
  });

  it('a 401 while logging out does not turn it into an expired session (V2-U-04)', () => {
    const service = create();
    login(service);

    service.logout();
    service.logout('expired'); // errorInterceptor on a list's 401 meanwhile
    http.expectOne({ method: 'POST', url: '/api/auth/logout' }).flush(null);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/auth/login');
  });

  it('removes the session it once kept in localStorage and does not use it (E48)', () => {
    localStorage.setItem('an22.token', JSON.stringify('mock-jwt-token.t1.u1'));
    localStorage.setItem('an22.user', JSON.stringify(response().user));
    localStorage.setItem('an22.company', JSON.stringify(response().company));
    localStorage.setItem('an22.branches', JSON.stringify([branch(1)]));
    localStorage.setItem('an22.canSeeCost', 'true');
    localStorage.setItem('an22.platformToken', JSON.stringify('mock-platform-token.p1'));
    localStorage.setItem('an22.platformAdmin', JSON.stringify({ id: 1 }));
    localStorage.setItem('an22.theme', JSON.stringify('dark'));
    const service = create();
    expect(service.isLoggedIn()).toBe(false);
    expect(Object.keys(localStorage)).toEqual(['an22.theme']);
  });

  it('forgets the company code on request', () => {
    const service = create();
    service.setCompanyCode('demo');
    expect(service.companyCode()).toBe('DEMO');
    service.setCompanyCode('');
    expect(localStorage.getItem('an22.companyCode')).toBeNull();
  });

  it('chooses among several branches and refreshes the session from /me', () => {
    const service = create();
    login(service, response([branch(1), branch(2)]));
    expect(service.currentBranch()).toBeNull();
    service.selectBranch(9); // not allowed: ignored
    expect(service.currentBranch()).toBeNull();
    service.selectBranch(2);
    expect(service.currentBranch()?.id).toBe(2);
    expect(localStorage.getItem('an22.branch')).toBe('2');

    // the admin took branch 2 away: /me drops it
    const { user, company, branches } = response([branch(1)]);
    const me = { user, company, branches };
    service.refresh().subscribe();
    http.expectOne({ method: 'GET', url: '/api/me' }).flush(me);
    expect(service.currentBranch()?.id).toBe(1);
    expect(service.branches().map((b) => b.id)).toEqual([1]);
  });
});
