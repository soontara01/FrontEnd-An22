/**
 * `o` over `defaults`, where a missing or `null` value takes the default; other nulls stay.
 * Used by the `normalize…()` readers so older stored data, or an API that drops `null` fields
 * (B24), still has every field.
 */
export function withDefaults<D extends object, T extends object>(defaults: D, o: T): D & T {
  const merged = { ...defaults, ...o } as Record<string, unknown>;
  for (const [key, value] of Object.entries(defaults)) merged[key] ??= value;
  return merged as D & T;
}
