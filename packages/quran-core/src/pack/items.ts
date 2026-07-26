/**
 * Dataset item ids and what they mean to a reader.
 *
 * The manifest schema defines an item id as `kind:name` and says nothing about
 * file names — the reader deliberately never depends on one: payloads are
 * matched to items by SHA-256 (see `reader.ts`), so a pack can rename its files
 * without breaking clients, and a renamed file cannot smuggle in content.
 *
 * What *is* needed is the payload's format, and that follows from the kind:
 *
 * | kind     | role       | name means      | format                                    |
 * |----------|------------|-----------------|-------------------------------------------|
 * | `layout` | layout     | `mushaf_id`     | `page⇥line⇥type⇥surah⇥word-keys`           |
 * | `wbw`    | glosses    | language code   | `word_key⇥language⇥gloss`                  |
 * | `text`   | words      | script edition  | `word_key⇥text⇥transliteration`            |
 * | `text`   | verse text | script edition  | `surah|ayah|text`, exposed as raw bytes    |
 *
 * The two `text` roles are told apart by an explicit allow-list of word-level
 * editions rather than by sniffing, so adding an edition is a deliberate act.
 */

import { PackError } from '../errors.js';

export interface ParsedItemId {
  readonly raw: string;
  readonly kind: string;
  readonly name: string;
}

export type ItemRole = 'layout' | 'glosses' | 'words' | 'verse-text' | 'opaque';

/** Item ids whose payload is the word-level text table (`word_position` order). */
export const DEFAULT_WORD_ITEMS: readonly string[] = ['text:qpc-hafs'];

export function parseItemId(raw: string): ParsedItemId {
  const separator = raw.indexOf(':');
  if (separator <= 0 || separator === raw.length - 1) {
    throw new PackError('unknown-item', `not an item id 'kind:name': ${JSON.stringify(raw)}`);
  }
  return { raw, kind: raw.slice(0, separator), name: raw.slice(separator + 1) };
}

export function roleOf(item: string, wordItems: readonly string[] = DEFAULT_WORD_ITEMS): ItemRole {
  const { kind } = parseItemId(item);
  switch (kind) {
    case 'layout':
      return 'layout';
    case 'wbw':
      return 'glosses';
    case 'text':
      return wordItems.includes(item) ? 'words' : 'verse-text';
    default:
      return 'opaque';
  }
}

/** The `mushaf_id` a `layout:` item describes. */
export function mushafIdOf(item: string): string {
  const { kind, name } = parseItemId(item);
  if (kind !== 'layout') {
    throw new PackError('unknown-item', `not a layout item: ${item}`);
  }
  return name;
}

/** The language code a `wbw:` item carries. */
export function languageOf(item: string): string {
  const { kind, name } = parseItemId(item);
  if (kind !== 'wbw') {
    throw new PackError('unknown-item', `not a word-by-word item: ${item}`);
  }
  return name;
}
