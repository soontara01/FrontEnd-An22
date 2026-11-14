import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import {
  Branch,
  BranchDetails,
  CompanyInfo,
  MfaChange,
  PosTerminal,
  Shift,
  User,
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

  /** E58: moving one's Authenticator to a new phone — password + a code of the phone in use. */
  mfaChange(password: string, code: string): Observable<MfaChange> {
    return this.api.post<MfaChange>('me/mfa/change', { password, code });
  }

  /** E58: the new phone's first code swaps the secret. */
  mfaChangeConfirm(change: string, code: string): Observable<User> {
    return this.api.post<User>('me/mfa/change/confirm', { change, code });
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
