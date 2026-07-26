/**
 * The sample pack, borrowed from `@qc/quran-core`'s fixtures.
 *
 * The renderer deliberately has no fixture of its own: it must render what the
 * pack reader actually produces, so any drift in the pack format shows up here
 * as a red renderer test rather than as a divergent copy of the data.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPack, trustedKeyFromPem, type QuranPack } from '@qc/quran-core';

const CORE_FIXTURES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'quran-core',
  'tests',
  'fixtures',
);

/** Pages the goldens cover: the framed opening spread, Āyat al-Kursī, the last page. */
export const SAMPLE_PAGES = [1, 2, 42, 604] as const;

let cached: Promise<QuranPack> | null = null;

export function samplePack(): Promise<QuranPack> {
  cached ??= openPack(new Uint8Array(readFileSync(join(CORE_FIXTURES, 'sample-hafs-2026.07.0.qpack'))), {
    trustedKeys: [
      trustedKeyFromPem('fixture', readFileSync(join(CORE_FIXTURES, 'fixture-signing.pub'), 'utf-8')),
    ],
  });
  return cached;
}
