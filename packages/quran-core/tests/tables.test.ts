/**
 * Payload parsing is strict on purpose: a pack whose bytes verified but whose
 * content is nonsense must fail loudly at the point of use, not render a
 * half-page. Each case below is a corruption the parser has to detect.
 *
 * These fixtures are hand-written payload fragments — canonical keys and
 * placeholder Latin text, never Quran text (rule R2).
 */

import { describe, expect, it } from 'vitest';

import { GlossTable, LayoutTable, PackError, WordTable, verseKey, wordKey } from '../src/index.js';

const MUSHAF = 'qpc-hafs-madani-604';

function layout(...rows: string[]): LayoutTable {
  return LayoutTable.parse(`layout:${MUSHAF}`, MUSHAF, `${rows.join('\n')}\n`);
}

function words(...rows: string[]): WordTable {
  return WordTable.parse('text:qpc-hafs', `${rows.join('\n')}\n`);
}

describe('LayoutTable', () => {
  const rows = [
    '1\t1\tsurah_name\t1\t',
    '1\t2\tayah\t\t1:1:1,1:1:2',
    '1\t3\tayah\t\t1:1:3,1:1:4',
  ];

  it('parses heading lines and ayah lines', () => {
    const table = layout(...rows);
    const page = table.page(1);
    expect(page.mushafId).toBe(MUSHAF);
    expect(page.lines).toHaveLength(3);
    expect(page.lines[0]).toMatchObject({ type: 'surah_name', surah: 1, words: [] });
    expect(page.lines[1]?.words).toHaveLength(2);
  });

  it('maps a word to its line ordinal', () => {
    expect(layout(...rows).locate(wordKey(1, 1, 4))).toEqual({
      mushafId: MUSHAF,
      page: 1,
      lineNumber: 3,
      lineOrdinal: 2,
    });
    expect(layout(...rows).locate(wordKey(1, 1, 9))).toBeNull();
  });

  it('tolerates a payload with no trailing newline', () => {
    expect(LayoutTable.parse('layout:x', 'x', rows.join('\n')).pages).toEqual([1]);
  });

  it('reports a page the pack does not carry', () => {
    expect(() => layout(...rows).page(2)).toThrow(/has no page 2/);
  });

  it.each([
    ['a short row', '1\t1\tayah\t1:1:1'],
    ['an unknown line type', '1\t1\tmarginalia\t\t1:1:1'],
    ['a non-numeric page', 'one\t1\tayah\t\t1:1:1'],
    ['a bad word key', '1\t1\tayah\t\t1:1:0'],
    ['an ayah line with no words', '1\t1\tayah\t\t'],
    ['a heading line carrying words', '1\t1\tsurah_name\t1\t1:1:1'],
  ])('refuses %s', (_label, row) => {
    expect(() => layout(row)).toThrow(PackError);
    expect(() => layout(row)).toThrow(/malformed-payload/);
  });

  it('refuses lines that do not ascend within a page', () => {
    expect(() => layout('1\t2\tayah\t\t1:1:1', '1\t2\tayah\t\t1:1:2')).toThrow(
      /does not follow line 2/,
    );
  });

  it('refuses an empty payload', () => {
    expect(() => LayoutTable.parse('layout:x', 'x', '')).toThrow(/payload is empty/);
  });

  it('refuses a word placed twice', () => {
    const table = layout('1\t1\tayah\t\t1:1:1', '1\t2\tayah\t\t1:1:1');
    expect(() => table.locate(wordKey(1, 1, 1))).toThrow(/places 1:1:1 more than once/);
  });

  it('lists every page an ayah spans, in order', () => {
    const table = layout('1\t8\tayah\t\t1:1:1', '2\t1\tayah\t\t1:1:2');
    expect(table.pagesOf(verseKey(1, 1))).toEqual([1, 2]);
    expect(table.pageOf(verseKey(1, 1))).toBe(1);
    expect(table.pageOf(verseKey(1, 2))).toBeNull();
  });
});

describe('WordTable', () => {
  it('parses text and optional transliteration', () => {
    const table = words('1:1:1\talpha\tbis-mi', '1:1:2\tbeta\t');
    expect(table.size).toBe(2);
    expect(table.get(wordKey(1, 1, 1))).toEqual({
      key: { surah: 1, ayah: 1, wordPosition: 1 },
      text: 'alpha',
      transliteration: 'bis-mi',
    });
    expect(table.get(wordKey(1, 1, 2))?.transliteration).toBeNull();
    expect(table.has(wordKey(1, 1, 3))).toBe(false);
  });

  it('counts words per ayah and lists the ayat it carries', () => {
    const table = words('1:1:1\ta\t', '1:1:2\tb\t', '1:2:1\tc\t');
    expect(table.countFor(verseKey(1, 1))).toBe(2);
    expect(table.countFor(verseKey(1, 3))).toBe(0);
    expect(table.verses()).toEqual([
      { surah: 1, ayah: 1 },
      { surah: 1, ayah: 2 },
    ]);
  });

  it('refuses word positions that skip or repeat', () => {
    expect(() => words('1:1:1\ta\t', '1:1:3\tb\t')).toThrow(/does not follow 1 for 1:1/);
    expect(() => words('1:1:1\ta\t', '1:1:1\tb\t')).toThrow(/duplicate word key/);
  });

  it('refuses malformed rows', () => {
    expect(() => words('1:1:1\ta')).toThrow(/expected 3 tab-separated fields/);
    expect(() => words('1:1\ta\t')).toThrow(/bad word key/);
  });
});

describe('GlossTable', () => {
  it('parses glosses for its declared language', () => {
    const table = GlossTable.parse('wbw:en', 'en', '1:1:1\ten\tIn (the) name\n');
    expect(table.size).toBe(1);
    expect(table.get(wordKey(1, 1, 1))).toBe('In (the) name');
    expect(table.get(wordKey(1, 1, 2))).toBeNull();
  });

  it('refuses rows tagged with another language', () => {
    expect(() => GlossTable.parse('wbw:en', 'en', '1:1:1\tur\tx\n')).toThrow(/is not en/);
  });
});
