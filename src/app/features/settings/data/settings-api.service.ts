import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import {
  Branch,
  BranchDetails,
  CompanyInfo,
  PosTerminal,
  Shift,
  normalizeShift,
} from '@core/models';

/** HTTP calls for the settings feature (provided in settings.routes.ts). */
@Injectable()
export class SettingsApi {
  private readonly api = inject(ApiService);

  /** Company settings (E11); only a company admin may save. */
  companyInfo(): Observable<CompanyInfo> {
    return this.api.get<CompanyInfo>('settings/company');
  }

  saveCompanyInfo(info: CompanyInfo): Observable<CompanyInfo> {
    return this.api.put<CompanyInfo>('settings/company', info);
  }

  /** The current branch (`X-Branch-Id`) with its printed details. */
  branch(): Observable<Branch> {
    return this.api.get<Branch>('settings/branch');
  }

  saveBranch(details: BranchDetails): Observable<Branch> {
    return this.api.put<Branch>('settings/branch', details);
  }

  posTerminals(): Observable<PosTerminal[]> {
    return this.api.get<PosTerminal[]>('pos-terminals');
  }

  /** Open shift of the terminal this device is set to (`X-Terminal-Id`), null = none. */
  currentShift(): Observable<Shift | null> {
    return this.api
      .get<Shift | null>('shifts/current')
      .pipe(map((s) => (s ? normalizeShift(s) : null)));
  }
}
