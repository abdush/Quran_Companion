# @qc/quran-core

Owner: **Renderer Agent** (`agents/renderer.md`).

Canonical Quran addressing, tashkīl-aware normalisation, and the signed
data-pack reader. Everything that needs to *say which words it means* depends on
this package; everything that needs the words themselves gets them from a pack
through it.

**This package contains no Quran text** (rule R2 / D-003). Text arrives as
verified pack bytes and is handed back unmodified. It also never touches the
network — a pack is bytes the caller already has.

## What is in here

| Module | Contract |
|---|---|
| `keys.ts` | `VerseKey`, `WordKey`, `WordRange`, `PageRef` — parse, format, compare, expand (handbook §6.1) |
| `metadata.ts` | Corpus *shape* only: ayah counts, 604 pages, lines per page. TypeScript mirror of `shared/py/qc_shared/quran/metadata.py` |
| `normalize.ts` | Tashkīl-aware comparison: strip marks, fold letters, split words |
| `pack/` | `openPack` → manifest validation, Ed25519 verification, checksum matching, layout/word/gloss tables, `word_key ↔ (mushaf_id, page, line)` |

## Keys

Keys are frozen plain objects, not classes: they cross the React Native bridge,
land in Zustand stores and get structurally cloned, so they must survive
`JSON.parse(JSON.stringify(key))` unchanged.

```ts
import { parseWordKey, wordRange, expandRange, formatWordRange } from '@qc/quran-core';

const start = parseWordKey('2:255:1');
const range = wordRange(start, parseWordKey('2:255:10'));
formatWordRange(range); // "2:255:1-2:255:10"

// The number of words in an ayah is a property of the text edition, so the
// caller supplies it — in practice from the pack.
expandRange(range, (verse) => pack.words().countFor(verse));
```

Construction validates against the Ḥafṣ ayah division, so `parseVerseKey('2:287')`
throws rather than producing a key nothing can resolve. Use `tryParse*` for user
input.

## Normalisation

Three independently switchable layers, least to most aggressive:

1. **marks** — harakāt, shadda, sukūn, superscript alef, waqf/sajdah signs,
   tatweel. Letter identity untouched, so the result is still exact Arabic.
2. **letter folding** — alef carriers, alef maqṣūra, tā' marbūṭa. Lossy by
   design: for search boxes, never for correctness checks.
3. **whitespace** — collapse and trim.

`TASHKIL_INSENSITIVE` (the default) is layer 1+3 and answers "did the reciter say
this word?". `SEARCH_FOLD` adds layer 2. `EXACT` is an explicit opt-out.

Normalisation output is derived data: never display it as Quran text, never
write it back into a pack.

## Reading a pack

```ts
import { openPack, trustedKeyFromPem, wordKey } from '@qc/quran-core';

const pack = await openPack(bytes, {
  trustedKeys: [trustedKeyFromPem('release-2026', RELEASE_PUBLIC_KEY_PEM)],
});

pack.layout().page(42);              // 15 typeset lines, each with its word keys
pack.words().get(wordKey(2, 255, 1)); // script text + transliteration
pack.locate(wordKey(2, 255, 1));      // { mushafId, page: 42, lineNumber: 8, lineOrdinal: 5 }
pack.attributions();                  // what the About screen must render (§6.4)
```

`openPack` either returns a **fully verified** pack or throws `PackError`. There
is no option to skip verification (NFR-1): a client that can be talked into
reading an unverified pack is a client that can be fed a forged muṣḥaf. An empty
`trustedKeys` list refuses everything rather than accepting everything.

Every refusal carries a `PackError.code` clients can branch on:

| code | meaning |
|---|---|
| `unsigned` | no `ed25519:` signature at all |
| `untrusted-key` | the client has no usable key configured |
| `bad-signature` | present, but does not verify under any trusted key |
| `checksums-incomplete` | `checksums` does not cover exactly `contents` |
| `checksum-mismatch` | no payload hashes to a declared digest |
| `undeclared-payload` | the archive carries a file no item declares |
| `missing-license` | a content item has no licence declaration (§6.4) |
| `unsupported-manifest-version` | the pack is newer than this reader — tell the user to update |
| `malformed-manifest` / `malformed-archive` / `malformed-payload` | the pack is broken |

Two deliberate design choices:

- **Payloads are matched to items by digest, not by file name.** Every file under
  `data/` is hashed once and an item claims the file whose SHA-256 equals its
  declared checksum. Packs can rename files without breaking clients, a renamed
  file cannot smuggle in content, and the reader needs no copy of the builder's
  file-name table. A file no item claims is itself a refusal.
- **Item *format* follows from item *kind*** (`layout:` → layout table, `wbw:` →
  glosses, `text:` → word table if listed in `wordItems`, else verbatim bytes).
  No sniffing; adding a script edition is a deliberate act.

Parsing is lazy per item: opening a 604-page pack costs one hash pass and
nothing more until a page is asked for.

## Tests and fixtures

```bash
pnpm --filter @qc/quran-core test
pnpm --filter @qc/quran-core typecheck
```

`tests/fixtures/sample-hafs-2026.07.0.qpack` is a real signed pack derived from
`core-hafs` by `scripts/make-fixture-pack.mjs`, so the tests run the production
verification path rather than a stub. It carries:

- the **whole layout item** — 604 pages of canonical keys and line structure,
  no text at all — so the structural goldens stay corpus-wide (6236 ayat,
  77 429 placed words, 9046 lines);
- word text and glosses for the sampled pages only (1, 2, 42, 604).

`text:tanzil-uthmani-1.1` is deliberately excluded: the Tanzil terms permit
verbatim redistribution only, and a page-sampled subset is not verbatim.

The fixture is signed with a **deterministic, deliberately public** key so that
regeneration produces no diff. It is not a secret, and it must never appear in a
client's trust list.

`tests/fixtures/core-hafs-manifest.json` is the real `core-hafs` manifest plus
the public half of the key that signed it (checksums and attributions only, no
text). `tests/signature.test.ts` verifies that Python-produced signature with
this TypeScript verifier — if canonicalisation ever drifts, that test goes red
before every client starts refusing real packs.

Regenerating the fixture needs a built pack:

```bash
cd tools/pack-builder && uv run pack-builder fetch && uv run pack-builder pack
pnpm --filter @qc/quran-core fixture
```

`tests/golden/layout-corpus.json` is a **drift detector**, not a source of truth:
its word counts were validated upstream against an independent split of the
Tanzil text by the pack-builder golden gates. Rule R8 applies — never regenerate
it to make a red test pass.

## Boundaries

- Consumed interface: `schemas/packs/manifest.schema.json` (via the generated
  `@qc/api-client` types). **Pack-format changes go through an ICP RFC**, not
  through an edit here.
- Consumers: `@qc/mushaf-renderer`, app feature code, and eventually the
  annotation and memorisation domains.
