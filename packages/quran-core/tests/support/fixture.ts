/**
 * Loading helpers for the committed sample pack.
 *
 * The pack is a real, signed `.qpack` derived from `core-hafs` by
 * `scripts/make-fixture-pack.mjs` — the tests exercise the production
 * verification path, not a stub.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { trustedKeyFromPem, type TrustedKey } from '../../src/index.js';

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export const FIXTURE_PACK_PATH = join(FIXTURE_DIR, 'sample-hafs-2026.07.0.qpack');

/** Pages the goldens compose; mirrors `SAMPLE_PAGES` in the generator. */
export const SAMPLE_PAGES = [1, 2, 42, 604] as const;

export function fixturePackBytes(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE_PACK_PATH));
}

/**
 * The fixture signing key. Deliberately public and test-only — never add it to
 * a client's trust list.
 */
export function fixtureTrustedKey(): TrustedKey {
  return trustedKeyFromPem(
    'fixture',
    readFileSync(join(FIXTURE_DIR, 'fixture-signing.pub'), 'utf-8'),
  );
}

export function fixtureTrust(): { trustedKeys: TrustedKey[] } {
  return { trustedKeys: [fixtureTrustedKey()] };
}
