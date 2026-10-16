import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import { PosTerminal, Shift, StoreInfo, normalizeShift } from '@core/models';

/** HTTP calls for the settings feature (provided in settings.routes.ts). */
@Injectable()
export class SettingsApi {
  private readonly api = inject(ApiService);

  storeInfo(): Observable<StoreInfo> {
    return this.api.get<StoreInfo>('settings/store');
  }

  saveStoreInfo(info: StoreInfo): Observable<StoreInfo> {
    return this.api.put<StoreInfo>('settings/store', info);
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
