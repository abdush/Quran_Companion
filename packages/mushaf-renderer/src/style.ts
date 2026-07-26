/**
 * The arithmetic both targets share.
 *
 * Web and native disagree about almost everything except numbers, so the
 * numbers live here: given a composition and a rendered width, every box and
 * font size is one multiplication away. Keeping it in one place is what makes
 * the two element trees provably the same layout.
 */

import type { PageComposition, Rect } from './layout/types.js';

export interface PixelBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Design units → rendered units. */
export function scaleFor(composition: PageComposition, renderedWidth: number): number {
  return renderedWidth / composition.box.width;
}

/** Rendered height that preserves the page's aspect ratio. */
export function renderedHeight(composition: PageComposition, renderedWidth: number): number {
  return round(composition.box.height * scaleFor(composition, renderedWidth));
}

export function boxStyle(box: Rect, scale: number): PixelBox {
  return {
    left: round(box.x * scale),
    top: round(box.y * scale),
    width: round(box.width * scale),
    height: round(box.height * scale),
  };
}

export function fontSizeFor(fontSize: number, scale: number): number {
  return round(fontSize * scale);
}

/**
 * Two decimals. Sub-hundredth differences are invisible and would make layout
 * snapshots churn on floating-point noise, which is exactly the kind of diff
 * that trains reviewers to stop reading them.
 */
export function round(value: number): number {
  return Math.round(value * 100) / 100;
}
