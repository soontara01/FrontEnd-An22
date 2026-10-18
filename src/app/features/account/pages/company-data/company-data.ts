import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  inject,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { filter, of, switchMap } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { DELETION_WAIT_DAYS, deletionRequestError } from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { AdminOnlyNote } from '@shared/components/admin-only-note/admin-only-note';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { saveBlob, timestampedName } from '@shared/utils/download';
import { AccountApi } from '../../data/account-api.service';

/**
 * The company's own data (owner, PDPA): download everything as one JSON file (E38), ask for it to
 * be deleted after `DELETION_WAIT_DAYS` or cancel that request (E39).
 */
@Component({
  selector: 'app-company-data',
  imports: [AdminOnlyNote, ThaiDatePipe, MATERIAL],
  templateUrl: './company-data.html',
  styleUrl: './company-data.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CompanyData {
  private readonly api = inject(AccountApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);
  private readonly document = inject(DOCUMENT);

  protected readonly isOwner = this.auth.isOwner;
  protected readonly code = this.auth.company()?.code ?? '';
  protected readonly waitDays = DELETION_WAIT_DAYS;
  protected readonly busy = signal(false);
  protected readonly confirmCode = signal('');
  protected readonly password = signal('');
  protected readonly reason = signal('');
  protected readonly touched = signal(false);

  protected readonly deletion = rxResource({
    stream: () => (this.isOwner() ? this.api.deletion() : of(null)),
  });
  protected readonly pending = computed(() =>
    this.deletion.hasValue() ? this.deletion.value() : null,
  );
  protected readonly problem = computed(() =>
    deletionRequestError(
      { companyCode: this.confirmCode(), password: this.password(), reason: this.reason() },
      this.code,
    ),
  );

  protected download(): void {
    this.busy.set(true);
    this.api.exportData().subscribe({
      next: (data) => {
        this.busy.set(false);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        saveBlob(blob, `${timestampedName(`${this.code.toLowerCase()}-data`)}.json`);
        this.notify.success('ดาวน์โหลดข้อมูลทั้งบริษัทแล้ว');
      },
      error: () => this.busy.set(false),
    });
  }

  protected requestDeletion(): void {
    this.touched.set(true);
    if (this.problem() || this.busy()) return;
    openConfirm(this.dialog, {
      title: 'ขอลบข้อมูลบริษัท',
      message: `ทุกคนในบริษัทจะเข้าระบบไม่ได้ทันที และข้อมูลทั้งหมดจะถูกลบถาวรหลัง ${this.waitDays} วัน — ยืนยัน?`,
      confirmText: 'ขอลบข้อมูล',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.busy.set(true);
          return this.api.requestDeletion({
            companyCode: this.confirmCode(),
            password: this.password(),
            reason: this.reason(),
          });
        }),
      )
      .subscribe({
        // The session is limited from now on (`deletionPurgeAfter`): reload to apply it.
        next: () => this.document.location.assign('/account/data'),
        error: () => this.busy.set(false),
      });
  }

  protected cancelDeletion(): void {
    this.busy.set(true);
    this.api.cancelDeletion().subscribe({
      next: () => this.document.location.assign('/'),
      error: () => this.busy.set(false),
    });
  }
}
