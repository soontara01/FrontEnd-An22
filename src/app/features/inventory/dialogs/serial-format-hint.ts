import { Product } from '@core/models';

/** Human-readable serial format of a SKU, e.g. "NB… ยาว 12 ตัว". */
export function serialFormatHint(p: Pick<Product, 'serialPrefix' | 'serialLength'>): string {
  const parts = [
    p.serialPrefix ? `ขึ้นต้น ${p.serialPrefix}` : '',
    p.serialLength ? `ยาว ${p.serialLength} ตัว` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'ไม่กำหนด';
}
