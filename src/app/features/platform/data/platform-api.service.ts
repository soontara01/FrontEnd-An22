import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import { PlanId, PlatformCompanyDetail, PlatformCompanyRow, PlatformEmail } from '@core/models';

/** HTTP calls of the platform pages (E36, provided in platform.routes.ts). */
@Injectable()
export class PlatformApi {
  private readonly api = inject(ApiService);

  companies(): Observable<PlatformCompanyRow[]> {
    return this.api.get<PlatformCompanyRow[]>('platform/companies');
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

  setOwnerPassword(id: number, password: string): Observable<null> {
    return this.api.put<null>(`platform/companies/${id}/owner-password`, { password });
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
