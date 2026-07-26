/**
 * Cross-implementation check on the signature contract.
 *
 * `tests/fixtures/core-hafs-manifest.json` is the manifest of the real
 * `core-hafs-2026.07.0` pack, copied verbatim from the artifact
 * `tools/pack-builder` produced, together with the public half of the key that
 * signed it. It carries no Quran text — checksums, item ids and attributions
 * only — so it can live in the repo while the pack itself cannot.
 *
 * If this test goes red, the TypeScript canonicalisation has drifted from the
 * Python signer's `json.dumps(sort_keys=True, separators=(",", ":"),
 * ensure_ascii=False)` and every client would start refusing real packs.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  SignatureFormatError,
  canonicalManifestBytes,
  checkManifestSignature,
  publicKeyFromPem,
  trustedKeyFromPem,
} from '../src/index.js';
import { fixtureTrustedKey } from './support/fixture.js';

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const realManifest = JSON.parse(
  readFileSync(join(FIXTURE_DIR, 'core-hafs-manifest.json'), 'utf-8'),
) as Record<string, unknown>;

const packBuilderDevKey = trustedKeyFromPem(
  'pack-builder-dev',
  readFileSync(join(FIXTURE_DIR, 'pack-builder-dev-signing.pub'), 'utf-8'),
);

describe('canonical manifest bytes', () => {
  it('drops the signature and sorts keys recursively', () => {
    const bytes = canonicalManifestBytes({
      b: 1,
      a: { d: 2, c: [{ f: 3, e: 4 }] },
      signature: 'ed25519:ignored',
    });
    expect(new TextDecoder().decode(bytes)).toBe('{"a":{"c":[{"e":4,"f":3}],"d":2},"b":1}');
  });

  it('emits non-ASCII verbatim, as ensure_ascii=False does', () => {
    const bytes = canonicalManifestBytes({ attribution: 'Ḥafṣ — القرآن' });
    expect(new TextDecoder().decode(bytes)).toBe('{"attribution":"Ḥafṣ — القرآن"}');
  });
});

describe('a manifest signed by tools/pack-builder', () => {
  it('verifies under the key that signed it', () => {
    const check = checkManifestSignature(realManifest, [packBuilderDevKey]);
    expect(check.ok).toBe(true);
  });

  it('does not verify under a different trusted key', () => {
    const check = checkManifestSignature(realManifest, [fixtureTrustedKey()]);
    expect(check).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('does not verify once any signed field is altered', () => {
    const tampered = { ...realManifest, version: '2026.07.1' };
    expect(checkManifestSignature(tampered, [packBuilderDevKey]).ok).toBe(false);
  });

  it('is refused outright when the signature is removed', () => {
    const { signature: _dropped, ...unsigned } = realManifest;
    expect(checkManifestSignature(unsigned, [packBuilderDevKey])).toEqual({
      ok: false,
      reason: 'unsigned',
    });
  });

  it('is refused when the client trusts nothing — an empty list is not a bypass', () => {
    expect(checkManifestSignature(realManifest, [])).toEqual({
      ok: false,
      reason: 'untrusted-key',
    });
  });
});

describe('public key parsing', () => {
  it('reads the PEM SubjectPublicKeyInfo pack-builder keygen writes', () => {
    expect(packBuilderDevKey.publicKey).toHaveLength(32);
  });

  it('rejects anything that is not an Ed25519 SPKI', () => {
    expect(() => publicKeyFromPem('not a pem')).toThrow(SignatureFormatError);
    expect(() =>
      publicKeyFromPem('-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----'),
    ).toThrow(/not an Ed25519 SubjectPublicKeyInfo/);
  });
});
