import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/http/api.service';
import { StoreInfo } from '@core/models';

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
}
