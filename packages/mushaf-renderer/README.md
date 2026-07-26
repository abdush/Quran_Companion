# @qc/mushaf-renderer

Owner: **Renderer Agent** (`agents/renderer.md`).

Muṣḥaf page rendering: one layout core, two targets. If a page doesn't look like
the Madani muṣḥaf, or a tap lands on the wrong word, it's this package's bug.

**Phase 0 scope: static rendering only.** No selection, no highlight layers, no
playback sync, no tajwīd colouring. Hit-testing *is* here, because it is a
property of the layout rather than of the interaction, and it is checkable
against pack data today.

## Shape of the package

```
src/layout/     the core: pure, synchronous, platform-free
  types.ts        Rect / ComposedWord / ComposedLine / PageComposition
  metrics.ts      page geometry in design units (+ framed opening pages)
  measure.ts      TextMeasurer interface and the default approximation
  compose.ts      pack layout data → positioned boxes
  hit-test.ts     a point → a canonical word key
src/fonts/      per-page font loading and caching (web + native mechanics)
src/web/        <MushafPage/> in DOM elements
src/native/     <MushafPage/> in React Native primitives
```

```ts
import { createPageComposer } from '@qc/mushaf-renderer';
import { ComposedPage } from '@qc/mushaf-renderer/web';   // or /native

const composer = createPageComposer(pack, { fonts, labels });
<ComposedPage composition={composer.compose(42)} width={420} />;
```

`MushafPage` composes and renders in one step; for a scrolling reader hold a
composer and render `ComposedPage`, so pages are not recomposed on every render.

## Why composition is a separate, pure step

A `PageComposition` is a plain data description of one page: boxes in design
units, in reading order, each word carrying its canonical key. Nothing in it is
React, DOM, or platform-specific.

That buys three things that matter more than the indirection costs:

- **The two targets cannot drift.** They render the same numbers; the tests
  assert that every word's key, text and box match across web and native.
- **Layout is snapshottable** without a DOM, a simulator, or a screenshot
  pipeline.
- **Hit-testing is exact** — the same boxes that were rendered are the ones
  tested against, rather than a second, approximate model of them.

Coordinates are left-based and top-based on both platforms even though the
script runs right to left: RTL is expressed by *where the boxes are*, not by a
writing-direction flag two platforms would interpret differently.

## Layout decisions worth knowing

**Words are absolutely positioned, not flowed.** The muṣḥaf's line breaks are
part of what a memoriser knows by sight; letting a browser or RN reflow them
would destroy the page. The layout data decides which words are on which line;
the renderer only decides where they sit within it.

**Lines are fitted, and short lines are centred.** Per-page QPC fonts are cut so
each line fills the text column, so the default `fit` strategy scales a line
(font size included) until it does. A line that would need stretching beyond
`metrics.maxStretch` — the last line of a surah, typically — is centred at
nominal size instead, which is what the print does. `fitting: 'space'` widens
the gaps rather than the type, which suits a fallback face.

**Framed pages are modelled.** Pages 1–2 carry 8 lines in a visibly narrower
text block; `metricsForPage` gives them their own margins rather than stretching
a normal page.

**Ayah markers are composed, never selectable.** The end-of-ayah symbol is not a
word: it has no `word_position`, it is `aria-hidden` on web and
`accessible={false}` on native, and `hitTestPage` can never return it.

**Heading lines have no text of their own.** The pack ships the *structure* of
surah-name and basmallah lines but no glyphs for them (the muṣḥaf sets those in
a dedicated font). Supply `labels.surahName` / `labels.basmallah` to fill them;
without labels the renderer draws an empty frame rather than inventing a name.

## Measurement, and how exact this is

Composition needs one number per word: its advance width. That comes from a
`TextMeasurer`, and the default is a deliberate approximation — base letters
(after `stripTashkil`, since combining marks carry no advance) times a per-letter
advance. It is identical on every platform, which is what makes goldens possible.

Every measurer carries an `id` that is recorded in `PageComposition.measurer`, so
swapping one shows up in the snapshot diff instead of silently rewriting every
number.

The approximation is visible as slight per-line size variation, never as
overflow: `fit` scales each line to the column regardless of measurement error.
Exactness arrives with real metrics, and needs no change here —
`createTableMeasurer` takes a table of advance widths, which is the shape the
font pipeline will emit from the QPC fonts' own metrics.

## Font loading and caching

Authentic rendering uses the KFGQPC **per-page** fonts: one file per page, ~60–130 KB,
604 of them. That rules out loading them all, and rules out loading one lazily at
draw time. The strategy:

| Concern | Decision |
|---|---|
| Residency | Bounded LRU, `capacity` families (default 12 — a spread plus slack) |
| Visible pages | Pinned by `ensure(page)`, never evicted until `release(page)`; the two are paired |
| Neighbours | `neighbourPages(page)` → `[page, +1, -1, +2]`, warmed with `prefetch` |
| Duplicate requests | One in-flight load per page, shared by every caller |
| Not yet loaded | `fontFamilyFor` returns the **fallback family**, so a page renders immediately and sharpens when the font lands |
| Failure | Logged through `onError`, status `failed`, fallback family — never a blank page |
| Where bytes come from | The host: app assets today, pack items once the format ships them. **Never the network at render time** |

```ts
const fonts = createPageFontProvider({
  loader: createWebFontLoader(),            // or createNativeFontLoader({ loadAsync })
  sourceFor: (page) => ({ page, family: `qpc-page-${page}`, load: () => bytesFor(page) }),
});

await fonts.ensure(42);
fonts.prefetch(neighbourPages(42));
const composition = composePage(pack, { page: 42, fonts });
// …later, when the page leaves the viewport:
fonts.release(42);
```

Platform differences, stated rather than hidden:

- **Web** uses the CSS Font Loading API — `new FontFace(family, bytes)`, no
  `@font-face` URL and no network. `display: 'block'` is deliberate: a page
  rendered in the fallback and then reflowed into the real face is worse than a
  brief wait, because the line structure is the thing being read. Fonts *can* be
  unregistered, so the LRU genuinely reclaims memory.
- **React Native** loads through an injected `expo-font`-shaped `loadAsync`, so
  this package does not depend on Expo. RN **cannot unregister a font**:
  `canUnregister` is false and the LRU degrades to bounding how many fonts get
  loaded, which is still the part that costs. This is why the native side
  prefetches a narrow window.

**The packs do not ship fonts yet.** `core-hafs-2026.07.0` contains text, layout
and glosses only, so today every page composes with the fallback family. Adding a
font item to the pack format is an interface change; the RFC is drafted in
[`rfc/RFC-pack-font-items.md`](rfc/RFC-pack-font-items.md) and must be approved
through the ICP before anything here changes.

## Tests

```bash
pnpm --filter @qc/mushaf-renderer test
pnpm --filter @qc/mushaf-renderer typecheck
```

The renderer has **no fixtures of its own**: it opens `@qc/quran-core`'s sample
pack through the real reader, so pack-format drift surfaces here as a red test
rather than as a divergent copy of the data.

| Golden | What would break it |
|---|---|
| `compose.test.ts` | a word dropped, reordered, overflowing the page, or text taken from anywhere but the pack |
| `hit-test.test.ts` | the centre of any word's box no longer mapping back to that word — checked exhaustively for every word on the sampled pages |
| `targets.test.tsx` | web and native disagreeing about any word's geometry, or a layout snapshot moving |
| `fonts.test.ts` | a visible page being evicted, a font loading twice, a failure blanking a page |

Snapshots in `tests/__snapshots__/` are golden files under rule R8. A diff means
the rendered page moved; `vitest -u` is appropriate only once the move has been
understood and is being approved deliberately.

The React trees are rendered by a ~40-line helper (`tests/support/render.ts`)
that resolves the components and walks the result. Both page components are pure
and hook-free precisely so that this is possible — no DOM, no simulator, no
deprecated `react-test-renderer`, and the two targets stay directly comparable.
React Native itself is aliased to a two-line double: the contract this package
owns is the element tree, not RN's rendering of it.

## Visual harness

```bash
pnpm --filter @qc/mushaf-renderer harness
open packages/mushaf-renderer/harness/out/mushaf-pages.html
```

Renders pages 1, 2, 42 (Āyat al-Kursī) and 604 through the real web target into
one self-contained HTML file, with a checkbox that overlays every hit-test
rectangle. Snapshots prove the numbers did not move; this is how you check that
the page *looks* like a muṣḥaf. Remember that the type is the fallback face
until the fonts ship.

## Boundaries

- Depends on `@qc/quran-core` only. No app imports, no services, no schemas.
- Pack-format changes go through an ICP RFC (`agents/README.md`), never through
  an edit here.
- Deferred to Phase 1 and tracked in the playbook: selection and range APIs,
  highlight layers, playback sync (< 60 ms drift budget), the 604-page scroll
  benchmark, and tajwīd colour mode (Phase 2).
