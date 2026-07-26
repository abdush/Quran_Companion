/**
 * Text measurement, behind an interface.
 *
 * Composition needs one number per element: its advance width at a given font
 * size. Where that number comes from is a platform decision — a canvas context
 * on web, the font's own `hmtx` table once packs ship fonts, a native text
 * measurement on RN — so the layout core takes a {@link TextMeasurer} and stays
 * pure and synchronous.
 *
 * Every measurer carries an `id`, which is recorded in the composition. A
 * layout snapshot is only meaningful next to the measurer that produced it, and
 * putting the id in the data makes a swapped measurer visible in the diff
 * instead of silently rewriting every number.
 *
 * The default is deliberately crude and deliberately deterministic: Arabic
 * combining marks carry no advance, so the width of a word is driven by its
 * *base letters*. `stripTashkil` from `@qc/quran-core` is exactly that count,
 * which makes {@link createLetterCountMeasurer} a usable stand-in until real
 * font metrics arrive — and identical on every platform, which is what the
 * goldens need.
 */

import { stripTashkil } from '@qc/quran-core';

export interface TextMeasurer {
  /** Stable identity, recorded in `PageComposition.measurer`. */
  readonly id: string;
  /** Advance width of `text` at `fontSize`, in the same units as the metrics. */
  measure(text: string, fontSize: number, fontFamily?: string): number;
}

export interface LetterCountMeasurerOptions {
  /** Advance of one base letter, as a fraction of the font size. */
  readonly letterAdvance?: number;
  /** Advance a word gets on top of its letters (final-form flourish, kerning). */
  readonly wordPadding?: number;
  readonly id?: string;
}

/**
 * Width ≈ (base letters × letterAdvance + wordPadding) × fontSize.
 *
 * Base letters are counted after `stripTashkil`, so vocalisation does not
 * inflate a word's width the way a naive `text.length` would.
 */
export function createLetterCountMeasurer(
  options: LetterCountMeasurerOptions = {},
): TextMeasurer {
  const letterAdvance = options.letterAdvance ?? 0.52;
  const wordPadding = options.wordPadding ?? 0.18;
  return {
    id: options.id ?? `letter-count/${letterAdvance}/${wordPadding}`,
    measure(text, fontSize) {
      const letters = [...stripTashkil(text)].length;
      if (letters === 0) return 0;
      return (letters * letterAdvance + wordPadding) * fontSize;
    },
  };
}

/** The measurer used when a caller supplies none, and by the layout goldens. */
export const DEFAULT_MEASURER: TextMeasurer = createLetterCountMeasurer({
  id: 'letter-count/default',
});

/**
 * Measure from a table of advance widths (em units per string), falling back to
 * `fallback` for anything absent. This is the shape real font metrics take:
 * once a pack ships the QPC per-page fonts, the font pipeline can emit a table
 * of per-glyph advances and layout becomes exact without touching this module.
 */
export function createTableMeasurer(
  table: ReadonlyMap<string, number>,
  fallback: TextMeasurer = DEFAULT_MEASURER,
  id = 'table',
): TextMeasurer {
  return {
    id,
    measure(text, fontSize, fontFamily) {
      const advance = table.get(text);
      return advance === undefined
        ? fallback.measure(text, fontSize, fontFamily)
        : advance * fontSize;
    },
  };
}
