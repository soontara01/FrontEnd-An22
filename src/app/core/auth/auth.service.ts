import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from '../http/api.service';
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

const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const COMPANY_KEY = 'company';
/** `canSeeCost` of the last session (E43), so the first render of a page load is right. */
const SEE_COST_KEY = 'canSeeCost';
const BRANCHES_KEY = 'branches';
/** This device's working branch; kept on logout so the next login stays in it when allowed. */
const BRANCH_KEY = 'branch';
/** Company code the device remembers for the login page (D4); kept on logout. */
const COMPANY_CODE_KEY = 'companyCode';

/**
 * Session: token, user, company and the branches the user may work in (saas-plan section 8).
 * A session saved without a company (before SaaS step 1) counts as logged out (E1).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly storage = inject(StorageService);
  private readonly document = inject(DOCUMENT);

  private readonly _token = signal<string | null>(this.storage.get<string>(TOKEN_KEY));
  private readonly _user = signal<User | null>(this.storage.get<User>(USER_KEY));
  private readonly _company = signal<Company | null>(this.storage.get<Company>(COMPANY_KEY));
  private readonly _branches = signal<Branch[]>(this.storage.get<Branch[]>(BRANCHES_KEY) ?? []);
  private readonly _branchId = signal<number | null>(
    pickBranch(this._branches(), this.storage.get<number>(BRANCH_KEY)),
  );
  private readonly _companyCode = signal(this.storage.get<string>(COMPANY_CODE_KEY) ?? '');
  /** Billing banner of this page load (from login / `GET /me`, not stored). */
  private readonly _billing = signal<BillingNotice | null>(null);
  private readonly _seeCost = signal(this.storage.get<boolean>(SEE_COST_KEY) === true);

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly company = this._company.asReadonly();
  readonly branches = this._branches.asReadonly();
  /** Company code remembered on this device ('' = none). */
  readonly companyCode = this._companyCode.asReadonly();
  readonly billing = this._billing.asReadonly();
  readonly isLoggedIn = computed(() => !!this._token() && !!this._company());
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
    if (this._token() && !this._company()) this.clearSession();
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
    this.storage.set(TOKEN_KEY, session.token);
    this._token.set(session.token);
    this.setSession(session);
    this.setCompanyCode(session.company.code);
  }

  /**
   * Reloads user / company / branches (`GET /me`, once per page load and on the branch page):
   * role or branch rights changed by an admin take effect; a branch no longer allowed is dropped.
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
    this.storage.set(SEE_COST_KEY, canSeeCost === true);
    this.storage.set(USER_KEY, user);
    this.storage.set(COMPANY_KEY, company);
    this.storage.set(BRANCHES_KEY, branches);
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

  logout(): void {
    this.clearSession();
    // Full page reload to the login page (SPA per menu)
    this.document.location.assign('/auth/login');
  }

  /** Drops the session; the remembered company code and this device's branch stay. */
  private clearSession(): void {
    for (const key of [TOKEN_KEY, USER_KEY, COMPANY_KEY, BRANCHES_KEY, SEE_COST_KEY]) {
      this.storage.remove(key);
    }
    this._seeCost.set(false);
    this._token.set(null);
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
