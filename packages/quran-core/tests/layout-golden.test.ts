/**
 * Golden gates on the layout the pack ships (rule R8 — never weaken these to
 * make a build pass; a red gate here means the data or the reader is wrong).
 *
 * Two independent kinds of expectation are checked, and the distinction matters:
 *
 * 1. **Structural invariants** written down in `src/metadata.ts` and in the
 *    handbook — 114 surahs, 6236 ayat, 604 pages, 15 lines per page (8 on the
 *    two framed opening pages), one heading line per surah plus one basmallah
 *    line for every surah except al-Fātiḥa and at-Tawba. These are stated
 *    independently of any pack, so they can falsify the data.
 * 2. **A drift detector**, `tests/golden/layout-corpus.json`, regenerated only
 *    by `scripts/make-fixture-pack.mjs` from a real pack whose word counts were
 *    themselves validated upstream against an independent split of the Tanzil
 *    text (`tools/pack-builder` golden gates). It pins today's corpus so that a
 *    future pack cannot silently move a word to another page.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  MADANI_604_MUSHAF_ID,
  MADANI_604_PAGE_COUNT,
  SURAHS_WITHOUT_STANDALONE_BASMALLAH,
  SURAH_COUNT,
  TOTAL_AYAHS,
  type LayoutTable,
  type QuranPack,
  ayahCount,
  formatVerseKey,
  formatWordKey,
  madani604LinesOnPage,
  openPack,
  verseKey,
} from '../src/index.js';
import { SAMPLE_PAGES, fixturePackBytes, fixtureTrust } from './support/fixture.js';

interface CorpusGolden {
  readonly mushaf_id: string;
  readonly page_count: number;
  readonly line_count: number;
  readonly placed_word_count: number;
  readonly ayah_count: number;
  readonly words_per_surah: Record<string, number>;
  readonly words_per_ayah_on_sample_pages: Record<string, number>;
}

const golden = JSON.parse(
  readFileSync(
    join(resolve(dirname(fileURLToPath(import.meta.url))), 'golden', 'layout-corpus.json'),
    'utf-8',
  ),
) as CorpusGolden;

let pack: QuranPack;
let layout: LayoutTable;

beforeAll(async () => {
  pack = await openPack(fixturePackBytes(), fixtureTrust());
  layout = pack.layout();
});

describe('structural invariants of the Madani 604 muṣḥaf', () => {
  it('lays out 604 pages of the expected edition', () => {
    expect(layout.mushafId).toBe(MADANI_604_MUSHAF_ID);
    expect(layout.pages).toHaveLength(MADANI_604_PAGE_COUNT);
    expect(layout.pages[0]).toBe(1);
    expect(layout.pages.at(-1)).toBe(MADANI_604_PAGE_COUNT);
  });

  it('gives every page the line count the edition prescribes', () => {
    for (const page of layout.pages) {
      expect(layout.page(page).lines, `page ${page}`).toHaveLength(madani604LinesOnPage(page));
    }
  });

  it('numbers lines 1..n with no gaps on every page', () => {
    for (const page of layout.pages) {
      const numbers = layout.page(page).lines.map((line) => line.lineNumber);
      expect(numbers, `page ${page}`).toEqual(numbers.map((_, index) => index + 1));
    }
  });

  it('carries one surah-name line per surah and a basmallah line for all but two', () => {
    const surahNameLines: number[] = [];
    const basmallahLines: number[] = [];
    for (const page of layout.pages) {
      for (const line of layout.page(page).lines) {
        if (line.type === 'surah_name') surahNameLines.push(line.surah as number);
        if (line.type === 'basmallah') basmallahLines.push(line.surah as number);
      }
    }
    expect(surahNameLines).toHaveLength(SURAH_COUNT);
    expect(new Set(surahNameLines).size).toBe(SURAH_COUNT);
    expect(basmallahLines).toHaveLength(SURAH_COUNT - SURAHS_WITHOUT_STANDALONE_BASMALLAH.size);
    for (const surah of SURAHS_WITHOUT_STANDALONE_BASMALLAH) {
      expect(basmallahLines, `surah ${surah}`).not.toContain(surah);
    }
  });

  it('places every word of every ayah exactly once, in recitation order', () => {
    const seen = new Set<string>();
    let previous: { surah: number; ayah: number; wordPosition: number } | null = null;
    const wordsPerAyah = new Map<string, number>();

    for (const page of layout.pages) {
      for (const line of layout.page(page).lines) {
        for (const word of line.words) {
          const key = formatWordKey(word);
          expect(seen.has(key), `${key} placed twice`).toBe(false);
          seen.add(key);
          if (previous !== null) {
            const ordered =
              word.surah > previous.surah ||
              (word.surah === previous.surah && word.ayah > previous.ayah) ||
              (word.surah === previous.surah &&
                word.ayah === previous.ayah &&
                word.wordPosition === previous.wordPosition + 1);
            expect(ordered, `${formatWordKey(previous)} is followed by ${key}`).toBe(true);
          }
          previous = word;
          const verse = formatVerseKey(word);
          wordsPerAyah.set(verse, (wordsPerAyah.get(verse) ?? 0) + 1);
        }
      }
    }

    expect(seen.size).toBe(layout.placedWordCount);
    expect(wordsPerAyah.size).toBe(TOTAL_AYAHS);

    // Every ayah of every surah is present, and word positions run 1..count.
    for (let surah = 1; surah <= SURAH_COUNT; surah += 1) {
      for (let ayah = 1; ayah <= ayahCount(surah); ayah += 1) {
        const count = wordsPerAyah.get(`${surah}:${ayah}`);
        expect(count, `${surah}:${ayah} is missing from the layout`).toBeGreaterThan(0);
        expect(layout.locate({ surah, ayah, wordPosition: count as number })).not.toBeNull();
      }
    }
  });

  it('never splits an ayah across non-adjacent pages', () => {
    for (let surah = 1; surah <= SURAH_COUNT; surah += 1) {
      for (let ayah = 1; ayah <= ayahCount(surah); ayah += 1) {
        const pages = layout.pagesOf(verseKey(surah, ayah));
        expect(pages.length, `${surah}:${ayah}`).toBeGreaterThan(0);
        pages.forEach((page, index) => {
          if (index > 0) expect(page).toBe((pages[index - 1] as number) + 1);
        });
      }
    }
  });
});

describe('drift detector against the pinned corpus golden', () => {
  it('matches the pinned totals', () => {
    expect(layout.mushafId).toBe(golden.mushaf_id);
    expect(layout.pages).toHaveLength(golden.page_count);
    expect(layout.placedWordCount).toBe(golden.placed_word_count);
    expect(
      layout.pages.reduce((total, page) => total + layout.page(page).lines.length, 0),
    ).toBe(golden.line_count);
  });

  it('matches the pinned word count of every surah', () => {
    const counts = new Map<number, number>();
    for (const page of layout.pages) {
      for (const line of layout.page(page).lines) {
        for (const word of line.words) {
          counts.set(word.surah, (counts.get(word.surah) ?? 0) + 1);
        }
      }
    }
    expect(Object.fromEntries([...counts].map(([surah, count]) => [String(surah), count]))).toEqual(
      golden.words_per_surah,
    );
  });
});

describe('word data on the sampled pages', () => {
  it('has text for every word the layout places there', () => {
    const words = pack.words();
    for (const page of SAMPLE_PAGES) {
      for (const line of layout.page(page).lines) {
        for (const word of line.words) {
          const entry = words.get(word);
          expect(entry, `${formatWordKey(word)} on page ${page}`).not.toBeNull();
          expect((entry as { text: string }).text.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('agrees with the layout on the word count of every ayah it carries', () => {
    // Two independently serialised items in the pack — the word table and the
    // layout table — must agree. This is the word-count-per-ayah golden.
    const words = pack.words();
    for (const [verse, expected] of Object.entries(golden.words_per_ayah_on_sample_pages)) {
      const [surah, ayah] = verse.split(':').map(Number);
      const key = verseKey(surah as number, ayah as number);
      expect(words.countFor(key), verse).toBe(expected);
      expect(layout.locate({ ...key, wordPosition: expected }), verse).not.toBeNull();
      expect(layout.locate({ ...key, wordPosition: expected + 1 }), verse).toBeNull();
    }
  });

  it('places the sampled pages where the muṣḥaf does', () => {
    expect(layout.pageOf(verseKey(1, 1))).toBe(1);
    expect(layout.pageOf(verseKey(2, 1))).toBe(2);
    expect(layout.pageOf(verseKey(2, 255))).toBe(42);
    expect(layout.pageOf(verseKey(114, 1))).toBe(604);
  });
});
