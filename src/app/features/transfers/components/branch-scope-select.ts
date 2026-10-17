import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { BranchScope } from '@core/models';
import { MATERIAL } from '@shared/material';

/**
 * Branch of the transfer list (E23, same as the sales menu's picker): the branches the user works in, plus "ทุกสาขา" for company
 * admins when `allowAll`. Hidden when there is nothing to choose.
 */
@Component({
  selector: 'app-branch-scope-select',
  imports: [MATERIAL],
  template: `
    @if (options().length > 1) {
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="branch">
        <mat-label>สาขา</mat-label>
        <mat-select [value]="value()" (selectionChange)="changed.emit($event.value)">
          @for (o of options(); track o.value) {
            <mat-option [value]="o.value">{{ o.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    }
  `,
  styles: `
    .branch {
      min-width: 180px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BranchScopeSelect {
  private readonly auth = inject(AuthService);

  readonly value = input.required<BranchScope>();
  /** Offer "ทุกสาขา" (company admins only) */
  readonly allowAll = input(true);
  readonly changed = output<BranchScope>();

  protected readonly options = computed(() => [
    ...(this.allowAll() && this.auth.isCompanyAdmin()
      ? [{ value: 'all' as BranchScope, label: 'ทุกสาขา' }]
      : []),
    ...this.auth
      .branches()
      .map((b) => ({ value: b.id as BranchScope, label: `${b.code} ${b.name}` })),
  ]);
}
