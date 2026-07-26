/**
 * Composition goldens.
 *
 * The invariants here are the ones a reader would notice being broken: words in
 * the wrong order, a line that overflows the page, a missing ayah marker, a word
 * that the layout places but the composition drops. They are checked against the
 * pack's own QUL layout and QPC word data on the sampled pages (rule R8).
 */

import { beforeAll, describe, expect, it } from 'vitest';

import {
  MADANI_604_METRICS,
  MushafRenderError,
  composePage,
  contentWidth,
  createLetterCountMeasurer,
  metricsForPage,
  createPageComposer,
  toArabicIndicDigits,
} from '../src/index.js';
import type { PageComposition } from '../src/index.js';
import { formatWordKey, type QuranPack } from '@qc/quran-core';
import { SAMPLE_PAGES, samplePack } from './support/pack.js';

const EPSILON = 0.5;

function wordsOfPage(pack: QuranPack, page: number): string[] {
  return pack
    .layout()
    .page(page)
    .lines.flatMap((line) => line.words.map(formatWordKey));
}

describe.each(SAMPLE_PAGES)('page %i', (page) => {
  let pack: QuranPack;
  let composition: PageComposition;

  beforeAll(async () => {
    pack = await samplePack();
    composition = composePage(pack, { page });
  });

  it('composes exactly the words the layout places, in reading order', () => {
    expect(composition.words.map((word) => formatWordKey(word.key))).toEqual(
      wordsOfPage(pack, page),
    );
  });

  it('takes every word text from the pack, unmodified', () => {
    const words = pack.words();
    for (const word of composition.words) {
      expect(word.text).toBe(words.get(word.key)?.text);
    }
  });

  it('has one composed line per typeset line, numbered as the pack numbers them', () => {
    const lines = pack.layout().page(page).lines;
    expect(composition.lines).toHaveLength(lines.length);
    expect(composition.lines.map((line) => line.lineNumber)).toEqual(
      lines.map((line) => line.lineNumber),
    );
    expect(composition.lines.map((line) => line.type)).toEqual(lines.map((line) => line.type));
  });

  it('keeps every box inside the page', () => {
    for (const line of composition.lines) {
      for (const element of line.elements) {
        expect(element.box.x).toBeGreaterThanOrEqual(-EPSILON);
        expect(element.box.y).toBeGreaterThanOrEqual(-EPSILON);
        expect(element.box.x + element.box.width).toBeLessThanOrEqual(
          composition.box.width + EPSILON,
        );
        expect(element.box.y + element.box.height).toBeLessThanOrEqual(
          composition.box.height + EPSILON,
        );
      }
    }
  });

  it('lays out right to left, without overlaps', () => {
    for (const line of composition.lines) {
      const boxes = line.elements.map((element) => element.box);
      for (let index = 1; index < boxes.length; index += 1) {
        const previous = boxes[index - 1] as { x: number };
        const current = boxes[index] as { x: number; width: number };
        // Each element starts to the left of the previous one and does not touch it.
        expect(current.x + current.width).toBeLessThanOrEqual(previous.x + EPSILON);
      }
    }
  });

  it('fills the text column on every justified ayah line', () => {
    const metrics = metricsForPage(MADANI_604_METRICS, page);
    const column = contentWidth(metrics);
    for (const line of composition.lines) {
      if (line.type !== 'ayah' || line.fit === 'center') continue;
      const boxes = line.elements.map((element) => element.box);
      const right = Math.max(...boxes.map((box) => box.x + box.width));
      const left = Math.min(...boxes.map((box) => box.x));
      expect(right - left, `line ${line.lineNumber}`).toBeCloseTo(column, 1);
      expect(right, `line ${line.lineNumber}`).toBeCloseTo(metrics.marginInline + column, 1);
    }
  });

  it('centres a short line instead of stretching it to the margins', () => {
    const metrics = metricsForPage(MADANI_604_METRICS, page);
    for (const line of composition.lines) {
      if (line.type !== 'ayah' || line.fit !== 'center') continue;
      const boxes = line.elements.map((element) => element.box);
      const right = Math.max(...boxes.map((box) => box.x + box.width));
      const left = Math.min(...boxes.map((box) => box.x));
      expect((left + right) / 2, `line ${line.lineNumber}`).toBeCloseTo(metrics.width / 2, 1);
      for (const element of line.elements) {
        if (element.kind === 'word') expect(element.fontSize).toBe(metrics.fontSize);
      }
    }
  });

  it('stacks lines top to bottom with no gaps and no overlap', () => {
    for (let index = 1; index < composition.lines.length; index += 1) {
      const previous = composition.lines[index - 1]!.box;
      const current = composition.lines[index]!.box;
      expect(current.y).toBeCloseTo(previous.y + previous.height, 5);
    }
  });

  it('marks the end of every ayah that finishes on the page', () => {
    const words = pack.words();
    const expected = composition.words
      .filter((word) => words.countFor(word.key) === word.key.wordPosition)
      .map((word) => `${word.key.surah}:${word.key.ayah}`);

    const markers = composition.lines
      .flatMap((line) => line.elements)
      .filter((element) => element.kind === 'ayah-marker')
      .map((element) => `${element.surah}:${element.ayah}`);

    expect(markers).toEqual(expected);
  });

  it('labels ayah markers with Arabic-Indic numerals', () => {
    for (const line of composition.lines) {
      for (const element of line.elements) {
        if (element.kind !== 'ayah-marker') continue;
        expect(element.label).toBe(toArabicIndicDigits(element.ayah));
      }
    }
  });

  it('records its provenance', () => {
    expect(composition.mushafId).toBe('qpc-hafs-madani-604');
    expect(composition.page).toBe(page);
    expect(composition.packId).toBe('sample-hafs');
    expect(composition.measurer).toBe('letter-count/default');
  });
});

describe('heading lines', () => {
  it('centres a surah-name line and leaves it empty when no label is supplied', async () => {
    const pack = await samplePack();
    const composition = composePage(pack, { page: 1 });
    const heading = composition.lines[0]?.elements[0];
    expect(composition.lines[0]?.type).toBe('surah_name');
    expect(heading?.kind).toBe('heading');
    expect(heading?.kind === 'heading' && heading.label).toBeNull();
    const centre = (heading?.box.x ?? 0) + (heading?.box.width ?? 0) / 2;
    expect(centre).toBeCloseTo(MADANI_604_METRICS.width / 2, 5);
  });

  it('uses the labels the host supplies', async () => {
    const pack = await samplePack();
    const composition = composePage(pack, {
      page: 2,
      labels: { surahName: (surah) => `Surah ${surah}`, basmallah: () => 'bismillah' },
    });
    const labels = composition.lines
      .flatMap((line) => line.elements)
      .filter((element) => element.kind === 'heading')
      .map((element) => element.label);
    expect(labels).toEqual(['Surah 2', 'bismillah']);
  });
});

describe('options', () => {
  it('can compose without ayah markers', async () => {
    const pack = await samplePack();
    const composition = composePage(pack, { page: 42, ayahMarkers: false });
    const kinds = new Set(
      composition.lines.flatMap((line) => line.elements).map((element) => element.kind),
    );
    expect(kinds.has('ayah-marker')).toBe(false);
  });

  it('space fitting keeps the nominal font size, fit fitting scales it', async () => {
    const pack = await samplePack();
    // Page 604 carries short surahs, so it has lines with room to spare —
    // exactly the case the two strategies treat differently.
    const spaced = composePage(pack, { page: 604, fitting: 'space' });
    const fitted = composePage(pack, { page: 604, fitting: 'fit' });

    const spacedLine = spaced.lines.find((line) => line.type === 'ayah' && line.fit === 'space');
    expect(spacedLine, 'page 604 should have at least one space-fitted line').toBeDefined();
    for (const element of spacedLine?.elements ?? []) {
      if (element.kind === 'word') expect(element.fontSize).toBe(MADANI_604_METRICS.fontSize);
    }

    const fittedLine = fitted.lines.find(
      (line) => line.type === 'ayah' && line.lineNumber === spacedLine?.lineNumber,
    );
    expect(fittedLine?.fit).toBe('fit');
    const fittedWord = fittedLine?.elements.find((element) => element.kind === 'word');
    expect(fittedWord?.fontSize).not.toBe(MADANI_604_METRICS.fontSize);
  });

  it('records the measurer it used, so a snapshot cannot silently change basis', async () => {
    const pack = await samplePack();
    const composition = composePage(pack, {
      page: 604,
      measurer: createLetterCountMeasurer({ letterAdvance: 0.4, id: 'narrow' }),
    });
    expect(composition.measurer).toBe('narrow');
  });

  it('refuses to compose a page whose words the pack does not carry', async () => {
    const pack = await samplePack();
    // The sample pack ships layout for all 604 pages but text only for the
    // sampled ones; composing page 3 must fail loudly rather than render gaps.
    expect(() => composePage(pack, { page: 3 })).toThrow(MushafRenderError);
    expect(() => composePage(pack, { page: 3 })).toThrow(/has no text for/);
  });
});

describe('createPageComposer', () => {
  it('returns the identical composition for a repeated page', async () => {
    const composer = createPageComposer(await samplePack());
    expect(composer.compose(42)).toBe(composer.compose(42));
  });

  it('recomposes when an option changes', async () => {
    const composer = createPageComposer(await samplePack());
    expect(composer.compose(42)).not.toBe(composer.compose(42, { ayahMarkers: false }));
  });

  it('evicts beyond its capacity', async () => {
    const composer = createPageComposer(await samplePack(), {}, 1);
    const first = composer.compose(42);
    composer.compose(604);
    expect(composer.compose(42)).not.toBe(first);
  });
});
