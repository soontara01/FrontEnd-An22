const DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

/**
 * Reads 0–999,999 in Thai (2 tens → ยี่สิบ; a ones digit 1 after any higher digit, including
 * the millions before it, → เอ็ด: 11 สิบเอ็ด, 1,000,001 หนึ่งล้านเอ็ด).
 */
function readGroup(n: number, afterMillions: boolean): string {
  const digits = String(n).split('').reverse().map(Number);
  return digits
    .map((d, place) => {
      if (!d) return '';
      if (place === 1 && d === 1) return 'สิบ';
      if (place === 1 && d === 2) return 'ยี่สิบ';
      if (place === 0 && d === 1 && (n > 9 || afterMillions)) return 'เอ็ด';
      return DIGITS[d] + PLACES[place];
    })
    .reverse()
    .join('');
}

/** Reads a whole number of any size, in groups of millions. */
function readNumber(n: number): string {
  if (n === 0) return 'ศูนย์';
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  return (
    (millions ? readNumber(millions) + 'ล้าน' : '') + (rest ? readGroup(rest, millions > 0) : '')
  );
}

/** Amount in Thai words for documents, e.g. 25131.5 → 'สองหมื่นห้าพันหนึ่งร้อยสามสิบเอ็ดบาทห้าสิบสตางค์'. */
export function bahtText(amount: number): string {
  const satangTotal = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;
  const sign = amount < 0 ? 'ลบ' : '';
  if (!satang) return `${sign}${readNumber(baht)}บาทถ้วน`;
  return `${sign}${baht ? readNumber(baht) + 'บาท' : ''}${readNumber(satang)}สตางค์`;
}
