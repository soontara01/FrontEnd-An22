import { Product, serialFormatError } from '@core/models';

export type SerialLineError = 'format' | 'dup-batch' | 'in-stock';

export interface SerialLine {
  serial: string;
  error: SerialLineError | null;
  message: string;
}

/**
 * Parses multi-line serial input (typed, pasted or scanned; 1 line = 1 serial).
 * Lines are trimmed and upper-cased; blank lines are skipped.
 * `inStock` holds serials already in the warehouse (to catch re-receiving).
 */
export function parseSerialLines(
  text: string,
  format: Pick<Product, 'serialPrefix' | 'serialLength'>,
  inStock: ReadonlySet<string>,
): SerialLine[] {
  const seen = new Set<string>();

  const check = (serial: string): SerialLine => {
    const formatError = serialFormatError(serial, format);
    if (formatError) return { serial, error: 'format', message: formatError };
    if (seen.has(serial)) return { serial, error: 'dup-batch', message: 'ซ้ำในรายการ' };
    if (inStock.has(serial)) return { serial, error: 'in-stock', message: 'มีอยู่ในคลังแล้ว' };
    return { serial, error: null, message: '' };
  };

  return text
    .split(/\r?\n/)
    .map((line) => line.trim().toUpperCase())
    .filter(Boolean)
    .map((serial) => {
      const line = check(serial);
      seen.add(serial);
      return line;
    });
}
