import {
  base32Decode,
  base32Encode,
  formatTotpSecret,
  isTotpCode,
  newTotpSecret,
  otpauthUrl,
  totpCode,
  totpStep,
  verifyTotp,
} from './totp.model';

/** RFC 6238 appendix B, SHA-1 key "12345678901234567890" — the 6 low digits of each code. */
const RFC_SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'));
const RFC_VECTORS: [number, string][] = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

describe('totp.model (E55)', () => {
  it('base32 round-trips (RFC 4648, no padding)', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Encode(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI');
    expect(new TextDecoder().decode(base32Decode('mzxw 6ytb oi==')!)).toBe('foobar');
    expect(base32Decode('not base32!')).toBeNull();
  });

  it.each(RFC_VECTORS)('matches RFC 6238 at T=%i', (seconds, code) => {
    expect(totpCode(RFC_SECRET, totpStep(seconds * 1000))).toBe(code);
  });

  it('takes a code within one step of now, and never a used step again', () => {
    const now = 1111111111 * 1000;
    const step = totpStep(now);
    expect(verifyTotp(RFC_SECRET, '050471', now, null)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now, null)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 2), now, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '050471', now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '050 471', now, step - 1)).toBe(step);
    expect(verifyTotp(RFC_SECRET, '05047', now, null)).toBeNull();
  });

  it('makes 32-letter secrets and the URL Microsoft Authenticator scans', () => {
    const secret = newTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(newTotpSecret()).not.toBe(secret);
    expect(otpauthUrl('DEMO', 'somchai', 'ABCD')).toBe(
      'otpauth://totp/AN22%3ADEMO%3Asomchai?secret=ABCD&issuer=AN22&algorithm=SHA1&digits=6&period=30',
    );
    expect(formatTotpSecret('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
    expect(isTotpCode(' 123 456 ')).toBe(true);
    expect(isTotpCode('12345a')).toBe(false);
  });
});
