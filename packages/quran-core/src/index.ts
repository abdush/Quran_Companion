/**
 * `@qc/quran-core` — canonical addressing, normalisation, and the data-pack
 * reader (handbook §6.1, §6.3).
 *
 * This package contains **no Quran text** (D-003, rule R2). Text arrives as
 * verified pack bytes and is handed back to the caller unmodified.
 */

export { InvalidKeyError, PackError, QuranCoreError, type PackErrorCode } from './errors.js';

export {
  MADANI_604_MUSHAF_ID,
  MADANI_604_PAGE_COUNT,
  SURAHS_WITHOUT_STANDALONE_BASMALLAH,
  SURAH_COUNT,
  TOTAL_AYAHS,
  ayahCount,
  isSurah,
  madani604LinesOnPage,
} from './metadata.js';

export {
  type PageRef,
  type VerseKey,
  type WordKey,
  type WordRange,
  compareVerseKeys,
  compareWordKeys,
  expandRange,
  formatVerseKey,
  formatWordKey,
  formatWordRange,
  isWordKey,
  nextVerse,
  pageRef,
  parseVerseKey,
  parseWordKey,
  parseWordRange,
  previousVerse,
  rangeContains,
  rangesOverlap,
  toVerseKey,
  tryParseVerseKey,
  tryParseWordKey,
  verseKey,
  verseKeysEqual,
  versesInRange,
  wordKey,
  wordKeysEqual,
  wordRange,
} from './keys.js';

export {
  EXACT,
  SEARCH_FOLD,
  TASHKIL_INSENSITIVE,
  type NormalizeOptions,
  compareNormalized,
  equalsForSearch,
  equalsIgnoringTashkil,
  foldForSearch,
  hasTashkil,
  normalizeArabic,
  splitWords,
  stripTashkil,
} from './normalize.js';

export {
  DEFAULT_WORD_ITEMS,
  type ItemRole,
  type ParsedItemId,
  languageOf,
  mushafIdOf,
  parseItemId,
  roleOf,
} from './pack/items.js';

export {
  SUPPORTED_MANIFEST_VERSION,
  type PackManifest,
  validateManifest,
} from './pack/manifest.js';

export {
  SIGNATURE_PREFIX,
  SignatureFormatError,
  type SignatureCheck,
  type TrustedKey,
  canonicalManifestBytes,
  checkManifestSignature,
  publicKeyFromPem,
  trustedKeyFromPem,
} from './pack/signature.js';

export {
  GlossTable,
  LayoutTable,
  WordTable,
  type LayoutLine,
  type LineType,
  type PageLayout,
  type WordEntry,
  type WordPlacement,
} from './pack/tables.js';

export {
  QuranPack,
  type OpenPackOptions,
  type PackAttribution,
  openPack,
} from './pack/reader.js';
