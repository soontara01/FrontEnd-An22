import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import { AuditEvent, AuditQuery, User } from '@core/models';

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

  /** The company's users, for the "who" filter. */
  users(): Observable<User[]> {
    return this.api.get<User[]>('users');
  }
}
