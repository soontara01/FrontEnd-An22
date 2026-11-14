/**
 * TOTP (RFC 6238) as Microsoft Authenticator (and any other authenticator app) reads it: HMAC-SHA1,
 * 6 digits, 30-second steps, the secret in base32 (E55). Pure and synchronous, so the mock and the
 * golden fixtures run it as the api must — the api checks codes with the JDK's own HMAC.
 */

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Steps either side of now a code is still taken (clock drift of the phone): ±30 seconds */
export const TOTP_WINDOW = 1;
/** Issuer shown in the authenticator app above the account */
export const TOTP_ISSUER = 'AN22';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 without padding (what authenticator apps take). */
export function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Base32 → bytes (spaces, `=` and case ignored); null = not base32. */
export function base32Decode(text: string): Uint8Array | null {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const index = BASE32.indexOf(ch);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** A new secret: 20 random bytes (160 bits, RFC 4226's recommendation) in base32 = 32 letters. */
export function newTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

/** The 30-second step a moment falls in. */
export const totpStep = (nowMs: number): number => Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);

/** The code of one step (`secret` in base32); '' when the secret is not base32. */
export function totpCode(secret: string, step: number): string {
  const key = base32Decode(secret);
  if (!key) return '';
  const counter = new Uint8Array(8);
  // 64-bit big-endian counter (a step stays below 2^53).
  let rest = step;
  for (let i = 7; i >= 0; i--) {
    counter[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  const mac = hmacSha1(key, counter);
  const offset = mac[19] & 15;
  const binary =
    ((mac[offset] & 127) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/** A typed code has the right shape (6 digits; spaces taken out first). */
export const normalizeTotpCode = (code: string): string => (code ?? '').replace(/\s/g, '');
export const isTotpCode = (code: string): boolean =>
  new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(normalizeTotpCode(code));

/**
 * The step a code matches within `TOTP_WINDOW` of now, else null. A step at or before `lastStep`
 * (the last one used) never matches again — a code read over someone's shoulder is used up.
 */
export function verifyTotp(
  secret: string,
  code: string,
  nowMs: number,
  lastStep: number | null,
): number | null {
  const typed = normalizeTotpCode(code);
  if (!isTotpCode(typed)) return null;
  const now = totpStep(nowMs);
  for (let step = now - TOTP_WINDOW; step <= now + TOTP_WINDOW; step++) {
    if (lastStep !== null && step <= lastStep) continue;
    if (totpCode(secret, step) === typed) return step;
  }
  return null;
}

/**
 * What the QR code holds: `otpauth://totp/AN22:<COMPANY>:<username>?secret=…&issuer=AN22` — the
 * app lists it as "AN22" with "<COMPANY>:<username>" underneath.
 */
export function otpauthUrl(companyCode: string, username: string, secret: string): string {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${companyCode}:${username}`);
  const query = [
    `secret=${secret}`,
    `issuer=${encodeURIComponent(TOTP_ISSUER)}`,
    'algorithm=SHA1',
    `digits=${TOTP_DIGITS}`,
    `period=${TOTP_PERIOD_SECONDS}`,
  ].join('&');
  return `otpauth://totp/${label}?${query}`;
}

/** A secret to type by hand, in groups of 4 letters. */
export const formatTotpSecret = (secret: string): string => secret.replace(/(.{4})(?=.)/g, '$1 ');

// --- HMAC-SHA1 (RFC 2104 / FIPS 180-4), synchronous on purpose (Web Crypto is async only) ---

function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = 64;
  let k = key.length > block ? sha1(key) : key;
  const padded = new Uint8Array(block);
  padded.set(k);
  k = padded;
  const inner = new Uint8Array(block + message.length);
  const outer = new Uint8Array(block + 20);
  for (let i = 0; i < block; i++) {
    inner[i] = k[i] ^ 0x36;
    outer[i] = k[i] ^ 0x5c;
  }
  inner.set(message, block);
  outer.set(sha1(inner), block);
  return sha1(outer);
}

function sha1(data: Uint8Array): Uint8Array {
  const length = data.length;
  const total = Math.ceil((length + 9) / 64) * 64;
  const bytes = new Uint8Array(total);
  bytes.set(data);
  bytes[length] = 0x80;
  const view = new DataView(bytes.buffer);
  const bitLength = length * 8;
  view.setUint32(total - 8, Math.floor(bitLength / 2 ** 32));
  view.setUint32(total - 4, bitLength >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let chunk = 0; chunk < total; chunk += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(chunk + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => outView.setUint32(i * 4, h));
  return out;
}
