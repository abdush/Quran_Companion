/**
 * Hit-test goldens.
 *
 * The strong one is exhaustive: for **every word the QUL layout places on a
 * sampled page**, the centre of its composed box must map back to exactly that
 * canonical key. That is the round trip the whole interaction layer rests on —
 * if it is wrong, an annotation lands on the wrong word.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import {
  MADANI_604_METRICS,
  boxOfWord,
  centreOf,
  composePage,
  hitTestPage,
  lineAt,
  metricsForPage,
  toDesignUnits,
  wordAt,
} from '../src/index.js';
import type { PageComposition } from '../src/index.js';
import { formatWordKey, type QuranPack } from '@qc/quran-core';
import { SAMPLE_PAGES, samplePack } from './support/pack.js';

let pack: QuranPack;

beforeAll(async () => {
  pack = await samplePack();
});

describe.each(SAMPLE_PAGES)('page %i', (page) => {
  let composition: PageComposition;

  beforeAll(() => {
    composition = composePage(pack, { page });
  });

  it('maps the centre of every word box back to that word', () => {
    for (const word of composition.words) {
      const hit = hitTestPage(composition, centreOf(word.box));
      expect(hit, formatWordKey(word.key)).not.toBeNull();
      expect(formatWordKey(hit!.word.key)).toBe(formatWordKey(word.key));
      expect(hit!.distance).toBe(0);
    }
  });

  it('maps every word key back to the box it was composed into', () => {
    for (const word of composition.words) {
      expect(boxOfWord(composition, word.key)).toEqual(word.box);
    }
  });

  it('agrees with the pack about which words are on the page', () => {
    const placed = pack
      .layout()
      .page(page)
      .lines.flatMap((line) => line.words.map(formatWordKey));
    const hit = composition.words.map((word) => formatWordKey(word.key));
    expect(hit).toEqual(placed);
  });

  it('resolves a tap anywhere in a line band to a word on that line', () => {
    for (const line of composition.lines) {
      if (line.type !== 'ayah') continue;
      const words = line.elements.filter((element) => element.kind === 'word');
      if (words.length === 0) continue;
      const top = { x: centreOf(words[0]!.box).x, y: line.box.y + 1 };
      const bottom = { x: centreOf(words[0]!.box).x, y: line.box.y + line.box.height - 1 };
      expect(formatWordKey(hitTestPage(composition, top)!.word.key)).toBe(
        formatWordKey(words[0]!.key),
      );
      expect(formatWordKey(hitTestPage(composition, bottom)!.word.key)).toBe(
        formatWordKey(words[0]!.key),
      );
    }
  });

  it('holds up under scaling, which is how a target actually calls it', () => {
    const scale = 0.37;
    for (const word of composition.words) {
      const centre = centreOf(word.box);
      const rendered = { x: centre.x * scale, y: centre.y * scale };
      const hit = hitTestPage(composition, rendered, { scale });
      expect(formatWordKey(hit!.word.key), formatWordKey(word.key)).toBe(
        formatWordKey(word.key),
      );
    }
  });
});

describe('near misses', () => {
  let composition: PageComposition;

  beforeAll(() => {
    composition = composePage(pack, { page: 42 });
  });

  it('resolves a gap between two words to the nearer of them', () => {
    const line = composition.lines.find((candidate) => candidate.type === 'ayah')!;
    const words = line.elements.filter((element) => element.kind === 'word');
    const right = words[0]!;
    const left = words[1]!;
    const gapCentre = {
      x: (left.box.x + left.box.width + right.box.x) / 2,
      y: centreOf(right.box).y,
    };
    const hit = hitTestPage(composition, gapCentre);
    expect(hit).not.toBeNull();
    expect([formatWordKey(right.key), formatWordKey(left.key)]).toContain(
      formatWordKey(hit!.word.key),
    );
    expect(hit!.distance).toBeGreaterThanOrEqual(0);
  });

  it('never returns an ayah marker — it has no word position to return', () => {
    const marker = composition.lines
      .flatMap((line) => line.elements)
      .find((element) => element.kind === 'ayah-marker');
    expect(marker).toBeDefined();
    const hit = hitTestPage(composition, centreOf(marker!.box));
    // The tap resolves to a neighbouring word, or to nothing — never a marker.
    expect(hit === null || hit.word.kind === 'word').toBe(true);
  });

  it('returns nothing in the top margin', () => {
    expect(hitTestPage(composition, { x: 500, y: 2 })).toBeNull();
  });

  it('returns nothing on a heading line', () => {
    const heading = composePage(pack, { page: 2 }).lines.find(
      (line) => line.type === 'surah_name',
    )!;
    const page2 = composePage(pack, { page: 2 });
    expect(hitTestPage(page2, centreOf(heading.box))).toBeNull();
  });

  it('wordAt is strict where hitTestPage is forgiving', () => {
    const word = composition.words[3]!;
    const justOutside = { x: word.box.x - 4, y: centreOf(word.box).y };
    expect(wordAt(composition, justOutside)).toBeNull();
    expect(hitTestPage(composition, justOutside)).not.toBeNull();
  });

  it('honours an explicit tolerance', () => {
    const word = composition.words[3]!;
    const inTheMargin = { x: 4, y: centreOf(word.box).y };
    expect(hitTestPage(composition, inTheMargin)).toBeNull();
    expect(hitTestPage(composition, inTheMargin, { tolerance: 1000 })).not.toBeNull();
  });
});

describe('geometry helpers', () => {
  it('finds the line a y coordinate falls in', async () => {
    const composition = composePage(pack, { page: 42 });
    const metrics = metricsForPage(MADANI_604_METRICS, 42);
    const line = composition.lines[4]!;
    expect(lineAt(composition, line.box.y + line.box.height / 2)?.lineNumber).toBe(
      line.lineNumber,
    );
    expect(lineAt(composition, metrics.height + 500, 10)).toBeNull();
  });

  it('converts rendered points to design units', () => {
    expect(toDesignUnits({ x: 50, y: 100 }, 0.5)).toEqual({ x: 100, y: 200 });
  });

  it('reports null for a word that is not on the page', () => {
    const composition = composePage(pack, { page: 42 });
    expect(boxOfWord(composition, { surah: 1, ayah: 1, wordPosition: 1 })).toBeNull();
  });
});
