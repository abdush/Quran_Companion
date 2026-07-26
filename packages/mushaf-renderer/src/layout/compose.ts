/**
 * Page composition: pack layout data → positioned boxes.
 *
 * This is the single layout implementation both targets render. It is pure and
 * synchronous — no React, no DOM, no I/O — which is what makes a page
 * snapshottable, diffable, and identical on RN and web by construction rather
 * than by review.
 *
 * Text comes only from the verified pack (`pack.words()`); nothing here fetches,
 * derives, or falls back to generated text. A page whose words the pack does
 * not carry is an error, not a page with gaps.
 *
 * Line fitting:
 *
 * - **`fit`** (default, and what the muṣḥaf actually does): the QPC per-page
 *   fonts are cut so that each line fills the text column exactly. The line's
 *   font size is scaled so the measured run fills the column — measurement
 *   error becomes a small proportional size change, never an overflow.
 * - **`space`**: keep the nominal font size and widen the gaps. Right for a
 *   fallback font that was not designed to fill the line, and for debugging.
 * - Either way a line that falls short of the column by more than
 *   `metrics.maxStretch` is **centred at nominal size**, because that is what
 *   the muṣḥaf does with the last line of a surah.
 */

import type { LayoutLine, QuranPack, VerseKey, WordKey } from '@qc/quran-core';
import { formatWordKey } from '@qc/quran-core';

import {
  MADANI_604_METRICS,
  contentWidth,
  lineBox,
  metricsForPage,
  pageBox,
  type PageMetrics,
} from './metrics.js';
import { DEFAULT_MEASURER, type TextMeasurer } from './measure.js';
import { toArabicIndicDigits } from './numerals.js';
import type {
  ComposedAyahMarker,
  ComposedElement,
  ComposedHeading,
  ComposedLine,
  ComposedWord,
  LineFit,
  PageComposition,
  Rect,
} from './types.js';

export class MushafRenderError extends Error {
  override readonly name = 'MushafRenderError';
}

/** Resolves the font family a page's text should be set in. */
export interface PageFontResolver {
  fontFamilyFor(page: number): string;
}

/** Optional strings the host can supply for lines the pack has no text for. */
export interface PageLabels {
  /** Surah name for a `surah_name` line; `null` renders an empty frame. */
  surahName?(surah: number): string | null;
  /** Text for a `basmallah` line; `null` renders an empty frame. */
  basmallah?(surah: number): string | null;
}

export interface ComposePageOptions {
  readonly page: number;
  /** Which layout to use; defaults to the pack's only one. */
  readonly mushafId?: string;
  readonly metrics?: PageMetrics;
  readonly measurer?: TextMeasurer;
  readonly fonts?: PageFontResolver;
  readonly labels?: PageLabels;
  /** Line fitting strategy. Default `fit`. */
  readonly fitting?: 'fit' | 'space';
  /** Compose the end-of-ayah symbol after each ayah's last word. Default `true`. */
  readonly ayahMarkers?: boolean;
}

/** Used when no font provider is supplied — e.g. in tests and the harness. */
export const FALLBACK_FONT_FAMILY = 'qc-uthmani-fallback';

const FALLBACK_FONTS: PageFontResolver = { fontFamilyFor: () => FALLBACK_FONT_FAMILY };

/** `Omit` over a union distributes badly, so the three shapes are spelled out. */
type UnplacedElement =
  | Omit<ComposedWord, 'box'>
  | Omit<ComposedAyahMarker, 'box'>
  | Omit<ComposedHeading, 'box'>;

interface Unplaced {
  readonly element: UnplacedElement;
  readonly width: number;
  readonly fontSize: number;
}

function isLastWordOfAyah(pack: QuranPack, key: WordKey): boolean {
  const verse: VerseKey = { surah: key.surah, ayah: key.ayah };
  const count = pack.words().countFor(verse);
  return count > 0 && key.wordPosition === count;
}

function wordText(pack: QuranPack, key: WordKey): string {
  const entry = pack.words().get(key);
  if (entry === null) {
    throw new MushafRenderError(
      `pack ${pack.packId} has no text for ${formatWordKey(key)} — a page can only be ` +
        'composed from words the pack carries',
    );
  }
  return entry.text;
}

function unplacedForAyahLine(
  pack: QuranPack,
  line: LayoutLine,
  options: Required<Pick<ComposePageOptions, 'ayahMarkers'>>,
  metrics: PageMetrics,
  measurer: TextMeasurer,
  fontFamily: string,
): Unplaced[] {
  const items: Unplaced[] = [];
  for (const key of line.words) {
    const text = wordText(pack, key);
    items.push({
      element: {
        kind: 'word',
        key,
        text,
        fontFamily,
        fontSize: metrics.fontSize,
      } satisfies Omit<ComposedWord, 'box'>,
      width: measurer.measure(text, metrics.fontSize, fontFamily),
      fontSize: metrics.fontSize,
    });

    if (options.ayahMarkers && isLastWordOfAyah(pack, key)) {
      const label = toArabicIndicDigits(key.ayah);
      items.push({
        element: {
          kind: 'ayah-marker',
          surah: key.surah,
          ayah: key.ayah,
          label,
          fontFamily,
          fontSize: metrics.ayahMarkerFontSize,
        } satisfies Omit<ComposedAyahMarker, 'box'>,
        width: measurer.measure(label, metrics.ayahMarkerFontSize, fontFamily),
        fontSize: metrics.ayahMarkerFontSize,
      });
    }
  }
  return items;
}

function headingElement(
  line: LayoutLine,
  labels: PageLabels,
  fontFamily: string,
  metrics: PageMetrics,
): Omit<ComposedHeading, 'box'> {
  const surah = line.surah as number;
  const label =
    line.type === 'surah_name'
      ? (labels.surahName?.(surah) ?? null)
      : (labels.basmallah?.(surah) ?? null);
  return {
    kind: 'heading',
    type: line.type === 'surah_name' ? 'surah_name' : 'basmallah',
    surah,
    label,
    fontFamily,
    fontSize: metrics.headingFontSize,
  };
}

/**
 * Place `items` right-to-left inside `band`, fitted to the column.
 *
 * Returns the elements with boxes. Each box spans the **full line height** so
 * that a tap anywhere in the line's vertical band hits a word — the muṣḥaf is
 * read line by line and a pixel-tight box would make selection fiddly.
 */
function placeRightToLeft(
  items: readonly Unplaced[],
  band: Rect,
  metrics: PageMetrics,
  fitting: 'fit' | 'space',
): { elements: ComposedElement[]; fit: LineFit } {
  if (items.length === 0) return { elements: [], fit: fitting };

  const gaps = items.length - 1;
  const naturalWidth = items.reduce((total, item) => total + item.width, 0);
  const naturalGap = metrics.wordGap;
  const naturalTotal = naturalWidth + naturalGap * gaps;
  const wanted = naturalTotal === 0 ? 1 : band.width / naturalTotal;

  let scale = 1;
  let gap = naturalGap;
  let fit: LineFit;

  if (wanted > metrics.maxStretch) {
    // A line far short of the column is the last line of a surah, or a framed
    // opening line. The muṣḥaf centres those at normal size; stretching them
    // to the margins would be the single most obvious way to look wrong.
    fit = 'center';
  } else if (fitting === 'fit' || wanted < 1) {
    // Scale the whole run — font size included — so it fills the column exactly.
    // Scaling down also happens in `space` mode: a line may never overflow.
    scale = wanted;
    gap = naturalGap * scale;
    fit = 'fit';
  } else if (gaps > 0) {
    gap = naturalGap + (band.width - naturalTotal) / gaps;
    fit = 'space';
  } else {
    fit = 'center';
  }

  const widths = items.map((item) => item.width * scale);
  const used = widths.reduce((total, width) => total + width, 0) + gap * gaps;
  let cursor = band.x + band.width - (fit === 'center' ? (band.width - used) / 2 : 0);

  const elements: ComposedElement[] = [];
  items.forEach((item, index) => {
    const width = widths[index] as number;
    const box: Rect = { x: cursor - width, y: band.y, width, height: band.height };
    elements.push({
      ...item.element,
      fontSize: item.fontSize * scale,
      box,
    } as ComposedElement);
    cursor = box.x - gap;
  });

  return { elements, fit };
}

function placeHeading(
  element: Omit<ComposedHeading, 'box'>,
  band: Rect,
  metrics: PageMetrics,
): ComposedHeading {
  const width = band.width * metrics.headingWidthRatio;
  return {
    ...element,
    box: { x: band.x + (band.width - width) / 2, y: band.y, width, height: band.height },
  };
}

/**
 * Compose one page of a muṣḥaf.
 *
 * @throws {MushafRenderError} if the pack does not carry text for a word the
 *   layout places on this page — silently rendering a gap would be worse.
 */
export function composePage(pack: QuranPack, options: ComposePageOptions): PageComposition {
  // Framed opening pages have their own text block; everything else is uniform.
  const metrics = metricsForPage(options.metrics ?? MADANI_604_METRICS, options.page);
  const measurer = options.measurer ?? DEFAULT_MEASURER;
  const fonts = options.fonts ?? FALLBACK_FONTS;
  const labels = options.labels ?? {};
  const fitting = options.fitting ?? 'fit';
  const ayahMarkers = options.ayahMarkers ?? true;

  const layout = pack.layout(options.mushafId);
  const pageLayout = layout.page(options.page);
  const fontFamily = fonts.fontFamilyFor(options.page);
  const column = contentWidth(metrics);
  if (column <= 0) {
    throw new MushafRenderError(`page metrics leave no room for text (width ${column})`);
  }

  const lines: ComposedLine[] = [];
  const words: ComposedWord[] = [];

  pageLayout.lines.forEach((line, index) => {
    const band = lineBox(metrics, index, pageLayout.lines.length);

    if (line.type === 'ayah') {
      const items = unplacedForAyahLine(
        pack,
        line,
        { ayahMarkers },
        metrics,
        measurer,
        fontFamily,
      );
      const { elements, fit } = placeRightToLeft(items, band, metrics, fitting);
      for (const element of elements) {
        if (element.kind === 'word') words.push(element);
      }
      lines.push({
        lineNumber: line.lineNumber,
        type: line.type,
        surah: null,
        box: band,
        elements,
        fit,
      });
      return;
    }

    const heading = placeHeading(headingElement(line, labels, fontFamily, metrics), band, metrics);
    lines.push({
      lineNumber: line.lineNumber,
      type: line.type,
      surah: line.surah,
      box: band,
      elements: [heading],
      fit: 'fit',
    });
  });

  return {
    mushafId: pageLayout.mushafId,
    page: pageLayout.page,
    box: pageBox(metrics),
    lines,
    words,
    measurer: measurer.id,
    packId: pack.packId,
    packVersion: pack.version,
  };
}

/**
 * A composer with a small cache.
 *
 * Composition is cheap but not free, and a scrolling reader asks for the same
 * page repeatedly. Callers should hold one composer per pack rather than
 * memoising at every call site — the components in this package are pure and
 * hook-free precisely so that caching is a decision made here.
 */
export function createPageComposer(
  pack: QuranPack,
  defaults: Omit<ComposePageOptions, 'page'> = {},
  cacheSize = 8,
): { compose(page: number, overrides?: Omit<ComposePageOptions, 'page'>): PageComposition } {
  const cache = new Map<string, PageComposition>();
  return {
    compose(page, overrides) {
      const options = { ...defaults, ...overrides, page };
      const key = JSON.stringify([
        page,
        options.mushafId ?? null,
        options.fitting ?? null,
        options.ayahMarkers ?? null,
        (options.measurer ?? DEFAULT_MEASURER).id,
        options.metrics ?? null,
        (options.fonts ?? FALLBACK_FONTS).fontFamilyFor(page),
      ]);
      const cached = cache.get(key);
      if (cached !== undefined) {
        // Refresh recency.
        cache.delete(key);
        cache.set(key, cached);
        return cached;
      }
      const composition = composePage(pack, options);
      cache.set(key, composition);
      if (cache.size > cacheSize) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      return composition;
    },
  };
}
