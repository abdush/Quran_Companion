/**
 * Normalisation is exercised on ordinary Arabic vocabulary, not on Quran text:
 * the package must not carry scripture in its own source (rule R2 / D-003). The
 * one check that has to run against real muṣḥaf text takes it from the verified
 * fixture pack, which is where Quran text is allowed to come from.
 */

import { describe, expect, it } from 'vitest';

import {
  EXACT,
  SEARCH_FOLD,
  compareNormalized,
  equalsForSearch,
  equalsIgnoringTashkil,
  foldForSearch,
  hasTashkil,
  normalizeArabic,
  openPack,
  splitWords,
  stripTashkil,
  wordKey,
} from '../src/index.js';
import { fixturePackBytes, fixtureTrust } from './support/fixture.js';

// Vocalised / bare pairs of everyday words.
const KITAB = { vowelled: 'كِتَابٌ', bare: 'كتاب' };
const MADRASA = { vowelled: 'مَدْرَسَةٌ', bare: 'مدرسة' };
const AHMAD = { vowelled: 'أَحْمَد', bare: 'أحمد' };

describe('stripTashkil', () => {
  it('removes harakāt, tanwīn, shadda and sukūn but keeps letters', () => {
    expect(stripTashkil(KITAB.vowelled)).toBe(KITAB.bare);
    expect(stripTashkil(MADRASA.vowelled)).toBe(MADRASA.bare);
    expect(stripTashkil('مُحَمَّدٌ')).toBe('محمد');
  });

  it('removes the superscript alef (U+0670)', () => {
    expect(stripTashkil('هَـٰذَا')).toBe('هذا');
  });

  it('removes tatweel, which is justification and not a letter', () => {
    expect(stripTashkil('كــتاب')).toBe(KITAB.bare);
  });

  it('removes Quranic annotation and structural signs', () => {
    // U+06D6 small high ligature (waqf), U+06DD end-of-ayah, U+06DE rub-el-hizb.
    expect(stripTashkil('كتابۖ')).toBe(KITAB.bare);
    expect(stripTashkil('۝كتاب۞')).toBe(KITAB.bare);
  });

  it('leaves letter identity alone — alef carriers survive', () => {
    expect(stripTashkil(AHMAD.vowelled)).toBe(AHMAD.bare);
    expect(stripTashkil(AHMAD.vowelled)).not.toBe('احمد');
  });

  it('collapses whitespace runs and trims', () => {
    expect(stripTashkil('  كتاب   مدرسة \n')).toBe('كتاب مدرسة');
  });
});

describe('foldForSearch', () => {
  it('folds alef carriers onto bare alef', () => {
    expect(foldForSearch(AHMAD.vowelled)).toBe('احمد');
    expect(foldForSearch('إسلام')).toBe('اسلام');
    expect(foldForSearch('آمن')).toBe('امن');
    expect(foldForSearch('ٱلحمد')).toBe('الحمد');
  });

  it('folds alef maqṣūra onto yāʾ and tāʾ marbūṭa onto hāʾ', () => {
    expect(foldForSearch('عَلَى')).toBe('علي');
    expect(foldForSearch(MADRASA.vowelled)).toBe('مدرسه');
  });

  it('is lossy on purpose: it is for search boxes, not correctness checks', () => {
    expect(equalsForSearch('مدرسة', 'مدرسه')).toBe(true);
    expect(equalsIgnoringTashkil('مدرسة', 'مدرسه')).toBe(false);
  });
});

describe('normalizeArabic options', () => {
  it('EXACT changes nothing at all', () => {
    const raw = '  كِتَابٌۖ  ';
    expect(normalizeArabic(raw, EXACT)).toBe(raw);
  });

  it('layers are independently switchable', () => {
    expect(normalizeArabic(AHMAD.vowelled, { removeTashkil: false, unifyAlef: true })).toBe(
      'اَحْمَد',
    );
    expect(normalizeArabic('كــتاب', { removeTatweel: false })).toBe('كــتاب');
  });

  it('NFC composes a decomposed alef-maddah before folding', () => {
    // U+0627 + U+0653 composes to U+0622, which unifyAlef then folds to bare alef.
    expect(normalizeArabic('آمن', SEARCH_FOLD)).toBe('امن');
  });
});

describe('hasTashkil', () => {
  it('detects vocalisation and annotation, not plain letters', () => {
    expect(hasTashkil(KITAB.vowelled)).toBe(true);
    expect(hasTashkil('كتابۖ')).toBe(true);
    expect(hasTashkil(KITAB.bare)).toBe(false);
    expect(hasTashkil('')).toBe(false);
  });
});

describe('compareNormalized', () => {
  it('orders by normalised form, ignoring vocalisation', () => {
    expect(compareNormalized(KITAB.vowelled, KITAB.bare)).toBe(0);
    expect(compareNormalized('ا', 'ب')).toBeLessThan(0);
    expect(compareNormalized('ب', 'ا')).toBeGreaterThan(0);
  });
});

describe('splitWords', () => {
  it('splits on whitespace, which is how word_position is defined', () => {
    expect(splitWords(' كتاب   مدرسة\n')).toEqual(['كتاب', 'مدرسة']);
    expect(splitWords('')).toEqual([]);
  });

  it('does not count the end-of-ayah sign as a word', () => {
    expect(splitWords('كتاب ۝')).toEqual(['كتاب']);
  });
});

describe('against real muṣḥaf text from the pack', () => {
  it('strips tashkīl without touching letter count', async () => {
    const pack = await openPack(fixturePackBytes(), fixtureTrust());
    const entry = pack.words().get(wordKey(2, 255, 1));
    expect(entry).not.toBeNull();

    const text = (entry as { text: string }).text;
    expect(hasTashkil(text)).toBe(true);
    const stripped = stripTashkil(text);
    expect(hasTashkil(stripped)).toBe(false);
    expect(stripped.length).toBeLessThan(text.length);
    // Normalisation must never invent or drop a word.
    expect(splitWords(stripped)).toHaveLength(1);
  });
});
