import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from '../http/api.service';
import type { Branch, Company, LoginRequest, LoginResponse, User } from '../models';
import { StorageService } from '../services/storage.service';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const COMPANY_KEY = 'company';
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

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly company = this._company.asReadonly();
  readonly branches = this._branches.asReadonly();
  /** Company code remembered on this device ('' = none). */
  readonly companyCode = this._companyCode.asReadonly();
  readonly isLoggedIn = computed(() => !!this._token() && !!this._company());
  /** Admin-only screens and buttons (the server checks the same rules → 403). */
  readonly isAdmin = computed(() => this._user()?.role === 'admin');
  /**
   * Admin of every branch = company-level work: branches, company settings, … (E5 / E6). Same rule
   * as `isCompanyAdmin()` in `user.model.ts`, inlined: importing that file adds ~3 kB to the
   * initial bundle.
   */
  readonly isCompanyAdmin = computed(() => {
    const user = this._user();
    return user?.role === 'admin' && !!user.allBranches;
  });
  /** The working branch (sent as `X-Branch-Id`); null = not chosen yet (only one → automatic). */
  readonly currentBranch = computed(
    () => this._branches().find((b) => b.id === this._branchId()) ?? null,
  );

  constructor() {
    if (this._token() && !this._company()) this.clearSession();
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('auth/login', credentials).pipe(
      tap(({ token, user, company, branches }) => {
        this.storage.set(TOKEN_KEY, token);
        this.storage.set(USER_KEY, user);
        this.storage.set(COMPANY_KEY, company);
        this.storage.set(BRANCHES_KEY, branches);
        this._token.set(token);
        this._user.set(user);
        this._company.set(company);
        this._branches.set(branches);
        this.setCompanyCode(company.code);
        const branchId = pickBranch(branches, this.storage.get<number>(BRANCH_KEY));
        this._branchId.set(branchId);
        if (branchId !== null) this.storage.set(BRANCH_KEY, branchId);
      }),
    );
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
    for (const key of [TOKEN_KEY, USER_KEY, COMPANY_KEY, BRANCHES_KEY]) this.storage.remove(key);
    this._token.set(null);
    this._user.set(null);
    this._company.set(null);
    this._branches.set([]);
    this._branchId.set(null);
  }
}

/** The remembered branch when still allowed, else the only one, else none (chosen in step 2). */
function pickBranch(branches: readonly Branch[], remembered: number | null): number | null {
  const active = branches.filter((b) => b.active);
  if (active.some((b) => b.id === remembered)) return remembered;
  return active.length === 1 ? active[0].id : null;
}
