import type { Branch, Company } from './company.model';
import type { BillingNotice } from './subscription.model';
import type { User } from './user.model';

/** Login by company code + username + password (D4, SaaS step 1). */
export interface LoginRequest {
  companyCode: string;
  username: string;
  password: string;
  /** Through `/auth/login-mfa`: always ask the Authenticator code (E55) */
  mfa?: boolean;
}

/**
 * Setting Authenticator up (E55): the secret (base32) to type by hand and the `otpauth://` URL the
 * QR code holds. Sent only until the first code confirms it.
 */
export interface MfaSetup {
  secret: string;
  otpauthUrl: string;
}

/**
 * The password was right, now the Authenticator code (E55, `POST /auth/mfa/verify { code }`):
 * `verify` = the user has it, `setup` = scan `setup` first (the first code turns it on). The api's
 * `challenge` stays in the web server's session, like a token.
 */
export type MfaChallenge = { mfa: 'verify' } | { mfa: 'setup'; setup: MfaSetup };

/** `POST /auth/login`: the session, or the code step first. */
export type LoginResult = LoginResponse | MfaChallenge;

export const isMfaChallenge = (r: LoginResult): r is MfaChallenge => 'mfa' in r;

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
