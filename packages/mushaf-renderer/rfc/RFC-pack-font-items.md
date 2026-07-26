# RFC: pack format — font items (per-page QPC fonts)

**Status:** draft, not yet filed
**Raised by:** Renderer Agent (task 0.4)
**Consumers to tag:** Architecture (owns `schemas/`), Backend (owns
`tools/pack-builder`), Mobile, Frontend, DevOps (pack size / CDN)
**Affects:** `schemas/packs/manifest.schema.json`, `schemas/licenses.json`,
`tools/pack-builder`, `@qc/quran-core` (reader), `@qc/mushaf-renderer` (fonts)

Per the Interface Change Protocol (`agents/README.md`), this is written up here
rather than acted on: the Renderer Agent does not edit `schemas/`. File it as an
issue titled `RFC: pack manifest — font items` before any of the work below
starts.

## Problem

Authentic Madani rendering uses the KFGQPC **per-page** fonts: one font file per
page, cut so each page's lines fill the text column exactly. Both the layout core
and the font cache in `@qc/mushaf-renderer` are built for them —
`PageFontSource`, the LRU, `fontFamilyFor`, the `fit` line strategy — but
`core-hafs-2026.07.0` ships **text, layout and glosses only**. There is nowhere
in the pack for a font to live.

Consequences today:

1. Every page renders in a fallback face. Word *positions* come from the layout
   data and are right; word *shapes and widths* are approximate.
2. Word advance widths have to be approximated (`createLetterCountMeasurer`)
   rather than read from the font's own metrics, so each line is scaled slightly
   to fit instead of fitting exactly.
3. Offline reading is only partly offline: the app must ship or fetch 604 font
   files through some other channel, outside the signed, checksummed,
   licence-registered pack mechanism that exists precisely for this.

## Why it needs a format change rather than a workaround

A dataset item currently serialises to **exactly one payload file** whose SHA-256
is the manifest checksum (`tools/pack-builder/pack_builder/corpus.py`). 604 font
files do not fit that shape. Any workaround — a side-loaded font bundle, an
app-asset directory, a second archive — puts the fonts outside the signature and
the licensing registry, which is the one property the pack format exists to
provide (§6.3, NFR-1, §6.4).

## Sketch of the change

Deliberately a sketch: the shape is Architecture's call.

1. **A `font:` item kind**, e.g. `font:qpc-hafs-v1-pages`, declared in
   `contents` and covered by `checksums` like any other item.
2. **A container payload for multi-file items.** One tar/zip payload per item
   whose SHA-256 is still the single manifest checksum, plus an index the reader
   can use to find the member for a page. This keeps the "one item, one digest"
   invariant intact and generalises beyond fonts (audio segments will want it).
3. **A metrics side-item** (or a member of the same container) carrying per-glyph
   advance widths, so `createTableMeasurer` can replace the approximation and
   layout becomes exact.
4. **Registry entries** in `schemas/licenses.json` for the KFGQPC fonts, with
   their redistribution terms — the §6.4 gate must pass before any pack can
   reference them.

Alternative worth weighing: keep fonts out of `core-hafs` and ship them as a
separate optional pack (`fonts-qpc-hafs-v1`), so the core pack stays ~1.7 MiB and
the ~40 MB of fonts is a deliberate download. This still needs items 1–4; it only
changes which artifact carries them.

## What the renderer will do when it lands

Nothing in `layout/` changes. `sourceFor(page)` starts resolving from pack bytes
instead of app assets, `createTableMeasurer` replaces the default measurer, and
the `fit` strategy stops compensating for measurement error. The
`PageFontSource` / `FontLoader` interfaces were written for exactly this
substitution.

## Until then

- The default measurer and the `fit` line strategy keep pages structurally
  correct with any face.
- The harness states plainly that the type is a fallback.
- No renderer code assumes fonts are absent — only that they may be.

## Not part of this RFC

Payload file naming. The reader matches payloads to items **by digest**, not by
name (`packages/quran-core/src/pack/reader.ts`), so the builder's file-name table
is not an interface and no schema change is needed for it.
