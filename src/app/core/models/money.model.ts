/** Why a typed baht amount is not acceptable (B1 / B14); null = fine. */
export type MoneyProblem = 'required' | 'negative' | 'decimals';

/**
 * The single check of a typed baht amount (UI + server): a number, not negative, at most 2
 * decimals. An empty field (`null` / `''` / `NaN`) is `required`, not "negative".
 */
export function moneyProblem(value: unknown): MoneyProblem | null {
  if (value === null || value === undefined) return 'required';
  if (typeof value === 'string' && !value.trim()) return 'required';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 'required';
  if (n < 0) return 'negative';
  return Math.round(n * 100) / 100 === n ? null : 'decimals';
}

/** Thai message for `moneyProblem()`, e.g. label 'ต้นทุน' → 'กรุณากรอกต้นทุน'. */
export function moneyProblemText(problem: MoneyProblem, label: string): string {
  switch (problem) {
    case 'required':
      return `กรุณากรอก${label}`;
    case 'negative':
      return `${label}ต้องไม่ติดลบ`;
    case 'decimals':
      return `${label}ทศนิยมไม่เกิน 2 ตำแหน่ง`;
  }
}

/** `moneyProblem()` as a Thai message, or null when the amount is fine. */
export function moneyInputError(value: unknown, label: string): string | null {
  const problem = moneyProblem(value);
  return problem ? moneyProblemText(problem, label) : null;
}
