/**
 * `src/metadata.ts` is the TypeScript mirror of
 * `shared/py/qc_shared/quran/metadata.py`. These assertions pin the values that
 * make a divergence visible; the layout goldens then prove that real pack data
 * reproduces them.
 */

import { describe, expect, it } from 'vitest';

import {
  MADANI_604_MUSHAF_ID,
  MADANI_604_PAGE_COUNT,
  SURAHS_WITHOUT_STANDALONE_BASMALLAH,
  SURAH_COUNT,
  TOTAL_AYAHS,
  ayahCount,
  isSurah,
  madani604LinesOnPage,
} from '../src/index.js';

describe('corpus shape', () => {
  it('holds the Ḥafṣ division', () => {
    expect(SURAH_COUNT).toBe(114);
    expect(TOTAL_AYAHS).toBe(6236);
    let total = 0;
    for (let surah = 1; surah <= SURAH_COUNT; surah += 1) total += ayahCount(surah);
    expect(total).toBe(TOTAL_AYAHS);
  });

  it('knows the well-known ayah counts', () => {
    expect(ayahCount(1)).toBe(7);
    expect(ayahCount(2)).toBe(286);
    expect(ayahCount(9)).toBe(129);
    expect(ayahCount(114)).toBe(6);
  });

  it('rejects surahs outside 1..114', () => {
    expect(isSurah(0)).toBe(false);
    expect(isSurah(115)).toBe(false);
    expect(isSurah(1.5)).toBe(false);
    expect(() => ayahCount(0)).toThrow(RangeError);
  });

  it('names the edition Phase 0 ships', () => {
    expect(MADANI_604_MUSHAF_ID).toBe('qpc-hafs-madani-604');
    expect(MADANI_604_PAGE_COUNT).toBe(604);
  });

  it('gives the framed opening pages 8 lines and the rest 15', () => {
    expect(madani604LinesOnPage(1)).toBe(8);
    expect(madani604LinesOnPage(2)).toBe(8);
    expect(madani604LinesOnPage(3)).toBe(15);
    expect(madani604LinesOnPage(604)).toBe(15);
    expect(() => madani604LinesOnPage(605)).toThrow(RangeError);
  });

  it('exempts al-Fātiḥa and at-Tawba from the standalone basmallah', () => {
    expect([...SURAHS_WITHOUT_STANDALONE_BASMALLAH].sort()).toEqual([1, 9]);
  });
});
