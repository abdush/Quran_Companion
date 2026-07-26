import { describe, expect, it } from 'vitest';

import {
  InvalidKeyError,
  compareWordKeys,
  expandRange,
  formatVerseKey,
  formatWordKey,
  formatWordRange,
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
  verseKey,
  versesInRange,
  wordKey,
  wordRange,
} from '../src/index.js';

describe('verse keys', () => {
  it('round-trips the canonical string form', () => {
    expect(formatVerseKey(parseVerseKey('2:255'))).toBe('2:255');
    expect(parseVerseKey('114:6')).toEqual({ surah: 114, ayah: 6 });
  });

  it('validates against the Ḥafṣ ayah division', () => {
    expect(() => parseVerseKey('2:287')).toThrow(InvalidKeyError);
    expect(() => parseVerseKey('115:1')).toThrow(InvalidKeyError);
    expect(() => verseKey(1, 8)).toThrow(/ayah out of range 1\.\.7/);
  });

  it('rejects sloppy string forms rather than coercing them', () => {
    for (const raw of ['2:255 ', ' 2:255', '02:255', '2:0', '2', '2:255:1', '']) {
      expect(tryParseVerseKey(raw), raw).toBeNull();
    }
  });

  it('walks recitation order across surah boundaries', () => {
    expect(nextVerse(verseKey(1, 7))).toEqual(verseKey(2, 1));
    expect(previousVerse(verseKey(2, 1))).toEqual(verseKey(1, 7));
    expect(nextVerse(verseKey(114, 6))).toBeNull();
    expect(previousVerse(verseKey(1, 1))).toBeNull();
  });
});

describe('word keys', () => {
  it('round-trips and exposes its verse', () => {
    const key = parseWordKey('2:255:3');
    expect(formatWordKey(key)).toBe('2:255:3');
    expect(toVerseKey(key)).toEqual({ surah: 2, ayah: 255 });
  });

  it('requires a positive word position', () => {
    expect(() => wordKey(2, 255, 0)).toThrow(InvalidKeyError);
    expect(() => wordKey(2, 255, 1.5)).toThrow(InvalidKeyError);
  });

  it('orders by surah, then ayah, then position', () => {
    const keys = [wordKey(2, 255, 2), wordKey(1, 1, 4), wordKey(2, 254, 9), wordKey(2, 255, 1)];
    expect([...keys].sort(compareWordKeys).map(formatWordKey)).toEqual([
      '1:1:4',
      '2:254:9',
      '2:255:1',
      '2:255:2',
    ]);
  });

  it('keys survive a structured-clone round trip (they cross the RN bridge)', () => {
    const key = wordKey(2, 255, 3);
    expect(JSON.parse(JSON.stringify(key))).toEqual(key);
  });
});

describe('word ranges', () => {
  const range = wordRange(wordKey(2, 255, 3), wordKey(2, 256, 2));

  it('refuses to be constructed backwards', () => {
    expect(() => wordRange(wordKey(2, 255, 3), wordKey(2, 255, 1))).toThrow(
      /word range is not ordered/,
    );
  });

  it('round-trips its string form', () => {
    expect(formatWordRange(range)).toBe('2:255:3-2:256:2');
    expect(parseWordRange('2:255:3-2:256:2')).toEqual(range);
  });

  it('is inclusive at both ends', () => {
    expect(rangeContains(range, wordKey(2, 255, 3))).toBe(true);
    expect(rangeContains(range, wordKey(2, 256, 2))).toBe(true);
    expect(rangeContains(range, wordKey(2, 255, 2))).toBe(false);
    expect(rangeContains(range, wordKey(2, 256, 3))).toBe(false);
  });

  it('detects overlap', () => {
    const later = wordRange(wordKey(2, 256, 2), wordKey(2, 257, 1));
    const disjoint = wordRange(wordKey(2, 257, 1), wordKey(2, 257, 4));
    expect(rangesOverlap(range, later)).toBe(true);
    expect(rangesOverlap(range, disjoint)).toBe(false);
  });

  it('lists the ayat it touches, crossing surah boundaries', () => {
    const crossing = wordRange(wordKey(1, 7, 1), wordKey(2, 2, 1));
    expect(versesInRange(crossing).map(formatVerseKey)).toEqual(['1:7', '2:1', '2:2']);
  });

  it('expands to word keys using the edition word counts it is given', () => {
    // Counts come from the pack in production; here they are the test's input.
    const counts = new Map([
      ['2:255', 50],
      ['2:256', 25],
    ]);
    const keys = expandRange(range, (verse) => counts.get(formatVerseKey(verse)) ?? 0);
    expect(keys).toHaveLength(50 - 3 + 1 + 2);
    expect(formatWordKey(keys[0] as never)).toBe('2:255:3');
    expect(formatWordKey(keys.at(-1) as never)).toBe('2:256:2');
  });
});

describe('page refs', () => {
  it('validates the mushaf id and page bounds', () => {
    expect(pageRef('qpc-hafs-madani-604', 604)).toEqual({
      mushafId: 'qpc-hafs-madani-604',
      page: 604,
    });
    expect(() => pageRef('QPC Hafs', 1)).toThrow(InvalidKeyError);
    expect(() => pageRef('qpc-hafs-madani-604', 605)).toThrow(InvalidKeyError);
    expect(() => pageRef('qpc-hafs-madani-604', 0)).toThrow(InvalidKeyError);
  });
});
