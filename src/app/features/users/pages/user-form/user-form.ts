import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import {
  ROLE_LABEL,
  UserRole,
  passwordError,
  userBranchError,
  userChangeError,
  userIdentityError,
  userScopeError,
} from '@core/models';
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
  protected readonly auth = inject(AuthService);
  /** Branches the signed-in admin may give (a company admin: every active branch). */
  protected readonly branches = this.auth.branches;
  /** Rights of the user as loaded (null = new), for the branch-admin scope rule (E6). */
  private readonly before = signal<{ allBranches: boolean; branchIds: number[] } | null>(null);

  /** Bound from the `:id` route param (withComponentInputBinding). */
  readonly id = input<string>();
  protected readonly isEdit = computed(() => !!this.id());

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly roleLabel = ROLE_LABEL;

  protected readonly form = inject(NonNullableFormBuilder).group({
    username: [''],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    email: [''],
    role: ['user' as UserRole, Validators.required],
    active: [true],
    allBranches: [false],
    branchIds: [[] as number[]],
    password: [''],
  });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  /** Editing the owner (E33): the role and "every branch" are locked — ownership is handed over. */
  protected readonly isOwnerAccount = signal(false);
  protected readonly roles = computed<UserRole[]>(() =>
    this.isOwnerAccount() ? ['owner'] : ['admin', 'user'],
  );

  /** Username / e-mail, same rule as the server (`userIdentityError()`: format, unique — B5). */
  protected readonly identityProblem = computed(() => {
    const { username = '', email = '' } = this.value();
    const role = this.form.controls.role.value;
    return userIdentityError(
      this.store.users(),
      { username, email, role },
      Number(this.id()) || null,
    );
  });

  /** Branch rights + password (new users only), same rules as the server (E6 / E10). */
  protected readonly accessProblem = computed(() => {
    const { allBranches = false, branchIds = [], password = '' } = this.value();
    const actor = this.auth.user();
    // Scope first: a branch admin opening another branch's user is told why, not that the
    // branch "does not exist" (it is only missing from their own branch list).
    return (
      (actor ? userScopeError(actor, this.before(), { allBranches, branchIds }) : null) ??
      userBranchError({ allBranches, branchIds }, this.branches()) ??
      (this.isEdit() ? null : passwordError(password))
    );
  });

  /** Same rule as the server: not yourself, never the last active admin (`userChangeError()`). */
  protected readonly problem = computed(() => {
    if (!this.isEdit()) return null;
    const { active = true } = this.value();
    const role = this.form.controls.role.value;
    return userChangeError(
      this.store.users(),
      { kind: 'update', id: Number(this.id()), payload: { role, active } },
      this.auth.user()?.id ?? null,
    );
  });

  ngOnInit(): void {
    this.store.load(); // the other users: unique username / e-mail, last-admin rule
    const id = Number(this.id());
    if (!id) return;
    this.loading.set(true);
    this.store.getById(id).subscribe({
      next: (user) => {
        this.form.patchValue(user);
        if (user.role === 'owner') {
          this.isOwnerAccount.set(true);
          this.form.controls.role.disable();
          this.form.controls.allBranches.disable();
        }
        this.before.set({ allBranches: user.allBranches, branchIds: user.branchIds });
        this.loading.set(false);
      },
      error: () => void this.router.navigate(['/users']),
    });
  }

  protected save(): void {
    if (this.form.invalid || this.problem() || this.identityProblem() || this.accessProblem()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const { password, ...payload } = this.form.getRawValue();
    const request$ = this.isEdit()
      ? this.store.update(Number(this.id()), payload)
      : this.store.create({ ...payload, password });

    request$.subscribe({
      next: () => {
        this.notify.success(this.isEdit() ? 'บันทึกการแก้ไขเรียบร้อย' : 'เพิ่มผู้ใช้เรียบร้อย');
        void this.router.navigate(['/users']);
      },
      error: () => this.saving.set(false),
    });
  }
}
