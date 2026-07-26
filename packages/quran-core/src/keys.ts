/**
 * Canonical addressing for Quran content (handbook §6.1, D-003).
 *
 * Every module addresses Quran content through these value objects — never
 * through copied text:
 *
 *     VerseKey  = (surah 1..114, ayah 1..n)          "2:255"
 *     WordKey   = (surah, ayah, word_position 1..n)  "2:255:3"
 *     WordRange = (start: WordKey, end: WordKey)     inclusive, ordered
 *     PageRef   = (mushaf_id, page 1..604)
 *
 * `word_position` follows the space-split ordering of the QPC Ḥafṣ text used by
 * QUL / Quran Foundation word APIs, so annotations stay compatible with
 * `surah:ayah:word_position` integer addressing.
 *
 * The string forms are the ones the QDS OpenAPI contract declares as
 * `verse_key` / `word_key`, and the TypeScript mirror of
 * `shared/py/qc_shared/quran/keys.py`.
 *
 * Keys are plain frozen objects rather than classes: they cross the RN bridge,
 * go into Zustand stores and get structurally cloned, so they must survive
 * `JSON.parse(JSON.stringify(x))` unchanged.
 */

import { InvalidKeyError } from './errors.js';
import { MADANI_604_PAGE_COUNT, SURAH_COUNT, ayahCount, isSurah } from './metadata.js';

const VERSE_KEY_RE = /^(?:[1-9]|[1-9][0-9]|10[0-9]|11[0-4]):[1-9][0-9]{0,2}$/;
const WORD_KEY_RE = /^(?:[1-9]|[1-9][0-9]|10[0-9]|11[0-4]):[1-9][0-9]{0,2}:[1-9][0-9]{0,2}$/;
const MUSHAF_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface VerseKey {
  readonly surah: number;
  readonly ayah: number;
}

export interface WordKey extends VerseKey {
  readonly wordPosition: number;
}

/** An inclusive, ordered span of words. Used by annotations and review items. */
export interface WordRange {
  readonly start: WordKey;
  readonly end: WordKey;
}

export interface PageRef {
  readonly mushafId: string;
  readonly page: number;
}

function checkVerse(surah: number, ayah: number): void {
  if (!isSurah(surah)) {
    throw new InvalidKeyError(`surah out of range 1..${SURAH_COUNT}: ${surah}`);
  }
  const limit = ayahCount(surah);
  if (!Number.isInteger(ayah) || ayah < 1 || ayah > limit) {
    throw new InvalidKeyError(`ayah out of range 1..${limit} for surah ${surah}: ${ayah}`);
  }
}

// --- construction ------------------------------------------------------------

/** A validated ayah address. */
export function verseKey(surah: number, ayah: number): VerseKey {
  checkVerse(surah, ayah);
  return Object.freeze({ surah, ayah });
}

/**
 * A validated word address. The upper bound on `wordPosition` depends on the
 * text edition, so it is checked against a pack (`pack.words`), not here.
 */
export function wordKey(surah: number, ayah: number, wordPosition: number): WordKey {
  checkVerse(surah, ayah);
  if (!Number.isInteger(wordPosition) || wordPosition < 1) {
    throw new InvalidKeyError(`word_position must be an integer >= 1: ${wordPosition}`);
  }
  return Object.freeze({ surah, ayah, wordPosition });
}

/** An inclusive range; throws if `end` precedes `start`. */
export function wordRange(start: WordKey, end: WordKey): WordRange {
  if (compareWordKeys(start, end) > 0) {
    throw new InvalidKeyError(
      `word range is not ordered: ${formatWordKey(start)} > ${formatWordKey(end)}`,
    );
  }
  return Object.freeze({ start, end });
}

export function pageRef(mushafId: string, page: number): PageRef {
  if (!MUSHAF_ID_RE.test(mushafId)) {
    throw new InvalidKeyError(`not a mushaf id: ${JSON.stringify(mushafId)}`);
  }
  if (!Number.isInteger(page) || page < 1 || page > MADANI_604_PAGE_COUNT) {
    throw new InvalidKeyError(`page out of range 1..${MADANI_604_PAGE_COUNT}: ${page}`);
  }
  return Object.freeze({ mushafId, page });
}

// --- parsing / formatting ----------------------------------------------------

export function parseVerseKey(raw: string): VerseKey {
  if (!VERSE_KEY_RE.test(raw)) {
    throw new InvalidKeyError(`not a verse key 'surah:ayah': ${JSON.stringify(raw)}`);
  }
  const [surah, ayah] = raw.split(':');
  return verseKey(Number(surah), Number(ayah));
}

export function parseWordKey(raw: string): WordKey {
  if (!WORD_KEY_RE.test(raw)) {
    throw new InvalidKeyError(
      `not a word key 'surah:ayah:word_position': ${JSON.stringify(raw)}`,
    );
  }
  const [surah, ayah, position] = raw.split(':');
  return wordKey(Number(surah), Number(ayah), Number(position));
}

/** `parseVerseKey` that returns `null` instead of throwing (for user input). */
export function tryParseVerseKey(raw: string): VerseKey | null {
  try {
    return parseVerseKey(raw);
  } catch {
    return null;
  }
}

/** `parseWordKey` that returns `null` instead of throwing (for user input). */
export function tryParseWordKey(raw: string): WordKey | null {
  try {
    return parseWordKey(raw);
  } catch {
    return null;
  }
}

export function formatVerseKey(key: VerseKey): string {
  return `${key.surah}:${key.ayah}`;
}

export function formatWordKey(key: WordKey): string {
  return `${key.surah}:${key.ayah}:${key.wordPosition}`;
}

/** `2:255:1-2:255:5` — the form used in URLs and annotation payloads. */
export function formatWordRange(range: WordRange): string {
  return `${formatWordKey(range.start)}-${formatWordKey(range.end)}`;
}

export function parseWordRange(raw: string): WordRange {
  const separator = raw.indexOf('-');
  if (separator < 0) {
    throw new InvalidKeyError(`not a word range 'start-end': ${JSON.stringify(raw)}`);
  }
  return wordRange(
    parseWordKey(raw.slice(0, separator)),
    parseWordKey(raw.slice(separator + 1)),
  );
}

// --- conversion / comparison -------------------------------------------------

export function toVerseKey(key: VerseKey | WordKey): VerseKey {
  return verseKey(key.surah, key.ayah);
}

export function isWordKey(key: VerseKey | WordKey): key is WordKey {
  return typeof (key as WordKey).wordPosition === 'number';
}

export function compareVerseKeys(a: VerseKey, b: VerseKey): number {
  return a.surah - b.surah || a.ayah - b.ayah;
}

export function compareWordKeys(a: WordKey, b: WordKey): number {
  return compareVerseKeys(a, b) || a.wordPosition - b.wordPosition;
}

export function verseKeysEqual(a: VerseKey, b: VerseKey): boolean {
  return compareVerseKeys(a, b) === 0;
}

export function wordKeysEqual(a: WordKey, b: WordKey): boolean {
  return compareWordKeys(a, b) === 0;
}

export function rangeContains(range: WordRange, key: WordKey): boolean {
  return compareWordKeys(range.start, key) <= 0 && compareWordKeys(key, range.end) <= 0;
}

export function rangesOverlap(a: WordRange, b: WordRange): boolean {
  return compareWordKeys(a.start, b.end) <= 0 && compareWordKeys(b.start, a.end) <= 0;
}

/**
 * Every word key in `range`, in recitation order.
 *
 * The number of words in an ayah is a property of the text edition, so the
 * caller supplies it — in practice `pack.words.countFor` (see `pack/reader.ts`).
 * That keeps this module free of both text and edition assumptions.
 */
export function expandRange(
  range: WordRange,
  wordCountFor: (verse: VerseKey) => number,
): WordKey[] {
  const keys: WordKey[] = [];
  for (const verse of versesInRange(range)) {
    const count = wordCountFor(verse);
    const first = verseKeysEqual(verse, range.start) ? range.start.wordPosition : 1;
    const last = verseKeysEqual(verse, range.end)
      ? Math.min(range.end.wordPosition, count)
      : count;
    for (let position = first; position <= last; position += 1) {
      keys.push(wordKey(verse.surah, verse.ayah, position));
    }
  }
  return keys;
}

/** Every ayah touched by `range`, in recitation order (spans surah boundaries). */
export function versesInRange(range: WordRange): VerseKey[] {
  const verses: VerseKey[] = [];
  let current = toVerseKey(range.start);
  const last = toVerseKey(range.end);
  for (;;) {
    verses.push(current);
    if (verseKeysEqual(current, last)) return verses;
    const next = nextVerse(current);
    if (next === null) return verses;
    current = next;
  }
}

/** The following ayah in recitation order, or `null` after 114:6. */
export function nextVerse(key: VerseKey): VerseKey | null {
  if (key.ayah < ayahCount(key.surah)) return verseKey(key.surah, key.ayah + 1);
  if (key.surah < SURAH_COUNT) return verseKey(key.surah + 1, 1);
  return null;
}

/** The preceding ayah in recitation order, or `null` before 1:1. */
export function previousVerse(key: VerseKey): VerseKey | null {
  if (key.ayah > 1) return verseKey(key.surah, key.ayah - 1);
  if (key.surah > 1) return verseKey(key.surah - 1, ayahCount(key.surah - 1));
  return null;
}
