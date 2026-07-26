/**
 * Build the test fixture pack from a real `core-hafs` pack.
 *
 *     node scripts/make-fixture-pack.mjs [path/to/core-hafs-<version>.qpack]
 *
 * Why a derived fixture rather than the real pack: the goldens have to run in
 * CI without network access, and the real pack is 1.7 MiB of licensed content
 * that is not committed anywhere. The fixture keeps the **whole layout item**
 * (604 pages of canonical keys and line structure — no text at all, so the
 * structural goldens stay corpus-wide) and, for the sampled pages only, the
 * word text and glosses the renderer needs to compose a page.
 *
 * Licensing (§6.4): `text:tanzil-uthmani-1.1` is deliberately **excluded** —
 * the Tanzil terms permit verbatim redistribution only, and a page-sampled
 * subset is not verbatim. The three QUL-curated items that remain are
 * redistributed unmodified per key, with their registry attributions copied
 * across, and every one is a strict subset of what the source pack contains.
 *
 * The fixture is signed with a **deterministic, deliberately public** key so
 * that regenerating it produces no diff. That key is not a secret and must
 * never appear in any client's trust list; it exists so tests can exercise the
 * real signature path instead of a stub.
 *
 * Output is byte-reproducible: zip entry timestamps are pinned to 1980-01-01.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
} from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { unzipSync, zipSync } from 'fflate';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');
const FIXTURE_DIR = join(PACKAGE_ROOT, 'tests', 'fixtures');
const GOLDEN_DIR = join(PACKAGE_ROOT, 'tests', 'golden');

const DEFAULT_SOURCE = join(
  REPO_ROOT,
  'tools',
  'pack-builder',
  'dist',
  'core-hafs-2026.07.0.qpack',
);

/** Pages the renderer goldens compose: opening spread, Āyat al-Kursī, last page. */
export const SAMPLE_PAGES = [1, 2, 42, 604];

const FIXTURE_PACK_ID = 'sample-hafs';
const LAYOUT_ITEM = 'layout:qpc-hafs-madani-604';
const WORD_ITEM = 'text:qpc-hafs';
const GLOSS_ITEM = 'wbw:en';
const KEPT_ITEMS = [WORD_ITEM, LAYOUT_ITEM, GLOSS_ITEM];

/** Not a secret: a fixed test key, public by design. See the header. */
const FIXTURE_KEY_SEED_PHRASE = 'quran-companion fixture pack signing key v1';
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/** Zip timestamps pinned to the format's epoch so rebuilds are byte-identical. */
export const ZIP_ENTRY_OPTIONS = { mtime: Date.UTC(1980, 0, 1) };

export function fixtureKeyPair() {
  const seed = createHash('sha256').update(FIXTURE_KEY_SEED_PHRASE).digest();
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicPem = createPublicKey(privateKey).export({ format: 'pem', type: 'spki' });
  return { privateKey, publicPem };
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

export function sha256Checksum(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function textLines(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function payloadByItem(archive, manifest) {
  // Same rule as the reader: items claim payloads by digest, not by file name.
  const byDigest = new Map();
  for (const [name, bytes] of Object.entries(archive)) {
    if (name === 'manifest.json') continue;
    byDigest.set(sha256Checksum(bytes), name);
  }
  const payloads = new Map();
  for (const item of manifest.contents) {
    const name = byDigest.get(manifest.checksums[item]);
    if (name === undefined) throw new Error(`source pack has no payload for ${item}`);
    payloads.set(item, archive[name]);
  }
  return payloads;
}

function main() {
  const sourcePath = process.argv[2] ?? process.env.QC_SOURCE_PACK ?? DEFAULT_SOURCE;
  let sourceBytes;
  try {
    sourceBytes = readFileSync(sourcePath);
  } catch {
    console.error(
      `No source pack at ${sourcePath}.\n` +
        'Build one first:  cd tools/pack-builder && uv run pack-builder fetch && ' +
        'uv run pack-builder pack\n' +
        'or pass a path:   node scripts/make-fixture-pack.mjs <pack>',
    );
    process.exit(1);
  }

  const archive = unzipSync(new Uint8Array(sourceBytes));
  const sourceManifest = JSON.parse(new TextDecoder().decode(archive['manifest.json']));
  const payloads = payloadByItem(archive, sourceManifest);

  // 1. Layout: kept whole — canonical keys and line structure, no text.
  const layoutLines = textLines(payloads.get(LAYOUT_ITEM));

  // 2. Which ayat the sampled pages touch. Whole ayat are kept, so word
  //    positions stay contiguous from 1 exactly as the reader requires.
  const sampled = new Set(SAMPLE_PAGES);
  const verses = new Set();
  for (const line of layoutLines) {
    const [page, , , , keys] = line.split('\t');
    if (!sampled.has(Number(page)) || keys === '') continue;
    for (const key of keys.split(',')) {
      const [surah, ayah] = key.split(':');
      verses.add(`${surah}:${ayah}`);
    }
  }

  const keepsVerse = (line) => {
    const [key] = line.split('\t');
    const [surah, ayah] = key.split(':');
    return verses.has(`${surah}:${ayah}`);
  };
  const wordLines = textLines(payloads.get(WORD_ITEM)).filter(keepsVerse);
  const glossLines = textLines(payloads.get(GLOSS_ITEM)).filter(keepsVerse);

  const encoder = new TextEncoder();
  const files = {
    [LAYOUT_ITEM]: encoder.encode(`${layoutLines.join('\n')}\n`),
    [WORD_ITEM]: encoder.encode(`${wordLines.join('\n')}\n`),
    [GLOSS_ITEM]: encoder.encode(`${glossLines.join('\n')}\n`),
  };

  const manifest = {
    manifest_version: 1,
    pack_id: FIXTURE_PACK_ID,
    version: sourceManifest.version,
    contents: KEPT_ITEMS,
    checksums: Object.fromEntries(KEPT_ITEMS.map((item) => [item, sha256Checksum(files[item])])),
    licenses: sourceManifest.licenses.filter((entry) => KEPT_ITEMS.includes(entry.item)),
  };

  const { privateKey, publicPem } = fixtureKeyPair();
  const canonical = Buffer.from(JSON.stringify(canonicalJson(manifest)), 'utf-8');
  manifest.signature = `ed25519:${signBytes(null, canonical, privateKey).toString('base64')}`;

  const zipEntries = {
    'manifest.json': [encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`), ZIP_ENTRY_OPTIONS],
    'data/text-qpc-hafs.tsv': [files[WORD_ITEM], ZIP_ENTRY_OPTIONS],
    'data/layout-qpc-hafs-madani-604.tsv': [files[LAYOUT_ITEM], ZIP_ENTRY_OPTIONS],
    'data/wbw-en.tsv': [files[GLOSS_ITEM], ZIP_ENTRY_OPTIONS],
  };

  mkdirSync(FIXTURE_DIR, { recursive: true });
  mkdirSync(GOLDEN_DIR, { recursive: true });

  const packPath = join(FIXTURE_DIR, `${FIXTURE_PACK_ID}-${manifest.version}.qpack`);
  writeFileSync(packPath, zipSync(zipEntries, { level: 9 }));
  writeFileSync(join(FIXTURE_DIR, 'fixture-signing.pub'), publicPem);

  // 3. Structural golden, derived from the layout the pack ships. It is a
  //    *drift detector*, not a source of truth: the word counts it records were
  //    validated upstream against an independent split of the Tanzil text by
  //    the pack-builder golden gates (§23, R8). Never regenerate it to make a
  //    red test pass.
  const wordsPerSurah = new Map();
  const wordsPerAyah = new Map();
  let placedWords = 0;
  for (const line of layoutLines) {
    const [, , , , keys] = line.split('\t');
    if (keys === '') continue;
    for (const key of keys.split(',')) {
      const [surah, ayah] = key.split(':');
      placedWords += 1;
      wordsPerSurah.set(Number(surah), (wordsPerSurah.get(Number(surah)) ?? 0) + 1);
      const verse = `${surah}:${ayah}`;
      wordsPerAyah.set(verse, (wordsPerAyah.get(verse) ?? 0) + 1);
    }
  }

  const golden = {
    _comment:
      'Generated by scripts/make-fixture-pack.mjs from ' +
      `${sourceManifest.pack_id}-${sourceManifest.version}. Drift detector for the ` +
      'QUL layout + QPC word data; never edit by hand to make a test pass (R8).',
    source_pack: `${sourceManifest.pack_id}-${sourceManifest.version}`,
    source_checksums: Object.fromEntries(
      KEPT_ITEMS.map((item) => [item, sourceManifest.checksums[item]]),
    ),
    mushaf_id: 'qpc-hafs-madani-604',
    page_count: new Set(layoutLines.map((line) => Number(line.split('\t')[0]))).size,
    line_count: layoutLines.length,
    placed_word_count: placedWords,
    ayah_count: wordsPerAyah.size,
    words_per_surah: Object.fromEntries(
      [...wordsPerSurah.entries()].sort((a, b) => a[0] - b[0]),
    ),
    sample_pages: SAMPLE_PAGES,
    words_per_ayah_on_sample_pages: Object.fromEntries(
      [...verses]
        .sort((a, b) => {
          const [as, aa] = a.split(':').map(Number);
          const [bs, ba] = b.split(':').map(Number);
          return as - bs || aa - ba;
        })
        .map((verse) => [verse, wordsPerAyah.get(verse)]),
    ),
  };
  writeFileSync(join(GOLDEN_DIR, 'layout-corpus.json'), `${JSON.stringify(golden, null, 2)}\n`);

  console.log(`wrote ${packPath}`);
  console.log(
    `  layout ${layoutLines.length} lines, words ${wordLines.length}, glosses ${glossLines.length}`,
  );
}

/** Sign a manifest with the fixture key, in place of its `signature` field. */
export function signFixtureManifest(manifest) {
  const { signature: _replaced, ...unsigned } = manifest;
  const canonical = Buffer.from(JSON.stringify(canonicalJson(unsigned)), 'utf-8');
  const { privateKey } = fixtureKeyPair();
  return {
    ...unsigned,
    signature: `ed25519:${signBytes(null, canonical, privateKey).toString('base64')}`,
  };
}

// Only build when run as a script; the tests import the helpers above.
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
