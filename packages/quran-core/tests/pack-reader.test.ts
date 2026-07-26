/**
 * The reader's contract is a refusal contract (§6.3, NFR-1): every way a pack
 * can be wrong has a test here, and each one asserts the specific `PackError`
 * code, because clients branch on it (offer "update the app" for an unsupported
 * manifest, "re-download" for a bad checksum).
 *
 * Tampered packs are built by rebuilding the fixture archive, so the tests run
 * through exactly the code path a forged pack would take.
 */

import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { PackError, openPack, verseKey, wordKey } from '../src/index.js';
import {
  ZIP_ENTRY_OPTIONS,
  sha256Checksum,
  signFixtureManifest,
} from '../scripts/make-fixture-pack.mjs';
import { SAMPLE_PAGES, fixturePackBytes, fixtureTrust, fixtureTrustedKey } from './support/fixture.js';

type Entries = Record<string, Uint8Array>;

function archive(): Entries {
  return unzipSync(fixturePackBytes()) as Entries;
}

function repack(entries: Entries): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, bytes]) => [name, [bytes, ZIP_ENTRY_OPTIONS]]),
    ) as never,
  );
}

function manifestOf(entries: Entries): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(entries['manifest.json'] as Uint8Array));
}

function withManifest(entries: Entries, manifest: unknown): Entries {
  return {
    ...entries,
    'manifest.json': new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
  };
}

async function expectRefusal(bytes: Uint8Array, code: string): Promise<void> {
  const error = await openPack(bytes, fixtureTrust()).then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error, `expected ${code}, pack was accepted`).toBeInstanceOf(PackError);
  expect((error as PackError).code).toBe(code);
}

describe('opening a well-formed pack', () => {
  it('verifies signature and checksums, and reports what it trusted', async () => {
    const pack = await openPack(fixturePackBytes(), fixtureTrust());
    expect(pack.packId).toBe('sample-hafs');
    expect(pack.version).toBe('2026.07.0');
    expect(pack.signedBy).toBe('fixture');
    expect([...pack.contents].sort()).toEqual([
      'layout:qpc-hafs-madani-604',
      'text:qpc-hafs',
      'wbw:en',
    ]);
  });

  it('classifies items by kind', async () => {
    const pack = await openPack(fixturePackBytes(), fixtureTrust());
    expect(pack.roleOf('layout:qpc-hafs-madani-604')).toBe('layout');
    expect(pack.roleOf('text:qpc-hafs')).toBe('words');
    expect(pack.roleOf('wbw:en')).toBe('glosses');
    expect(pack.roleOf('text:tanzil-uthmani-1.1')).toBe('verse-text');
    expect(pack.mushafIds).toEqual(['qpc-hafs-madani-604']);
    expect(pack.glossLanguages).toEqual(['en']);
  });

  it('exposes the attributions the About screen has to render (§6.4)', async () => {
    const pack = await openPack(fixturePackBytes(), fixtureTrust());
    const attributions = pack.attributions();
    expect(attributions.map((entry) => entry.item).sort()).toEqual([...pack.contents].sort());
    for (const entry of attributions) {
      expect(entry.license.length).toBeGreaterThan(0);
      expect(entry.attribution.length).toBeGreaterThan(0);
    }
  });

  it('hands back payload bytes unmodified', async () => {
    const pack = await openPack(fixturePackBytes(), fixtureTrust());
    const bytes = pack.rawPayload('layout:qpc-hafs-madani-604');
    expect(sha256Checksum(bytes)).toBe(pack.manifest.checksums['layout:qpc-hafs-madani-604']);
  });

  it('accepts an ArrayBuffer as readily as a Uint8Array', async () => {
    const bytes = fixturePackBytes();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const pack = await openPack(buffer as ArrayBuffer, fixtureTrust());
    expect(pack.packId).toBe('sample-hafs');
  });

  it('reports unknown items instead of returning empty tables', async () => {
    const pack = await openPack(fixturePackBytes(), fixtureTrust());
    expect(() => pack.glosses('ur')).toThrow(/has no ur glosses/);
    expect(() => pack.layout('indopak-15')).toThrow(/no layout for indopak-15/);
    expect(() => pack.rawPayload('text:tanzil-uthmani-1.1')).toThrow(/does not contain/);
  });
});

describe('refusals', () => {
  it('refuses an unsigned pack', async () => {
    const entries = archive();
    const { signature: _dropped, ...unsigned } = manifestOf(entries);
    await expectRefusal(repack(withManifest(entries, unsigned)), 'unsigned');
  });

  it('refuses a pack signed by a key the client does not trust', async () => {
    const error = await openPack(fixturePackBytes(), { trustedKeys: [] }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect((error as PackError).code).toBe('untrusted-key');
  });

  it('refuses a tampered payload — the checksum no longer matches', async () => {
    const entries = archive();
    const name = 'data/text-qpc-hafs.tsv';
    const payload = Uint8Array.from(entries[name] as Uint8Array);
    payload[payload.length - 2] = (payload[payload.length - 2] as number) ^ 0x01;
    await expectRefusal(repack({ ...entries, [name]: payload }), 'checksum-mismatch');
  });

  it('refuses a payload the manifest never declared', async () => {
    const entries = archive();
    entries['data/smuggled.tsv'] = new TextEncoder().encode('1:1:1\tx\ty\n');
    await expectRefusal(repack(entries), 'undeclared-payload');
  });

  it('refuses a file that sits outside data/', async () => {
    const entries = archive();
    entries['README.md'] = new TextEncoder().encode('hello\n');
    await expectRefusal(repack(entries), 'undeclared-payload');
  });

  it('refuses a manifest whose checksums do not cover its contents', async () => {
    const entries = archive();
    const manifest = manifestOf(entries) as { checksums: Record<string, string> };
    delete manifest.checksums['wbw:en'];
    await expectRefusal(
      repack(withManifest(entries, signFixtureManifest(manifest))),
      'checksums-incomplete',
    );
  });

  it('refuses a content item with no licence declaration (§6.4)', async () => {
    const entries = archive();
    const manifest = manifestOf(entries) as { licenses: { item: string }[] };
    manifest.licenses = manifest.licenses.filter((entry) => entry.item !== 'wbw:en');
    await expectRefusal(
      repack(withManifest(entries, signFixtureManifest(manifest))),
      'missing-license',
    );
  });

  it('refuses a manifest version it does not understand', async () => {
    const entries = archive();
    const manifest = { ...manifestOf(entries), manifest_version: 2 };
    await expectRefusal(
      repack(withManifest(entries, signFixtureManifest(manifest))),
      'unsupported-manifest-version',
    );
  });

  it('refuses a manifest with an unexpected field', async () => {
    const entries = archive();
    const manifest = { ...manifestOf(entries), trust_me: true };
    await expectRefusal(
      repack(withManifest(entries, signFixtureManifest(manifest))),
      'malformed-manifest',
    );
  });

  it('refuses a manifest with a malformed checksum', async () => {
    const entries = archive();
    const manifest = manifestOf(entries) as { checksums: Record<string, string> };
    manifest.checksums['wbw:en'] = 'sha256:not-hex';
    await expectRefusal(
      repack(withManifest(entries, signFixtureManifest(manifest))),
      'malformed-manifest',
    );
  });

  it('refuses an archive with no manifest', async () => {
    const entries = archive();
    delete entries['manifest.json'];
    await expectRefusal(repack(entries), 'malformed-archive');
  });

  it('refuses an archive whose manifest is not JSON', async () => {
    const entries = archive();
    entries['manifest.json'] = new TextEncoder().encode('{ not json');
    await expectRefusal(repack(entries), 'malformed-archive');
  });

  it('refuses bytes that are not a zip at all', async () => {
    await expectRefusal(new TextEncoder().encode('this is not a qpack'), 'malformed-archive');
  });

  it('refuses a payload that is not valid UTF-8', async () => {
    // Verification passes (the manifest is re-signed over the new digest); the
    // failure has to come from the parser, at the point of use.
    const entries = archive();
    const name = 'data/wbw-en.tsv';
    const payload = Uint8Array.from([0xff, 0xfe, 0xfd]);
    const manifest = manifestOf(entries) as { checksums: Record<string, string> };
    manifest.checksums['wbw:en'] = sha256Checksum(payload);
    const pack = await openPack(
      repack(withManifest({ ...entries, [name]: payload }, signFixtureManifest(manifest))),
      fixtureTrust(),
    );
    expect(() => pack.glosses('en')).toThrow(/not valid UTF-8/);
  });

  it('names the key it trusted, so a client can tell dev packs from release packs', async () => {
    const key = fixtureTrustedKey();
    expect(key.name).toBe('fixture');
    expect(key.publicKey).toHaveLength(32);
  });
});

describe('tables', () => {
  it('reads word entries and per-ayah counts', async () => {
    const pack = await openPack(fixturePackBytes(), fixtureTrust());
    const words = pack.words();
    expect(words.countFor(verseKey(2, 255))).toBe(50);
    expect(words.get(wordKey(2, 255, 50))).not.toBeNull();
    expect(words.get(wordKey(2, 255, 51))).toBeNull();
    const entry = words.get(wordKey(1, 1, 1));
    expect(entry?.text.length).toBeGreaterThan(0);
    expect(entry?.transliteration).toBeTruthy();
  });

  it('reads glosses for the language the pack ships', async () => {
    const pack = await openPack(fixturePackBytes(), fixtureTrust());
    expect(pack.glosses('en').get(wordKey(1, 1, 1))).toBeTruthy();
  });

  it('maps a word key to (mushaf_id, page, line) — the §6.1 contract', async () => {
    const pack = await openPack(fixturePackBytes(), fixtureTrust());
    expect(pack.locate(wordKey(2, 255, 1))).toEqual({
      mushafId: 'qpc-hafs-madani-604',
      page: 42,
      lineNumber: 8,
      lineOrdinal: 5,
    });
    expect(pack.pageRefFor(verseKey(2, 255))).toEqual({
      mushafId: 'qpc-hafs-madani-604',
      page: 42,
    });
  });

  it('exposes every sampled page with its lines in order', async () => {
    const pack = await openPack(fixturePackBytes(), fixtureTrust());
    const layout = pack.layout();
    for (const page of SAMPLE_PAGES) {
      const lines = layout.page(page).lines;
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.map((line) => line.lineNumber)).toEqual(
        [...lines].map((_, index) => index + 1),
      );
    }
  });
});
