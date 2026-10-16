import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { User, userChangeError } from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { openConfirm } from '@shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '@shared/components/empty-state/empty-state';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { MATERIAL } from '@shared/material';
import { ThaiDatePipe } from '@shared/pipes/thai-date.pipe';
import { httpErrorShown } from '@core/http/http-error-shown';
import { UsersStore } from '../../data/users.store';

@Component({
  selector: 'app-user-list',
  imports: [
    RouterLink,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatChipsModule,
    PageHeader,
    EmptyState,
    LoadingSpinner,
    ThaiDatePipe,
    MATERIAL,
  ],
  templateUrl: './user-list.html',
  styleUrl: './user-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class UserList {
  protected readonly store = inject(UsersStore);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);

  protected readonly columns = [
    'username',
    'name',
    'email',
    'role',
    'active',
    'createdAt',
    'actions',
  ];
  protected readonly dataSource = new MatTableDataSource<User>([]);
  protected readonly filterText = signal('');

  private readonly paginator = viewChild(MatPaginator);
  private readonly sort = viewChild(MatSort);

  constructor() {
    this.store.load();

    effect(() => {
      this.dataSource.data = this.store.users();
    });
    effect(() => {
      this.dataSource.filter = this.filterText().trim().toLowerCase();
    });
    effect(() => {
      this.dataSource.paginator = this.paginator() ?? null;
      this.dataSource.sort = this.sort() ?? null;
    });
  }

  /** Why this user cannot be deleted ('' = can): yourself / the last active admin. */
  protected deleteBlocker(user: User): string {
    return (
      userChangeError(
        this.store.users(),
        { kind: 'delete', id: user.id },
        this.auth.user()?.id ?? null,
      ) ?? ''
    );
  }

  protected remove(user: User): void {
    openConfirm(this.dialog, {
      title: 'ลบผู้ใช้',
      message: `ต้องการลบ "${user.name}" ใช่หรือไม่?`,
      confirmText: 'ลบ',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.remove(user.id)),
      )
      .subscribe({ next: () => this.notify.success('ลบผู้ใช้เรียบร้อย'), error: httpErrorShown });
  }
}
