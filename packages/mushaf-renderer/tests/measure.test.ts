/**
 * Measurement is the one place the layout core approximates, so its behaviour
 * is stated rather than assumed: vocalisation must not change a word's width,
 * and a real metrics table must be able to displace the approximation without
 * touching anything else.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MEASURER,
  createLetterCountMeasurer,
  createTableMeasurer,
  toArabicIndicDigits,
} from '../src/index.js';

describe('letter-count measurer', () => {
  it('ignores tashkīl — combining marks carry no advance', () => {
    const vocalised = DEFAULT_MEASURER.measure('كِتَابٌ', 40);
    const bare = DEFAULT_MEASURER.measure('كتاب', 40);
    expect(vocalised).toBe(bare);
  });

  it('scales linearly with font size and with letters', () => {
    const one = DEFAULT_MEASURER.measure('كتاب', 40);
    expect(DEFAULT_MEASURER.measure('كتاب', 80)).toBeCloseTo(one * 2, 6);
    expect(DEFAULT_MEASURER.measure('كتابكتاب', 40)).toBeGreaterThan(one);
  });

  it('measures nothing as zero', () => {
    expect(DEFAULT_MEASURER.measure('', 40)).toBe(0);
  });

  it('carries an id that identifies the basis of a snapshot', () => {
    expect(DEFAULT_MEASURER.id).toBe('letter-count/default');
    expect(createLetterCountMeasurer({ letterAdvance: 0.4 }).id).toBe('letter-count/0.4/0.18');
  });
});

describe('table measurer', () => {
  const table = new Map([['كتاب', 2]]);

  it('uses the table where it has an entry', () => {
    expect(createTableMeasurer(table).measure('كتاب', 40)).toBe(80);
  });

  it('falls back for anything the table does not know', () => {
    const measurer = createTableMeasurer(table);
    expect(measurer.measure('مدرسة', 40)).toBe(DEFAULT_MEASURER.measure('مدرسة', 40));
  });

  it('takes an id, because it changes every number in a snapshot', () => {
    expect(createTableMeasurer(table, DEFAULT_MEASURER, 'qpc-v1-hmtx').id).toBe('qpc-v1-hmtx');
  });
});

describe('Arabic-Indic numerals', () => {
  it('converts each digit', () => {
    expect(toArabicIndicDigits(0)).toBe('٠');
    expect(toArabicIndicDigits(255)).toBe('٢٥٥');
  });

  it('refuses anything that is not a whole count', () => {
    expect(() => toArabicIndicDigits(-1)).toThrow(RangeError);
    expect(() => toArabicIndicDigits(1.5)).toThrow(RangeError);
  });
});
