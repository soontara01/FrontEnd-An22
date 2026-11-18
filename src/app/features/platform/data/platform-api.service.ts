import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import {
  NewCompanyPayload,
  NewCompanyResult,
  PlanId,
  PlatformCompanyDetail,
  PlatformCompanyRow,
  PlatformEmail,
  SetupLink,
} from '@core/models';

/** HTTP calls of the platform pages (E36, provided in platform.routes.ts). */
@Injectable()
export class PlatformApi {
  private readonly api = inject(ApiService);

  companies(): Observable<PlatformCompanyRow[]> {
    return this.api.get<PlatformCompanyRow[]>('platform/companies');
  }

  /** A new company (E59 — only the platform creates them) + the owner's setup link, shown once. */
  createCompany(payload: NewCompanyPayload): Observable<NewCompanyResult> {
    return this.api.post<NewCompanyResult>('platform/companies', payload);
  }

  company(id: number): Observable<PlatformCompanyDetail> {
    return this.api.get<PlatformCompanyDetail>(`platform/companies/${id}`);
  }

  changePlan(id: number, planId: PlanId): Observable<PlatformCompanyDetail> {
    return this.api.put<PlatformCompanyDetail>(`platform/companies/${id}/plan`, { planId });
  }

  suspend(id: number, note: string): Observable<PlatformCompanyDetail> {
    return this.api.post<PlatformCompanyDetail>(`platform/companies/${id}/suspend`, { note });
  }

  reactivate(id: number): Observable<PlatformCompanyDetail> {
    return this.api.post<PlatformCompanyDetail>(`platform/companies/${id}/reactivate`, {});
  }

  /** A new setup link for the owner (E59): their earlier unused links stop working. */
  ownerSetupLink(id: number): Observable<SetupLink> {
    return this.api.post<SetupLink>(`platform/companies/${id}/owner-setup-link`, {});
  }

  /** Clears a user's Microsoft Authenticator (E58): they set it up again at the next login. */
  resetUserMfa(id: number, username: string): Observable<null> {
    return this.api.post<null>(`platform/companies/${id}/mfa-reset`, { username });
  }

  payInvoice(invoiceId: number): Observable<PlatformCompanyDetail> {
    return this.api.post<PlatformCompanyDetail>(`platform/invoices/${invoiceId}/pay`, {});
  }

  /** Deletes a company's data for good once its deletion request is due (E39). */
  purge(id: number): Observable<PlatformCompanyDetail> {
    return this.api.post<PlatformCompanyDetail>(`platform/companies/${id}/purge`, {});
  }

  outbox(): Observable<PlatformEmail[]> {
    return this.api.get<PlatformEmail[]>('platform/outbox');
  }
}
