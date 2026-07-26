# Quran Data Architecture

> **Scope:** handbook §6 — canonical addressing, source dataset registry, data
> pack format, licensing manifest, and the Quran Data Service (QDS). Owner:
> Documentation Agent; the schemas referenced here are owned by the Architecture
> Agent and the import pipelines by the Backend Agent.
>
> **Related:** [ARCHITECTURE.md](ARCHITECTURE.md) · [API.md](API.md) ·
> [DATABASE.md](DATABASE.md) · [D-003](adr/D-003-canonical-addressing.md) ·
> [D-004](adr/D-004-signed-data-packs.md)

---

## 1. Canonical addressing — the most important contract in the system

Every module addresses Quran content the same way:

```
VerseKey  = (surah: int 1..114, ayah: int)          e.g. 2:255
WordKey   = (surah, ayah, word_position: int 1..n)   e.g. 2:255:3
WordRange = (start: WordKey, end: WordKey)           inclusive, ordered
PageRef   = (mushaf_id: string, page: int 1..604)
```

- `word_position` follows the space-split ordering of the QPC Ḥafṣ text used by
  QUL / Quran Foundation word APIs, so annotations remain compatible with
  `surah:ayah:word_position` integer addressing.
- A `mushaf_id` names a specific layout+script edition (e.g.
  `qpc-hafs-madani-604`). **Word keys are layout-independent; page refs are
  layout-dependent.** A mapping table `word_key → (mushaf_id, page, line)` ships
  in the data pack.
- **No module may store Quran text copied into its own tables** (Rule R2,
  [D-003](adr/D-003-canonical-addressing.md)). Text is referenced by key and
  resolved via QDS or a data pack. This prevents drift, keeps the user database
  small, and matches the licensing terms of the upstream datasets.

### What this means in practice

| Situation | Correct | Wrong |
|---|---|---|
| Annotation on a word | store `(surah, ayah, word_position)` | store the word's Arabic text |
| Test error record | store the `WordKey` + error kind | store expected/actual Arabic strings |
| AI tutor quoting a verse | fetch verbatim from QDS by `VerseKey` | let the model produce the text (D-009) |
| Renderer showing a page | read text + layout from the pack | fetch and cache text into app state as truth |
| Test fixture needing text | reference a key; resolve via the pack fixture | paste Uthmani text into the test file |

The wire format for keys in JSON payloads is the colon string (`"2:255"`,
`"2:255:3"`), defined once in `schemas/openapi/qds.yaml` and mirrored by
`packages/quran-core`.

## 2. Source datasets (reuse, do not rebuild)

Principle P2: mature open datasets are integrated, not reimplemented.

| Need | Source | Notes |
|---|---|---|
| Canonical Uthmani text (Ḥafṣ) | **Tanzil** quran-uthmani + **QUL (qul.tarteel.ai)** QPC texts | Checksummed reference; QUL provides script variants (v1/v2 glyph-coded, imlaei) |
| Page layout (Madani 604) | **QUL mushaf layouts** | line/page word placement per mushaf edition |
| Fonts | **KFGQPC / QPC v2 fonts** via QUL | per-page glyph fonts for authentic rendering |
| Word-by-word gloss & transliteration | **QUL word-by-word datasets** / quranwbw | multiple languages |
| Morphology, roots, lemmas, POS | **Quranic Arabic Corpus** (corpus.quran.com dataset) | powers root explorer (FR-AI-5) and vocabulary builder |
| Translations | **Tanzil translations** + QUL | 40+ languages, versioned |
| Tafsīr | **QUL tafsīr collections** | licensed collections with attribution |
| Ayah audio (many reciters) | **EveryAyah**, QUL audio, Quran Foundation CDN | per-ayah MP3 naming convention |
| Word-level audio timestamps | **cpfair/quran-align** released timing files + QUL segments (also exposed by Quran Foundation audio API `?segments=true`) | CC-BY 4.0 timing data; enables word highlight + word loops |
| Quran ASR models | **tarteel-ai/whisper-base-ar-quran**, whisper-tiny variant, community LoRA fine-tunes (e.g. diacritic-sensitive adapters) | Hugging Face; see [SPEECH.md](SPEECH.md) |
| Similar verses (mutashābihāt) | Curated open datasets + generated candidates via n-gram/embedding similarity, human-reviewed | powers FR-HZ-7 |
| Tajweed rule metadata | Rule-annotated text datasets (e.g. open tajweed colour-coding data) + hand-authored rule cards sourced from classical texts | see handbook §14 |
| Classical texts corpus | **OpenITI** | source for knowledge base ingestion (handbook §11) |
| Arabic NLP | **CAMeL Tools** (Python), Farasa (optional) | normalisation, morphology fallback, diacritisation utilities |

Every dataset actually bundled must have an entry in
[`schemas/licenses.json`](../schemas/licenses.json) **before** it is imported —
the table above is the shopping list, the registry is the record of what shipped.

## 3. Data packs (offline distribution unit)

A **data pack** is a versioned, signed artifact (`.qpack` = zip + manifest)
built by `tools/pack-builder`. Normative schema:
[`schemas/packs/manifest.schema.json`](../schemas/packs/manifest.schema.json).

```json
{
  "manifest_version": 1,
  "pack_id": "core-hafs",
  "version": "2026.07.0",
  "contents": ["text:qpc-hafs", "layout:qpc-hafs-madani-604", "wbw:en", "morphology:qac-0.4"],
  "checksums": { "text:qpc-hafs": "sha256:..." },
  "licenses": [{ "item": "morphology:qac-0.4", "license": "GPL-compatible-check", "attribution": "..." }],
  "signature": "ed25519:..."
}
```

That example is illustrative (it is the handbook §6.3 sketch). The pack actually
shipped by task 0.3, `core-hafs` `2026.07.0`, contains four items —
`text:tanzil-uthmani-1.1`, `text:qpc-hafs`, `layout:qpc-hafs-madani-604`,
`wbw:en` — and **no** morphology; `morphology:qac-0.4` arrives with the root
explorer (FR-AI-5). Payload checksums reproduce byte-identically across
rebuilds, which is what makes a pack's identity meaningful.

Rules:

- Clients **refuse unsigned or checksum-failing packs** (NFR-1). A checksum
  mismatch is a fatal error, never a warning — it means the Quran text may have
  been tampered with.
- Packs are **immutable**; updates ship as new versions; the client keeps at
  most current + previous.
- Audio is **not** packed by default; it streams from CDN with a per-reciter
  offline download manager (per-surah granularity, resumable).
- `version` is calendar-versioned `YYYY.MM.N`; `pack_id` is stable across
  versions and is the identity clients dedupe on.

### Item identifiers

`contents[]`, `checksums{}` keys, and `licenses[].item` all use the same
`kind:slug` item id (e.g. `text:qpc-hafs`, `timing:quran-align-1.0`). The same
id must appear in the licensing registry — CI fails a pack whose item is not
registered.

## 4. Licensing manifest

[`schemas/licenses.json`](../schemas/licenses.json) is the **single registry** of
every third-party dataset: its license, attribution string, source URL, and usage
constraints (schema: `schemas/licenses.schema.json`). Rules:

- CI fails if a pack manifest references an item absent from the registry
  (NFR-9).
- The About / credits screen renders attributions **from this file** — there is
  no second, hand-maintained credits list to drift out of date.
- Adding a dataset = registry entry + attribution string in the same PR as the
  import code.

Registered so far (rendered from `schemas/licenses.json`, registry version 1):

| Item | License | Dataset |
|---|---|---|
| `text:tanzil-uthmani-1.1` | CC-BY-3.0 | Tanzil Quran Text (Uthmani, version 1.1) |
| `text:qpc-hafs` | `QUL-Community-Resource` | QPC Ḥafṣ Uthmani word-level script (KFGQPC, via QUL) |
| `layout:qpc-hafs-madani-604` | `QUL-Community-Resource` | KFGQPC V1 Madani muṣḥaf layout, 604 pages / 15 lines (1405H print, via QUL) |
| `wbw:en` | `QUL-Community-Resource` | Word-by-word English translation and transliteration (QuranWBW, via QUL) |
| `timing:quran-align-1.0` | CC-BY-4.0 | quran-align word-level audio timestamps (cpfair/quran-align) |

`QUL-Community-Resource` is a **registry-defined code**, not an SPDX id: QUL
publishes these community-curated resources for free use in Quranic
applications without a single blanket grant. Every non-SPDX code must carry
`usage_constraints` spelling out what it permits — enforced by
`services/api/tests/test_licensing_gate.py`.

Two constraints from this set are worth reading before touching the import
pipeline:

- **Tanzil permits verbatim redistribution only.** The pack payload therefore
  ships Tanzil's bytes unmodified, and the golden checksum is taken over those
  bytes. The basmallah-stripped ayah text that `qds.verse` stores is a separate,
  derived representation.
- **The layout is redistributed with declared modifications**: the page-offset
  corrections in `tools/pack-builder/fixtures/layout_errata.json`, and the
  surah-name / basmallah line typing derived from word placements. Both are
  documented in [the pack-builder README](../tools/pack-builder/README.md).

Attribution strings are copied **verbatim** from the registry into every pack
manifest, and a mismatch fails the build — so rewording an `attribution` means
rebuilding packs.

Regenerate this table from the registry when it changes (it is a rendering of
`schemas/licenses.json`, not a second source of truth). The docs-freshness check
requires a `docs/DATA.md` touch whenever the registry changes, which is what
keeps the two in step.

## 5. Quran Data Service (QDS)

**Responsibilities:** serve text / layout / word-by-word / morphology / tafsīr /
audio-index by canonical keys; run build-time import pipelines from upstream
sources; Redis cache (24 h TTL) in front of PostgreSQL reference tables; produce
data packs.

Read interface (full contract:
[`schemas/openapi/qds.yaml`](../schemas/openapi/qds.yaml)):

```
GET /v1/quran/verses/{surah}:{ayah}?fields=text,words,translations&translation_ids=...
GET /v1/quran/pages/{mushaf_id}/{page}
GET /v1/quran/words/{surah}:{ayah}:{pos}
GET /v1/quran/roots/{root}?include=occurrences,morphology
GET /v1/quran/audio/{reciter_id}/{surah}:{ayah}?segments=true
GET /v1/quran/similar/{surah}:{ayah}          # mutashābihāt candidates
GET /v1/quran/tafsir/{collection_id}/{surah}:{ayah}
```

QDS endpoints are **public, cacheable, and ETag'd** — they carry no user data,
which is what lets them be served from cache and CDN edges. Anything requiring a
profile belongs in another context.

## 6. Integrity gates

| Gate | Where | Failure mode |
|---|---|---|
| Text checksum vs Tanzil Uthmani reference | build time (import) and every client pack install | fatal — install aborted (NFR-1) |
| Word count per ayah | golden data test | red test = the import is wrong, never "update the fixture" (Rule R8) |
| Layout row/line counts per page | golden data test | as above |
| Pack signature (ed25519) | client install | pack rejected |
| License registry coverage | CI on pack build | build fails |

## 7. Current implementation status (Phase 0)

| Element | State |
|---|---|
| Canonical addressing types (Python) | Done — `shared/py/qc_shared/quran` (task 0.3) |
| Canonical addressing types (TS, `packages/quran-core`) | Package scaffold only; lands with the first client |
| QDS read OpenAPI | Specified (`schemas/openapi/qds.yaml`, task 0.2) |
| Import pipeline (Tanzil/QUL text, layout, wbw) | Done — `tools/pack-builder` (task 0.3) |
| `qds.*` reference tables | Done — 8 tables, migration `0001_qds` (task 0.3) |
| QDS endpoints | `get_verse`, `get_page` live; `get_word`, `get_audio_index` spec-only |
| Pack manifest schema | Defined (task 0.2) |
| `core-hafs` pack | Built and signed — `2026.07.0`, 4 items, 1.7 MiB (task 0.3) |
| `tools/pack-builder` | Created; owner resolved to the Backend Agent (§6.5) |
| Licensing registry | 5 entries (4 shipped in `core-hafs` + `timing:quran-align-1.0`) |
| Credits screen rendering | Not started (no client yet) |

Corpus as imported: **6236** verses, **77 429** words, **9046** layout lines
across 604 pages (15 per page, except the two framed opening pages at 8). The
9046 lines decompose as 8820 ayah lines + 114 surah-name lines + 112 basmallah
lines — an identity the layout golden gate asserts.
