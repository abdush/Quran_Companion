/**
 * Page metrics: the fixed geometry of a muṣḥaf page, in design units.
 *
 * Design units, not pixels. A page is composed once at a nominal size and the
 * target scales the whole box to the viewport, so composition results are
 * resolution independent and a snapshot does not change when a phone does.
 *
 * The proportions follow the KFGQPC Madani 604 print: a tall text block with
 * generous side margins, 15 lines on a standard page and 8 on the two framed
 * opening pages (that line count comes from the pack's layout data, not from
 * here — these metrics only say how tall a line is once the count is known).
 */

import type { Rect, Size } from './types.js';

export interface PageMetrics {
  /** Page box in design units. */
  readonly width: number;
  readonly height: number;
  readonly marginTop: number;
  readonly marginBottom: number;
  /** Left and right margin — equal, the muṣḥaf text block is centred. */
  readonly marginInline: number;
  /** Nominal size of ayah text. */
  readonly fontSize: number;
  /** Nominal size of a surah-name / basmallah heading. */
  readonly headingFontSize: number;
  /** Nominal size of the end-of-ayah symbol. */
  readonly ayahMarkerFontSize: number;
  /** Minimum gap between adjacent elements on a line, before fitting. */
  readonly wordGap: number;
  /** Fraction of the text column a heading may occupy (it is centred). */
  readonly headingWidthRatio: number;
  /**
   * Pages set inside an ornamental frame — the opening spread of the Madani
   * muṣḥaf. They carry fewer lines in a visibly narrower text block, so they
   * get their own margins rather than a stretched version of a normal page.
   */
  readonly framedPages: readonly number[];
  readonly framedMarginInline: number;
  readonly framedMarginBlock: number;
  /**
   * How far a short line may be stretched to fill the column before it is
   * centred at nominal size instead. The muṣḥaf does not justify the last line
   * of a surah; without this cap a two-word line would be blown up to fill the
   * page (§6.3 fidelity, not a rendering nicety).
   */
  readonly maxStretch: number;
}

/**
 * Default metrics for `qpc-hafs-madani-604`. The numbers are a proportional
 * model of the print, not a measurement of it: 1000 units wide keeps the
 * arithmetic legible in snapshots, and the 1.55 aspect ratio matches the page.
 */
export const MADANI_604_METRICS: PageMetrics = Object.freeze({
  width: 1000,
  height: 1550,
  marginTop: 90,
  marginBottom: 90,
  marginInline: 80,
  fontSize: 46,
  headingFontSize: 40,
  ayahMarkerFontSize: 34,
  wordGap: 14,
  headingWidthRatio: 0.72,
  framedPages: [1, 2],
  framedMarginInline: 230,
  framedMarginBlock: 300,
  maxStretch: 1.25,
});

/**
 * Metrics as they apply to one page. Only the framed opening pages differ, and
 * they differ in the text block, not in the type size.
 */
export function metricsForPage(metrics: PageMetrics, page: number): PageMetrics {
  if (!metrics.framedPages.includes(page)) return metrics;
  return {
    ...metrics,
    marginInline: metrics.framedMarginInline,
    marginTop: metrics.framedMarginBlock,
    marginBottom: metrics.framedMarginBlock,
  };
}

export function pageBox(metrics: PageMetrics): Size {
  return { width: metrics.width, height: metrics.height };
}

/** Width available to text once the margins are taken out. */
export function contentWidth(metrics: PageMetrics): number {
  return metrics.width - 2 * metrics.marginInline;
}

export function contentHeight(metrics: PageMetrics): number {
  return metrics.height - metrics.marginTop - metrics.marginBottom;
}

/**
 * The band a line occupies. Lines share the text block evenly, which is what
 * the muṣḥaf does: every page of a given kind has the same line pitch.
 */
export function lineBox(metrics: PageMetrics, lineIndex: number, lineCount: number): Rect {
  const height = contentHeight(metrics) / lineCount;
  return {
    x: metrics.marginInline,
    y: metrics.marginTop + lineIndex * height,
    width: contentWidth(metrics),
    height,
  };
}

/**
 * Scale factor from design units to a rendered box, preserving aspect ratio.
 * Both targets use this so a page looks identical at any size.
 */
export function scaleToWidth(metrics: PageMetrics, renderedWidth: number): number {
  return renderedWidth / metrics.width;
}
