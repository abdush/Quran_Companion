/**
 * Arabic-Indic numerals. Ayah numbers and page numbers are numerals, not Quran
 * text — nothing here reads or produces scripture (rule R2).
 */

const ARABIC_INDIC_ZERO = 0x0660;

export function toArabicIndicDigits(value: number): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`not a non-negative integer: ${value}`);
  }
  return String(value)
    .split('')
    .map((digit) => String.fromCodePoint(ARABIC_INDIC_ZERO + Number(digit)))
    .join('');
}
