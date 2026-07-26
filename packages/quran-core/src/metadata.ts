/**
 * Structural metadata of the Ḥafṣ muṣḥaf — counts and bounds, never text.
 *
 * Deliberately text-free (rule R2 / D-003): only the *shape* of the corpus,
 * which every client needs in order to validate canonical keys without opening
 * a pack or calling the Quran Data Service.
 *
 * This is the TypeScript mirror of `shared/py/qc_shared/quran/metadata.py`; the
 * two must agree, and `tests/metadata.test.ts` pins the values that make that
 * checkable (surah count, total ayat, page/line counts). They are *independent
 * expectations*: golden tests assert that pack data reproduces them, so they
 * must never be regenerated from a pack — that would make the gate tautological.
 */

export const SURAH_COUNT = 114;

/** Ayah count per surah, indexed 1..114 (index 0 is unused padding). */
const AYAH_COUNTS: readonly number[] = [
  0,
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
  123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
  34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
  60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
  28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
  15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
  5, 4, 5, 6,
];

/** Total ayat in the Ḥafṣ division. */
export const TOTAL_AYAHS = 6236;

/**
 * Surahs whose first line is *not* preceded by a standalone basmallah line:
 * al-Fātiḥa (the basmallah is ayah 1:1 itself) and at-Tawba (none is written).
 */
export const SURAHS_WITHOUT_STANDALONE_BASMALLAH: ReadonlySet<number> = new Set([1, 9]);

/** Canonical id of the layout+script edition Phase 0 ships (§6.1). */
export const MADANI_604_MUSHAF_ID = 'qpc-hafs-madani-604';

export const MADANI_604_PAGE_COUNT = 604;

const MADANI_604_FRAMED_PAGE_LINES = 8;
const MADANI_604_STANDARD_PAGE_LINES = 15;

export function isSurah(surah: number): boolean {
  return Number.isInteger(surah) && surah >= 1 && surah <= SURAH_COUNT;
}

/** Number of ayat in `surah`; throws `RangeError` for an unknown surah. */
export function ayahCount(surah: number): number {
  if (!isSurah(surah)) {
    throw new RangeError(`surah out of range 1..${SURAH_COUNT}: ${surah}`);
  }
  return AYAH_COUNTS[surah] as number;
}

/**
 * Expected typeset line count for `page` of the Madani 604 muṣḥaf: 15 lines
 * everywhere except the two opening framed pages, which carry 8.
 */
export function madani604LinesOnPage(page: number): number {
  if (!Number.isInteger(page) || page < 1 || page > MADANI_604_PAGE_COUNT) {
    throw new RangeError(`page out of range 1..${MADANI_604_PAGE_COUNT}: ${page}`);
  }
  return page <= 2 ? MADANI_604_FRAMED_PAGE_LINES : MADANI_604_STANDARD_PAGE_LINES;
}
