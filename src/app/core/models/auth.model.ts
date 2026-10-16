import type { Branch, Company } from './company.model';
import type { User } from './user.model';

/** Login by company code + username + password (D4, SaaS step 1). */
export interface LoginRequest {
  companyCode: string;
  username: string;
  password: string;
}

/**
 * The session: the token names the tenant + user (the company comes only from it); `branches` =
 * the active branches this user may work in.
 */
export interface LoginResponse {
  token: string;
  user: User;
  company: Company;
  branches: Branch[];
}

/** `GET /me`: the same session without a new token. */
export type MeResponse = Omit<LoginResponse, 'token'>;
