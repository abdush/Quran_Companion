# tools/pack-builder

Owner: **Backend Agent** (`agents/backend.md`) — QDS import pipelines are a
Backend responsibility, and this tool is the build-time half of the Quran Data
Service (handbook §6.5). Created by task 0.3, which resolves the "Unassigned"
row left in `tools/README.md` by task 0.1.

Two jobs, one corpus:

1. **Import** upstream Quran datasets into the `qds.*` reference tables.
2. **Pack** the same normalised corpus into a signed, checksummed `.qpack`
   for offline clients (§6.3).

Both consume identical bytes, so a client and the API can never disagree about
what the data is.

## Usage

```bash
uv sync
uv run pack-builder fetch          # cache upstream downloads (~33 MB, once)
uv run pack-builder build          # normalise + run every gate
uv run pack-builder pack           # build and sign core-hafs-<version>.qpack
uv run pack-builder verify         # checksums, signature, licensing
uv run pack-builder load           # (re)load qds.* — needs QPACK_DATABASE_URL
uv run pack-builder check-licenses # the §6.4 gate on its own
```

Signing needs a key that never lives in the repo:

```bash
uv run pack-builder keygen                 # prints a seed, writes keys/dev-signing.pub
export QPACK_SIGNING_KEY=<printed seed>
```

| Variable | Purpose |
|---|---|
| `QPACK_SIGNING_KEY` / `QPACK_SIGNING_KEY_FILE` | Ed25519 seed (base64) used to sign manifests |
| `QPACK_SIGNING_KEY_NAME` | Which committed public key verifies (`dev` by default) |
| `QPACK_DATABASE_URL` | Sync SQLAlchemy URL for `load` |
| `QPACK_CACHE_DIR` / `QPACK_BUILD_DIR` / `QPACK_DIST_DIR` | Override working directories |

`.cache/`, `build/`, `dist/` and `.keys/` are gitignored.

## Datasets in `core-hafs`

| Item | Source | Role |
|---|---|---|
| `text:tanzil-uthmani-1.1` | Tanzil quran-uthmani | Checksummed canonical ayah text |
| `text:qpc-hafs` | QPC Ḥafṣ word text (KFGQPC, via QUL) | Word-level text; defines `word_position` |
| `layout:qpc-hafs-madani-604` | KFGQPC V1 Madani layout (via QUL) | Page/line placement of every word |
| `wbw:en` | QuranWBW English (via QUL) | Word-by-word gloss + transliteration |

Every one of these is registered in `schemas/licenses.json`; building with an
unregistered dataset fails before anything is written (§6.4, NFR-9).

### On the QUL source

QUL's bulk SQLite exports sit behind a sign-in, so the pipeline reads the same
curated datasets through the unauthenticated Quran Foundation API
(`api.quran.com/api/v4`), one request per muṣḥaf page. Switching to the QUL
exports once export credentials exist is a drop-in change to
`pack_builder/sources/qul.py` — everything downstream works from the normalised
corpus, not the transport.

## Two things the pipeline decides, and why

Both are recorded here because they are the only places the pipeline does more
than copy upstream data verbatim.

### 1. Layout errata (`fixtures/layout_errata.json`)

Upstream reports 25 canonically contiguous runs of words on the wrong page
(`line_number` is right, `page_number` is off by one). The defect is detectable
without knowing the fix: placements must be non-decreasing in `(page, line)` as
the canonical key increases, and these runs are the minimal set that violates
that.

The pipeline applies **only** the shifts listed in the errata file and aborts on
any violation not covered — it never invents a repair. It also aborts if a
listed shift has stopped being necessary, so the file cannot rot.

Corroboration that the recorded shifts are the right ones: after applying them,
the 604 pages hold exactly 9046 typeset lines, of which 8820 carry words and 226
are heading lines — precisely 114 surah-name lines plus 112 basmallah lines
(every surah but al-Fātiḥa and at-Tawba). Before them, that accounting is off by
three and three surahs are short a heading slot.

### 2. Ayah text vs. the basmallah

Tanzil's distribution carries the basmallah inside the text of ayah 1 for the
112 surahs that open with one. The muṣḥaf sets it as its own line and QPC word
positions do not include it, so `qds.verse.text_uthmani` has it removed and it
appears as a `basmallah` page line instead. The **pack payload** keeps Tanzil's
bytes verbatim, because the Tanzil terms permit redistribution only unmodified;
the golden checksum is taken over those verbatim bytes.

Tanzil and QPC then agree on word splitting everywhere except four ayat where
the muṣḥaf sets two words as one unit (2:181, 8:6, 13:37, 37:130). Those are
enumerated in `fixtures/tanzil_reference.json`; a fifth divergence fails the
build.

## Golden gates (§23, rule R8)

`pack-builder build` runs all three before writing anything, and
`tests/test_golden_data.py` runs them against the real corpus:

| Gate | Checks |
|---|---|
| Text checksums | Whole-corpus and per-surah SHA-256 against the pinned Tanzil reference |
| Word counts | Per-ayah counts against the pinned reference, against the loaded rows, and against an independent split of the Tanzil text |
| Layout row counts | 15 lines per page (8 on the two framed pages), 114 + 112 heading lines, every word placed exactly once, placements in recitation order |

Each gate has a companion test proving it *detects* the corresponding
corruption, so a gate cannot silently decay into a no-op.

`fixtures/tanzil_reference.json` is the expectation these gates measure against.
Regenerate it with `pack-builder freeze-reference` **only** after a change has
been understood, and review the diff — rewriting it to make a red gate pass is
exactly what rule R8 forbids.

The golden tests need the upstream cache; they fail rather than skip when it is
absent. Run `pack-builder fetch` first (CI should cache `.cache/`).

## Layout

```
pack_builder/
  config.py      dataset ids, sources, paths
  http.py        caching fetcher with retries
  sources/       tanzil.py, qul.py — one adapter per upstream family
  normalize.py   raw → Corpus: cross-validation, errata, heading reconstruction
  corpus.py      corpus model + canonical payload serialisation + checksums
  golden.py      the three gates
  validate.py    OpenAPI / pack-manifest / licensing validation
  load.py        truncate-and-reload of qds.*
  pack.py        .qpack assembly and verification
  signing.py     Ed25519 manifest signing
  cli.py         pack-builder <command>
```
