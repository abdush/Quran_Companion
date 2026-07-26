/**
 * Tashkīl-aware normalisation for Arabic Quranic text.
 *
 * Used wherever text has to be *compared* rather than displayed: recitation
 * diffing, search, memorisation checks. Display always uses the pack's bytes
 * unmodified — normalisation output is derived data and must never be shown as
 * Quran text, redistributed, or written back into a pack (D-003, D-009).
 *
 * Three layers, each independently switchable, from least to most aggressive:
 *
 * 1. **marks** — remove harakāt, sukūn, shadda, superscript alef, Quranic
 *    annotation signs (waqf marks, sajdah, small high letters) and tatweel.
 *    Letter identity is untouched, so the result is still exact Arabic.
 * 2. **letter folding** — unify alef carriers, alef maqṣūra and tā' marbūṭa.
 *    Lossy: distinct words can collide (this is what you want for a search box,
 *    not for a correctness check).
 * 3. **whitespace** — collapse runs and trim.
 *
 * `word_position` is defined by space-splitting the QPC Ḥafṣ text, so
 * `splitWords` here is the same split the import pipeline uses; keeping one
 * definition is what makes a client's word indices line up with the pack's.
 *
 * Character classes are written with `\u` escapes rather than literal Arabic so
 * that ranges stay readable in an LTR editor and cannot be reordered by bidi.
 */

/**
 * Harakāt and other combining marks that sit on a letter (tashkīl proper):
 * U+064B–U+065F plus the superscript alef U+0670.
 */
const TASHKIL = /[ً-ٰٟ]/gu;

/**
 * Quranic annotation signs: honorifics (U+0610–U+061A), small high letters and
 * waqf marks (U+06D6–U+06DC, U+06DF–U+06ED), plus the zero-width joiners some
 * sources sprinkle into ligatures. Excludes the two *numbering* signs below.
 */
const QURANIC_MARKS = /[ؐ-ؚۖ-ۜ۟-۪ۨ-ۭ‌‍]/gu;

/** End-of-ayah (U+06DD) and rub-el-hizb (U+06DE) — structural, not textual. */
const STRUCTURAL_SIGNS = /[۝۞]/gu;

/** Tatweel / kashida (U+0640) — a justification device, never a letter. */
const TATWEEL = /ـ/gu;

/** آ أ إ ٱ (U+0622, U+0623, U+0625, U+0671) and the rarer wasla carriers. */
const ALEF_CARRIERS = /[آأإٱٲٳٵ]/gu;
const ALEF = 'ا';

/** Alef maqṣūra U+0649. */
const ALEF_MAQSURA = /ى/gu;
const YA = 'ي';

/** Tā' marbūṭa U+0629. */
const TA_MARBUTA = /ة/gu;
const HA = 'ه';

const WHITESPACE = /\s+/gu;

const ANY_MARK = /[ً-ٰٟؐ-ؚۖ-ۜ۟-ۭ]/u;

export interface NormalizeOptions {
  /** Unicode-normalise to NFC first. Default `true`. */
  nfc?: boolean;
  /** Strip harakāt, shadda, sukūn, superscript alef. Default `true`. */
  removeTashkil?: boolean;
  /** Strip waqf marks, sajdah signs, honorifics, ZWJ/ZWNJ. Default `true`. */
  removeQuranicMarks?: boolean;
  /** Strip the end-of-ayah and rub-el-hizb signs. Default `true`. */
  removeStructuralSigns?: boolean;
  /** Strip tatweel (kashida). Default `true`. */
  removeTatweel?: boolean;
  /** Fold the alef carriers onto bare alef. Default `false`. */
  unifyAlef?: boolean;
  /** Fold alef maqṣūra onto yā'. Default `false`. */
  unifyAlefMaqsura?: boolean;
  /** Fold tā' marbūṭa onto hā'. Default `false`. */
  unifyTaMarbuta?: boolean;
  /** Collapse whitespace runs and trim. Default `true`. */
  collapseWhitespace?: boolean;
}

/**
 * Ignore vocalisation and annotation, keep letter identity.
 * The right default for "did the reciter say this word?".
 */
export const TASHKIL_INSENSITIVE: Required<NormalizeOptions> = Object.freeze({
  nfc: true,
  removeTashkil: true,
  removeQuranicMarks: true,
  removeStructuralSigns: true,
  removeTatweel: true,
  unifyAlef: false,
  unifyAlefMaqsura: false,
  unifyTaMarbuta: false,
  collapseWhitespace: true,
});

/**
 * Everything in {@link TASHKIL_INSENSITIVE} plus letter folding.
 * Lossy on purpose — for search boxes, never for correctness checks.
 */
export const SEARCH_FOLD: Required<NormalizeOptions> = Object.freeze({
  ...TASHKIL_INSENSITIVE,
  unifyAlef: true,
  unifyAlefMaqsura: true,
  unifyTaMarbuta: true,
});

/** Compare exactly: no normalisation at all. Useful as an explicit opt-out. */
export const EXACT: Required<NormalizeOptions> = Object.freeze({
  nfc: false,
  removeTashkil: false,
  removeQuranicMarks: false,
  removeStructuralSigns: false,
  removeTatweel: false,
  unifyAlef: false,
  unifyAlefMaqsura: false,
  unifyTaMarbuta: false,
  collapseWhitespace: false,
});

export function normalizeArabic(text: string, options: NormalizeOptions = {}): string {
  const o = { ...TASHKIL_INSENSITIVE, ...options };
  let out = o.nfc ? text.normalize('NFC') : text;
  if (o.removeTashkil) out = out.replace(TASHKIL, '');
  if (o.removeQuranicMarks) out = out.replace(QURANIC_MARKS, '');
  if (o.removeStructuralSigns) out = out.replace(STRUCTURAL_SIGNS, '');
  if (o.removeTatweel) out = out.replace(TATWEEL, '');
  if (o.unifyAlef) out = out.replace(ALEF_CARRIERS, ALEF);
  if (o.unifyAlefMaqsura) out = out.replace(ALEF_MAQSURA, YA);
  if (o.unifyTaMarbuta) out = out.replace(TA_MARBUTA, HA);
  if (o.collapseWhitespace) out = out.replace(WHITESPACE, ' ').trim();
  return out;
}

/** Marks removed, letters untouched. */
export function stripTashkil(text: string): string {
  return normalizeArabic(text, TASHKIL_INSENSITIVE);
}

/** Marks removed *and* letters folded. */
export function foldForSearch(text: string): string {
  return normalizeArabic(text, SEARCH_FOLD);
}

/** True if `text` carries any vocalisation or Quranic annotation mark. */
export function hasTashkil(text: string): boolean {
  return ANY_MARK.test(text);
}

export function equalsIgnoringTashkil(a: string, b: string): boolean {
  return stripTashkil(a) === stripTashkil(b);
}

export function equalsForSearch(a: string, b: string): boolean {
  return foldForSearch(a) === foldForSearch(b);
}

/**
 * Split ayah text into words the way `word_position` is defined: on whitespace,
 * dropping empties. The end-of-ayah sign is *not* a word and is removed first,
 * matching the QPC word tables the packs ship.
 */
export function splitWords(text: string): string[] {
  return text
    .replace(STRUCTURAL_SIGNS, ' ')
    .split(WHITESPACE)
    .filter((word) => word.length > 0);
}

/** Locale-independent ordering of normalised Arabic (code-point order). */
export function compareNormalized(
  a: string,
  b: string,
  options: NormalizeOptions = TASHKIL_INSENSITIVE,
): number {
  const left = normalizeArabic(a, options);
  const right = normalizeArabic(b, options);
  return left < right ? -1 : left > right ? 1 : 0;
}
