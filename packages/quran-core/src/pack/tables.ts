/**
 * Parsers for the line-oriented payloads a pack ships, and the read-only tables
 * they produce.
 *
 * The serialisations are the ones `tools/pack-builder/pack_builder/corpus.py`
 * writes: UTF-8, LF-terminated, sorted in canonical key order, tab-separated.
 * Because the SHA-256 of those exact bytes is what the manifest signs, the
 * parsers below are the only place a client interprets pack content — and they
 * are strict: a payload that does not parse is a refused pack, not a partial
 * one (`malformed-payload`).
 *
 * Parsing is lazy per item (see `reader.ts`): a page view that only needs
 * layout and words never pays for the gloss table.
 */

import { PackError } from '../errors.js';
import {
  type VerseKey,
  type WordKey,
  formatVerseKey,
  formatWordKey,
  parseWordKey,
} from '../keys.js';

export type LineType = 'ayah' | 'surah_name' | 'basmallah';

const LINE_TYPES = new Set<string>(['ayah', 'surah_name', 'basmallah']);

function isLineType(value: string): value is LineType {
  return LINE_TYPES.has(value);
}

/** One typeset line of a muṣḥaf page. Heading lines carry no words. */
export interface LayoutLine {
  readonly page: number;
  readonly lineNumber: number;
  readonly type: LineType;
  /** The surah a heading line announces; `null` on `ayah` lines. */
  readonly surah: number | null;
  /** Word keys in reading order (right to left). Empty on heading lines. */
  readonly words: readonly WordKey[];
}

/** Where a word sits in a specific layout. */
export interface WordPlacement {
  readonly mushafId: string;
  readonly page: number;
  readonly lineNumber: number;
  /** 1-based position within the line, in reading order. */
  readonly lineOrdinal: number;
}

export interface PageLayout {
  readonly mushafId: string;
  readonly page: number;
  readonly lines: readonly LayoutLine[];
}

function malformed(item: string, lineNumber: number, detail: string): never {
  throw new PackError('malformed-payload', `${item}, line ${lineNumber}: ${detail}`);
}

/** Split a payload into records, tolerating a missing final newline. */
function records(payload: string): string[] {
  const lines = payload.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function parseIndex(raw: string, item: string, at: number, field: string): number {
  if (!/^[0-9]+$/.test(raw)) malformed(item, at, `${field} is not a number: ${JSON.stringify(raw)}`);
  return Number(raw);
}

// --- layout ------------------------------------------------------------------

/**
 * Page/line structure of one muṣḥaf edition, plus the word → (page, line)
 * mapping that §6.1 says ships in the pack.
 */
export class LayoutTable {
  readonly mushafId: string;
  readonly pages: readonly number[];
  readonly #byPage: ReadonlyMap<number, readonly LayoutLine[]>;
  #byWord: Map<string, WordPlacement> | null = null;
  #pagesByVerse: Map<string, number[]> | null = null;

  private constructor(mushafId: string, byPage: Map<number, LayoutLine[]>) {
    this.mushafId = mushafId;
    this.#byPage = byPage;
    this.pages = [...byPage.keys()].sort((a, b) => a - b);
  }

  static parse(item: string, mushafId: string, payload: string): LayoutTable {
    const byPage = new Map<number, LayoutLine[]>();
    const rows = records(payload);
    if (rows.length === 0) {
      throw new PackError('malformed-payload', `${item}: layout payload is empty`);
    }

    rows.forEach((row, index) => {
      const at = index + 1;
      const fields = row.split('\t');
      if (fields.length !== 5) {
        malformed(item, at, `expected 5 tab-separated fields, got ${fields.length}`);
      }
      const page = parseIndex(fields[0] as string, item, at, 'page');
      const lineNumber = parseIndex(fields[1] as string, item, at, 'line_number');
      const type = fields[2] as string;
      if (!isLineType(type)) {
        malformed(item, at, `unknown line type ${JSON.stringify(type)}`);
      }
      const surahField = fields[3] as string;
      const surah = surahField === '' ? null : parseIndex(surahField, item, at, 'surah');
      const keys = fields[4] as string;
      const words =
        keys === ''
          ? []
          : keys.split(',').map((key) => {
              try {
                return parseWordKey(key);
              } catch (cause) {
                return malformed(item, at, `bad word key ${JSON.stringify(key)}`);
              }
            });

      if (type === 'ayah' && words.length === 0) {
        malformed(item, at, 'an ayah line carries no words');
      }
      if (type !== 'ayah' && words.length > 0) {
        malformed(item, at, `a ${type} line carries words`);
      }

      const lines = byPage.get(page);
      if (lines === undefined) {
        byPage.set(page, [{ page, lineNumber, type, surah, words }]);
      } else {
        const previous = lines[lines.length - 1] as LayoutLine;
        if (lineNumber <= previous.lineNumber) {
          malformed(
            item,
            at,
            `line ${lineNumber} does not follow line ${previous.lineNumber} on page ${page}`,
          );
        }
        lines.push({ page, lineNumber, type, surah, words });
      }
    });

    return new LayoutTable(mushafId, byPage);
  }

  has(page: number): boolean {
    return this.#byPage.has(page);
  }

  /** All typeset lines of `page`, in order. Throws if the pack lacks the page. */
  page(page: number): PageLayout {
    const lines = this.#byPage.get(page);
    if (lines === undefined) {
      throw new PackError(
        'unknown-item',
        `pack has no page ${page} for ${this.mushafId} (has ${this.pages.length} pages)`,
      );
    }
    return { mushafId: this.mushafId, page, lines };
  }

  /** Where `word` is typeset, or `null` if this layout does not place it. */
  locate(word: WordKey): WordPlacement | null {
    return this.#wordIndex().get(formatWordKey(word)) ?? null;
  }

  /** Every page `verse` appears on, in order (an ayah may straddle pages). */
  pagesOf(verse: VerseKey): readonly number[] {
    if (this.#pagesByVerse === null) {
      const index = new Map<string, number[]>();
      for (const page of this.pages) {
        const seen = new Set<string>();
        for (const line of this.#byPage.get(page) as readonly LayoutLine[]) {
          for (const word of line.words) {
            const key = formatVerseKey(word);
            if (seen.has(key)) continue;
            seen.add(key);
            const pages = index.get(key);
            if (pages === undefined) index.set(key, [page]);
            else pages.push(page);
          }
        }
      }
      this.#pagesByVerse = index;
    }
    return this.#pagesByVerse.get(formatVerseKey(verse)) ?? [];
  }

  /** The page an ayah starts on, or `null` if it is not in this layout. */
  pageOf(verse: VerseKey): number | null {
    return this.pagesOf(verse)[0] ?? null;
  }

  /** Number of words this layout places, across every page. */
  get placedWordCount(): number {
    return this.#wordIndex().size;
  }

  #wordIndex(): Map<string, WordPlacement> {
    if (this.#byWord !== null) return this.#byWord;
    const index = new Map<string, WordPlacement>();
    for (const page of this.pages) {
      for (const line of this.#byPage.get(page) as readonly LayoutLine[]) {
        line.words.forEach((word, ordinal) => {
          const key = formatWordKey(word);
          if (index.has(key)) {
            throw new PackError(
              'malformed-payload',
              `layout:${this.mushafId} places ${key} more than once`,
            );
          }
          index.set(key, {
            mushafId: this.mushafId,
            page: line.page,
            lineNumber: line.lineNumber,
            lineOrdinal: ordinal + 1,
          });
        });
      }
    }
    this.#byWord = index;
    return index;
  }
}

// --- words -------------------------------------------------------------------

export interface WordEntry {
  readonly key: WordKey;
  /** Script text as distributed by the edition — never modified, never generated. */
  readonly text: string;
  readonly transliteration: string | null;
}

export class WordTable {
  readonly item: string;
  readonly #byKey: ReadonlyMap<string, WordEntry>;
  readonly #countByVerse: ReadonlyMap<string, number>;

  private constructor(
    item: string,
    byKey: Map<string, WordEntry>,
    countByVerse: Map<string, number>,
  ) {
    this.item = item;
    this.#byKey = byKey;
    this.#countByVerse = countByVerse;
  }

  static parse(item: string, payload: string): WordTable {
    const byKey = new Map<string, WordEntry>();
    const countByVerse = new Map<string, number>();

    records(payload).forEach((row, index) => {
      const at = index + 1;
      const fields = row.split('\t');
      if (fields.length !== 3) {
        malformed(item, at, `expected 3 tab-separated fields, got ${fields.length}`);
      }
      const raw = fields[0] as string;
      let key: WordKey;
      try {
        key = parseWordKey(raw);
      } catch {
        return malformed(item, at, `bad word key ${JSON.stringify(raw)}`);
      }
      if (byKey.has(raw)) malformed(item, at, `duplicate word key ${raw}`);

      const transliteration = fields[2] as string;
      byKey.set(raw, {
        key,
        text: fields[1] as string,
        transliteration: transliteration === '' ? null : transliteration,
      });

      const verse = formatVerseKey(key);
      const count = countByVerse.get(verse) ?? 0;
      if (key.wordPosition !== count + 1) {
        malformed(
          item,
          at,
          `word_position ${key.wordPosition} does not follow ${count} for ${verse}`,
        );
      }
      countByVerse.set(verse, key.wordPosition);
    });

    return new WordTable(item, byKey, countByVerse);
  }

  get size(): number {
    return this.#byKey.size;
  }

  get(key: WordKey): WordEntry | null {
    return this.#byKey.get(formatWordKey(key)) ?? null;
  }

  has(key: WordKey): boolean {
    return this.#byKey.has(formatWordKey(key));
  }

  /** Number of words in `verse` per this edition; 0 if the pack lacks the ayah. */
  countFor(verse: VerseKey): number {
    return this.#countByVerse.get(formatVerseKey(verse)) ?? 0;
  }

  /** Every ayah this table carries, in canonical order. */
  verses(): VerseKey[] {
    return [...this.#countByVerse.keys()]
      .map((key) => {
        const [surah, ayah] = key.split(':');
        return { surah: Number(surah), ayah: Number(ayah) };
      })
      .sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
  }
}

// --- glosses -----------------------------------------------------------------

export class GlossTable {
  readonly item: string;
  readonly language: string;
  readonly #byKey: ReadonlyMap<string, string>;

  private constructor(item: string, language: string, byKey: Map<string, string>) {
    this.item = item;
    this.language = language;
    this.#byKey = byKey;
  }

  static parse(item: string, language: string, payload: string): GlossTable {
    const byKey = new Map<string, string>();
    records(payload).forEach((row, index) => {
      const at = index + 1;
      const fields = row.split('\t');
      if (fields.length !== 3) {
        malformed(item, at, `expected 3 tab-separated fields, got ${fields.length}`);
      }
      const raw = fields[0] as string;
      try {
        parseWordKey(raw);
      } catch {
        return malformed(item, at, `bad word key ${JSON.stringify(raw)}`);
      }
      if (fields[1] !== language) {
        malformed(item, at, `language ${JSON.stringify(fields[1])} is not ${language}`);
      }
      byKey.set(raw, fields[2] as string);
    });
    return new GlossTable(item, language, byKey);
  }

  get size(): number {
    return this.#byKey.size;
  }

  get(key: WordKey): string | null {
    return this.#byKey.get(formatWordKey(key)) ?? null;
  }
}
