import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CATEGORY_LEVEL_LABEL, Category, CategoryLevel, CategoryPayload } from '@core/models';
import { AutofocusDirective } from '@shared/directives/autofocus.directive';
import { MATERIAL } from '@shared/material';
import { CategoryStore } from '../../data/category.store';

export interface CategoryFormData {
  /** Category being edited (undefined = new) */
  category?: Category;
  /** Parent of a new category (undefined = new department) */
  parent?: Category;
}

/** Add / edit one category. Closes with the saved Category. */
@Component({
  selector: 'app-category-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, AutofocusDirective, MATERIAL],
  templateUrl: './category-form-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryFormDialog {
  protected readonly data = inject<CategoryFormData>(MAT_DIALOG_DATA);
  private readonly store = inject(CategoryStore);
  private readonly dialogRef = inject<MatDialogRef<CategoryFormDialog, Category>>(MatDialogRef);

  protected readonly saving = signal(false);
  protected readonly level: CategoryLevel =
    this.data.category?.level ??
    ((this.data.parent ? this.data.parent.level + 1 : 1) as CategoryLevel);
  protected readonly levelLabel = CATEGORY_LEVEL_LABEL[this.level];
  protected readonly parentName =
    this.data.parent?.name ??
    (this.data.category?.parentId
      ? this.store.categories().find((c) => c.id === this.data.category?.parentId)?.name
      : undefined);

  protected readonly form = inject(NonNullableFormBuilder).group({
    // New child codes start with the parent code, e.g. IT-COM-
    code: [
      this.data.category?.code ?? (this.data.parent ? `${this.data.parent.code}-` : ''),
      [
        Validators.required,
        Validators.pattern(/^[A-Z0-9-]+$/),
        Validators.maxLength(20),
        this.uniqueCode(),
      ],
    ],
    name: [this.data.category?.name ?? '', [Validators.required, Validators.maxLength(60)]],
    active: [this.data.category?.active ?? true],
  });

  protected toUpper(): void {
    const control = this.form.controls.code;
    const upper = control.value.toUpperCase();
    if (upper !== control.value) control.setValue(upper);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { code, name, active } = this.form.getRawValue();
    const payload: CategoryPayload = {
      code,
      name: name.trim(),
      active,
      parentId: this.data.category?.parentId ?? this.data.parent?.id ?? null,
    };
    this.saving.set(true);
    const request$ = this.data.category
      ? this.store.update(this.data.category.id, payload)
      : this.store.create(payload);
    request$.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      error: () => this.saving.set(false),
    });
  }

  private uniqueCode() {
    return (control: AbstractControl<string>): ValidationErrors | null =>
      control.value && this.store.isDuplicateCode(control.value, this.data.category?.id)
        ? { duplicate: true }
        : null;
  }
}
