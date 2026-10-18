import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import {
  AuditEvent,
  AuditQuery,
  CompanyDeletion,
  CompanyExport,
  DeletionRequest,
  User,
} from '@core/models';

/** HTTP calls for the account feature (provided in account.routes.ts). */
@Injectable()
export class AccountApi {
  private readonly api = inject(ApiService);

  /** Events this admin may see (E40), newest first; empty filters are not sent. */
  auditLog(query: AuditQuery): Observable<AuditEvent[]> {
    const params: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== '') params[key] = value;
    }
    return this.api.get<AuditEvent[]>('audit-log', params);
  }

  /** All the company's data as one JSON document (owner, E38). */
  exportData(): Observable<CompanyExport> {
    return this.api.get<CompanyExport>('company/export');
  }

  /** The owner's pending deletion request (E39); null = none. */
  deletion(): Observable<CompanyDeletion | null> {
    return this.api.get<CompanyDeletion | null>('company/deletion');
  }

  requestDeletion(p: DeletionRequest): Observable<CompanyDeletion> {
    return this.api.post<CompanyDeletion>('company/deletion', p);
  }

  cancelDeletion(): Observable<null> {
    return this.api.delete<null>('company/deletion');
  }

  /** The company's users, for the "who" filter. */
  users(): Observable<User[]> {
    return this.api.get<User[]>('users');
  }
}
