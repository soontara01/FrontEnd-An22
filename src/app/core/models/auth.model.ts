import type { Branch, Company } from './company.model';
import type { BillingNotice } from './subscription.model';
import type { User } from './user.model';

/** Login by company code + username + password (D4, SaaS step 1). */
export interface LoginRequest {
  companyCode: string;
  username: string;
  password: string;
}

/**
 * The session: user + company (the tenant comes only from the session's token, which the web
 * server keeps — the browser never sees it, E48); `branches` = the active branches this user may
 * work in.
 */
export interface LoginResponse {
  user: User;
  company: Company;
  branches: Branch[];
  /** Trial ending / invoice waiting / overdue (E35) — for the owner and admins; null = nothing */
  billing: BillingNotice | null;
  /** This user sees cost / profit (`canSeeCost()`, E43); false = every cost field arrives `null` */
  canSeeCost: boolean;
}

/** `GET /me`: the current session (once per page load — how the app knows it is logged in). */
export type MeResponse = LoginResponse;
