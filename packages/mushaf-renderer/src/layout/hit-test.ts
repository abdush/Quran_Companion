/**
 * Hit-testing a composed page: a point on screen → a canonical word key.
 *
 * This is the inverse of composition and the foundation every interaction is
 * built on later (tap to annotate, drag to select, tap to play). It is written
 * now, with the static renderer, because it is a property of the *layout*, not
 * of the interaction — and because it is checkable against the pack's word data
 * without any UI at all.
 *
 * Two behaviours worth stating:
 *
 * - **Vertical bands win first.** A word's box spans the whole line height, so
 *   a tap anywhere in a line's band lands on that line. Reading is line-wise;
 *   the eye and the thumb both work that way.
 * - **Gaps resolve to the nearest word on the line**, within a tolerance. A tap
 *   between two words is not a miss, and an end-of-ayah symbol is not a target:
 *   it has no `word_position`, so it can never be the answer.
 */

import type { ComposedLine, ComposedWord, PageComposition, Point, Rect } from './types.js';
import { formatWordKey, type WordKey } from '@qc/quran-core';

export interface HitTestOptions {
  /**
   * Rendered width ÷ composition width. Pass the scale the target rendered at
   * and give `point` in rendered units; leave it out for design units.
   */
  readonly scale?: number;
  /**
   * How far outside a word box a point may fall and still hit it, in design
   * units. Defaults to one nominal word gap.
   */
  readonly tolerance?: number;
}

export interface WordHit {
  readonly word: ComposedWord;
  readonly line: ComposedLine;
  /** 0 when the point is inside the word box, otherwise its distance from it. */
  readonly distance: number;
}

const DEFAULT_TOLERANCE = 40;

function contains(box: Rect, point: Point): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

function horizontalDistance(box: Rect, x: number): number {
  if (x < box.x) return box.x - x;
  if (x > box.x + box.width) return x - (box.x + box.width);
  return 0;
}

function verticalDistance(box: Rect, y: number): number {
  if (y < box.y) return box.y - y;
  if (y > box.y + box.height) return y - (box.y + box.height);
  return 0;
}

/** Convert a point in rendered units to the composition's design units. */
export function toDesignUnits(point: Point, scale: number): Point {
  return { x: point.x / scale, y: point.y / scale };
}

/** The line whose band contains `y`, or the nearest one within `tolerance`. */
export function lineAt(
  composition: PageComposition,
  y: number,
  tolerance = DEFAULT_TOLERANCE,
): ComposedLine | null {
  let nearest: { line: ComposedLine; distance: number } | null = null;
  for (const line of composition.lines) {
    const distance = verticalDistance(line.box, y);
    if (distance === 0) return line;
    if (nearest === null || distance < nearest.distance) nearest = { line, distance };
  }
  return nearest !== null && nearest.distance <= tolerance ? nearest.line : null;
}

/**
 * The word under `point`, or the nearest word on the same line within the
 * tolerance. Returns `null` for a point that is not near any word — a heading
 * line, or a margin.
 */
export function hitTestPage(
  composition: PageComposition,
  point: Point,
  options: HitTestOptions = {},
): WordHit | null {
  const scale = options.scale ?? 1;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const target = scale === 1 ? point : toDesignUnits(point, scale);

  const line = lineAt(composition, target.y, tolerance);
  if (line === null) return null;

  let nearest: WordHit | null = null;
  for (const element of line.elements) {
    if (element.kind !== 'word') continue;
    if (contains(element.box, target)) return { word: element, line, distance: 0 };
    const distance = horizontalDistance(element.box, target.x);
    if (nearest === null || distance < nearest.distance) {
      nearest = { word: element, line, distance };
    }
  }

  if (nearest === null || nearest.distance > tolerance) return null;
  return nearest;
}

/** Strict containment — no nearest-neighbour forgiveness. */
export function wordAt(
  composition: PageComposition,
  point: Point,
  options: Pick<HitTestOptions, 'scale'> = {},
): ComposedWord | null {
  const hit = hitTestPage(composition, point, { ...options, tolerance: 0 });
  return hit !== null && hit.distance === 0 ? hit.word : null;
}

/** Where a word key sits on this page, for highlights and scroll-into-view. */
export function boxOfWord(composition: PageComposition, key: WordKey): Rect | null {
  const wanted = formatWordKey(key);
  for (const word of composition.words) {
    if (formatWordKey(word.key) === wanted) return word.box;
  }
  return null;
}

/** The centre of a word box — the anchor a popover or caret should point at. */
export function centreOf(box: Rect): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
