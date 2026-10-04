import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { UserRole } from '@core/models';
import { NotificationService } from '@core/services/notification.service';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeader } from '@shared/components/page-header/page-header';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { UsersStore } from '../../data/users.store';

/** Create (`/users/new`) and edit (`/users/:id/edit`) form. */
@Component({
  selector: 'app-user-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    LoadingSpinner,
    AutofocusDirective,
    MATERIAL,
  ],
  templateUrl: './user-form.html',
  styleUrl: './user-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class UserForm implements OnInit {
  private readonly store = inject(UsersStore);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  /** Bound from the `:id` route param (withComponentInputBinding). */
  readonly id = input<string>();
  protected readonly isEdit = computed(() => !!this.id());

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly roles: UserRole[] = ['admin', 'user'];

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['user' as UserRole, Validators.required],
    active: [true],
  });

  ngOnInit(): void {
    const id = Number(this.id());
    if (!id) return;
    this.loading.set(true);
    this.store.getById(id).subscribe({
      next: (user) => {
        this.form.patchValue(user);
        this.loading.set(false);
      },
      error: () => void this.router.navigate(['/users']),
    });
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const payload = this.form.getRawValue();
    const request$ = this.isEdit()
      ? this.store.update(Number(this.id()), payload)
      : this.store.create(payload);

    request$.subscribe({
      next: () => {
        this.notify.success(this.isEdit() ? 'บันทึกการแก้ไขเรียบร้อย' : 'เพิ่มผู้ใช้เรียบร้อย');
        void this.router.navigate(['/users']);
      },
      error: () => this.saving.set(false),
    });
  }
}
