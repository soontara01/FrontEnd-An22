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

/**
 * Moving one's own Authenticator to another phone (E58, Settings): `POST /me/mfa/change
 * { password, code }` (code of the phone in use) → the new phone's `setup` + `change` (a short-lived
 * proof, 10 minutes) → `POST /me/mfa/change/confirm { change, code }` (code of the new phone) swaps
 * them. The old phone keeps working until then.
 */
export interface MfaChange {
  change: string;
  setup: MfaSetup;
}

/**
 * `POST /auth/login` / `POST /auth/signup`: always the code step (E57) — the session comes from
 * `POST /auth/mfa/verify`. Kept a union so an answer is never taken for a session by accident.
 */
export type LoginResult = LoginResponse | MfaChallenge;

/** The code step (shop login E55 / platform login E56) rather than a session. */
export const isMfaChallenge = <T extends object>(r: T | MfaChallenge): r is MfaChallenge =>
  'mfa' in r;

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
