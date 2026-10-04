import { serialFormatError } from '@core/models';
import { parseSerialLines } from './serial-input';

describe('serialFormatError', () => {
  const format = { serialPrefix: 'NB', serialLength: 6 };

  it('accepts a serial matching prefix and length', () => {
    expect(serialFormatError('NB-123', format)).toBeNull();
  });

  it('rejects bad characters, wrong prefix and wrong length', () => {
    expect(serialFormatError('NB 123', format)).toContain('A-Z');
    expect(serialFormatError('XX-123', format)).toContain('NB');
    expect(serialFormatError('NB-1234', format)).toContain('6');
  });

  it('allows any length/prefix when the format is not set', () => {
    expect(serialFormatError('ANY-1', { serialPrefix: '', serialLength: null })).toBeNull();
  });
});

describe('parseSerialLines', () => {
  const format = { serialPrefix: 'NB', serialLength: null };

  it('trims, upper-cases and skips blank lines', () => {
    const rows = parseSerialLines('  nb-1 \n\n\r\nNB-2\n', format, new Set());
    expect(rows.map((r) => r.serial)).toEqual(['NB-1', 'NB-2']);
    expect(rows.every((r) => r.error === null)).toBe(true);
  });

  it('flags format errors, duplicates in the batch and serials already in stock', () => {
    const rows = parseSerialLines('XX-1\nNB-1\nNB-1\nNB-9', format, new Set(['NB-9']));
    expect(rows.map((r) => r.error)).toEqual(['format', null, 'dup-batch', 'in-stock']);
  });
});
