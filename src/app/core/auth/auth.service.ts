import { HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { ApiService } from '../http/api.service';
import { silentUnauthorized } from '../http/silent-unauthorized';
import type {
  BillingNotice,
  Branch,
  Company,
  LoginRequest,
  LoginResponse,
  MeResponse,
  SignupPayload,
  User,
} from '../models';
import { StorageService } from '../services/storage.service';

/**
 * Keys of the session this service once kept in localStorage (token, user, company …) — removed
 * on start: the session is an httpOnly cookie of the web server now, and its data stays in memory
 * (E48). Includes the platform admin's (`PlatformAuth`).
 */
const OLD_SESSION_KEYS = [
  'token',
  'user',
  'company',
  'canSeeCost',
  'branches',
  'platformToken',
  'platformAdmin',
];
/** This device's working branch; kept on logout so the next login stays in it when allowed. */
const BRANCH_KEY = 'branch';
/** Company code the device remembers for the login page (D4); kept on logout. */
const COMPANY_CODE_KEY = 'companyCode';

/**
 * Session: user, company and the branches the user may work in (saas-plan section 8) — in memory
 * only, loaded by `restore()` (`GET /me`) when each page opens. The token stays in the web
 * server's session behind an httpOnly cookie (E48); only device preferences go to localStorage.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly storage = inject(StorageService);
  private readonly document = inject(DOCUMENT);

  private readonly _user = signal<User | null>(null);
  private readonly _company = signal<Company | null>(null);
  private readonly _branches = signal<Branch[]>([]);
  private readonly _branchId = signal<number | null>(null);
  private readonly _companyCode = signal(this.storage.get<string>(COMPANY_CODE_KEY) ?? '');
  /** Billing banner of this page load (from login / `GET /me`, not stored). */
  private readonly _billing = signal<BillingNotice | null>(null);
  private readonly _seeCost = signal(false);
  /** `GET /me` failed for another reason than 401 (server down …) — said on the login page. */
  private readonly _unavailable = signal(false);
  /** `logout()` is on its way to the login page: later 401s must not redirect again (V2-U-04). */
  private leaving = false;

  readonly user = this._user.asReadonly();
  readonly company = this._company.asReadonly();
  readonly branches = this._branches.asReadonly();
  /** Company code remembered on this device ('' = none). */
  readonly companyCode = this._companyCode.asReadonly();
  readonly billing = this._billing.asReadonly();
  /** The last `restore()` could not tell who is logged in (5xx / network, V2-U-14). */
  readonly unavailable = this._unavailable.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user() && !!this._company());
  /**
   * Admin-only screens and buttons (the server checks the same rules → 403): an admin or the owner.
   * Same rules as `hasAdminRights()` / `isOwner()` / `isCompanyAdmin()` in `user.model.ts`,
   * inlined: importing that file adds ~3 kB to the initial bundle.
   */
  readonly isAdmin = computed(() => {
    const role = this._user()?.role;
    return role === 'admin' || role === 'owner';
  });
  /**
   * Cost / profit on screens (P5, E43): admins always, staff when the company allows it — the
   * server's `canSeeCost()` (cost-visibility.model.ts), sent in the session; when false every cost
   * field arrives `null`, so hide it rather than show 0.
   */
  readonly canSeeCost = computed(() => this.isAdmin() || this._seeCost());
  /** The company's owner (E33): package, billing, export, deletion, handing over ownership. */
  readonly isOwner = computed(() => this._user()?.role === 'owner');
  /** Admin of every branch or the owner = company-level work: branches, company settings, … (E5 / E6). */
  readonly isCompanyAdmin = computed(() => {
    const user = this._user();
    return this.isOwner() || (user?.role === 'admin' && !!user.allBranches);
  });
  /** The working branch (sent as `X-Branch-Id`); null = not chosen yet (only one → automatic). */
  readonly currentBranch = computed(
    () => this._branches().find((b) => b.id === this._branchId()) ?? null,
  );

  constructor() {
    for (const key of OLD_SESSION_KEYS) this.storage.remove(key);
  }

  /**
   * Who is logged in, once when a page opens (`provideAppInitializer` in app.config.ts) — also
   * picks up role / branch rights an admin changed. 401 = logged out (no snackbar); any other
   * error opens the page logged out with `unavailable` set — the login page says the system is
   * not answering (a snackbar of the app initializer may never show, V2-U-14).
   */
  restore(): Observable<void> {
    return this.api.get<MeResponse>('me', undefined, silentUnauthorized()).pipe(
      tap((session) => this.setSession(session)),
      map(() => undefined),
      catchError((err: unknown) => {
        this._unavailable.set(!(err instanceof HttpErrorResponse && err.status === 401));
        this.clearSession();
        return of(undefined);
      }),
    );
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.api
      .post<LoginResponse>('auth/login', credentials)
      .pipe(tap((session) => this.startSession(session)));
  }

  /** Signs a new company up (E37) and logs its owner in, like `login()`. */
  signup(payload: SignupPayload): Observable<LoginResponse> {
    return this.api
      .post<LoginResponse>('auth/signup', payload)
      .pipe(tap((session) => this.startSession(session)));
  }

  private startSession(session: LoginResponse): void {
    this.leaving = false;
    this._unavailable.set(false);
    this.setSession(session);
    this.setCompanyCode(session.company.code);
  }

  /**
   * Reloads user / company / branches (`GET /me`) on the branch page: rights changed by an admin
   * take effect; a branch no longer allowed is dropped. Page loads use `restore()`.
   */
  refresh(): Observable<MeResponse> {
    return this.api.get<MeResponse>('me').pipe(tap((session) => this.setSession(session)));
  }

  /**
   * Works in this branch from now on (saved on the device). The caller reloads the page: every
   * menu's state belongs to one branch.
   */
  selectBranch(id: number): void {
    if (!this._branches().some((b) => b.id === id && b.active)) return;
    this._branchId.set(id);
    this.storage.set(BRANCH_KEY, id);
  }

  private setSession({ user, company, branches, billing, canSeeCost }: MeResponse): void {
    this._billing.set(billing ?? null);
    this._seeCost.set(canSeeCost === true);
    this._user.set(user);
    this._company.set(company);
    this._branches.set(branches);
    const branchId = pickBranch(branches, this.storage.get<number>(BRANCH_KEY));
    this._branchId.set(branchId);
    if (branchId !== null) this.storage.set(BRANCH_KEY, branchId);
  }

  /** Remembers (or with '' forgets — "เปลี่ยน" on the login page) the company code. */
  setCompanyCode(code: string): void {
    // = `normalizeCompanyCode()` (company.model.ts), inlined to keep that file out of the initial bundle
    const value = code.trim().toUpperCase();
    this._companyCode.set(value);
    if (value) this.storage.set(COMPANY_CODE_KEY, value);
    else this.storage.remove(COMPANY_CODE_KEY);
  }

  /**
   * Ends the session on the web server (`POST /auth/logout` drops its token and cookie), then a
   * full page reload to the login page (SPA per menu) — also when that call fails. `expired` = the
   * server ended the session (401): the login page says so, a snackbar would die with the reload
   * (C3-6). The session in memory stays until that call answers: clearing it first made open pages
   * reload their lists without a branch, and their 401 sent a plain logout to `?expired=1`
   * (V2-U-04); a second call while leaving does nothing.
   */
  logout(reason?: 'expired'): void {
    if (this.leaving) return;
    this.leaving = true;
    const url = reason === 'expired' ? '/auth/login?expired=1' : '/auth/login';
    const toLogin = () => {
      this.clearSession();
      this.document.location.assign(url);
    };
    this.api
      .post('auth/logout', null, silentUnauthorized())
      .subscribe({ next: toLogin, error: toLogin });
  }

  /** Forgets the session in memory; the remembered company code and this device's branch stay. */
  private clearSession(): void {
    this._seeCost.set(false);
    this._user.set(null);
    this._company.set(null);
    this._branches.set([]);
    this._branchId.set(null);
  }
}

/** The remembered branch when still allowed, else the only one, else none (`/auth/select-branch`). */
function pickBranch(branches: readonly Branch[], remembered: number | null): number | null {
  const active = branches.filter((b) => b.active);
  if (active.some((b) => b.id === remembered)) return remembered;
  return active.length === 1 ? active[0].id : null;
}
