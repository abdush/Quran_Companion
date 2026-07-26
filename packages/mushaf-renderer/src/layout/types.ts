/**
 * The geometry vocabulary shared by both targets.
 *
 * A composition is a **pure data description of one muṣḥaf page**: boxes in a
 * design-unit coordinate space, in reading order, with the canonical key of
 * every word. It contains no React, no DOM, no platform types — the web and
 * native adapters are thin functions from this structure to their host
 * primitives, which is what keeps the two targets from drifting apart.
 *
 * Coordinates are **left-based and top-based** on both platforms, even though
 * the script runs right to left: RTL is expressed by *where the boxes are*, not
 * by a writing-direction flag the host might interpret differently. `x` is the
 * distance from the left edge of the page box, so the first word of a line has
 * the largest `x`.
 */

import type { LineType, WordKey } from '@qc/quran-core';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A word of Quran text, addressed by canonical key (§6.1). */
export interface ComposedWord {
  readonly kind: 'word';
  readonly key: WordKey;
  /** Script text exactly as the pack ships it — never generated, never edited. */
  readonly text: string;
  readonly box: Rect;
  /** Font family the target should apply (per-page font, or the fallback). */
  readonly fontFamily: string;
  readonly fontSize: number;
}

/**
 * The end-of-ayah symbol. The muṣḥaf prints it after the last word of an ayah;
 * it is not a word, carries no `word_position`, and is never selectable.
 */
export interface ComposedAyahMarker {
  readonly kind: 'ayah-marker';
  readonly surah: number;
  readonly ayah: number;
  /** The ayah number in Arabic-Indic digits — a numeral, not Quran text. */
  readonly label: string;
  readonly box: Rect;
  readonly fontFamily: string;
  readonly fontSize: number;
}

/**
 * A surah-name or basmallah line. The pack ships the *structure* of these lines
 * but no text for them (the muṣḥaf sets them in a dedicated surah-name font),
 * so `label` is whatever the host supplied — `null` when nothing is available,
 * which the targets render as an empty frame rather than inventing a name.
 */
export interface ComposedHeading {
  readonly kind: 'heading';
  readonly type: Exclude<LineType, 'ayah'>;
  readonly surah: number;
  readonly label: string | null;
  readonly box: Rect;
  readonly fontFamily: string;
  readonly fontSize: number;
}

export type ComposedElement = ComposedWord | ComposedAyahMarker | ComposedHeading;

export type LineFit = 'fit' | 'space' | 'center';

export interface ComposedLine {
  readonly lineNumber: number;
  readonly type: LineType;
  /** The surah a heading line announces; `null` on ayah lines. */
  readonly surah: number | null;
  /** Full-width band of the line — hit-testing uses it to find the line first. */
  readonly box: Rect;
  readonly elements: readonly ComposedElement[];
  /**
   * How the line was fitted to the text column: `fit` scales the whole line,
   * `space` widens the gaps, `center` leaves a short line at nominal size and
   * centres it (the last line of a surah). See `compose.ts`.
   */
  readonly fit: LineFit;
}

export interface PageComposition {
  readonly mushafId: string;
  readonly page: number;
  readonly box: Size;
  readonly lines: readonly ComposedLine[];
  /** Every word on the page in reading order — the hit-test and sync index. */
  readonly words: readonly ComposedWord[];
  /** Provenance, so a snapshot records what produced it. */
  readonly measurer: string;
  readonly packId: string;
  readonly packVersion: string;
}
