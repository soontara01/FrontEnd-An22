import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { MoneyProblem, moneyProblem, moneyProblemText } from '@core/models';

/** Reactive-forms side of `moneyProblem()`: `{ money: 'required' | 'negative' | 'decimals' }`. */
export const moneyValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const problem = moneyProblem(control.value);
  return problem ? { money: problem } : null;
};

/** The `<mat-error>` text of a control checked by `moneyValidator`, e.g. 'กรุณากรอกต้นทุน'. */
export function moneyErrorText(control: AbstractControl, label: string): string | null {
  const problem = control.errors?.['money'] as MoneyProblem | undefined;
  return problem ? moneyProblemText(problem, label) : null;
}
