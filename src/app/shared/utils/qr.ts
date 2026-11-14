/**
 * QR code as an image URL (`data:image/svg+xml`, allowed by the CSP — E49). The `qrcode` library
 * loads only here, on first use, so it stays in its own lazy chunk (E55: Authenticator setup).
 */
export async function qrDataUrl(text: string): Promise<string> {
  const { toString } = await import('qrcode');
  const svg = await toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
