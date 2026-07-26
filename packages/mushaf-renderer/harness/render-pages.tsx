/**
 * Visual harness: render a sampled page set to one self-contained HTML file.
 *
 *     pnpm --filter @qc/mushaf-renderer harness
 *     open harness/out/mushaf-pages.html
 *
 * Snapshots prove the numbers did not move; this proves the page *looks* like a
 * muṣḥaf, which no assertion can. It renders through the real web target and
 * the real pack reader — nothing here is a mock, and nothing is fetched.
 *
 * Two things you are looking at, and should judge:
 *
 * 1. **Line structure** — 15 lines (8 on the framed opening pages), surah-name
 *    and basmallah lines in the right places, ayah markers after the right
 *    words, the last line of a surah centred rather than stretched.
 * 2. **Typography** — this is the *fallback* face, not the KFGQPC per-page
 *    fonts, which the pack does not yet ship (see the RFC in `rfc/`). Word
 *    shapes and widths will change when it does; positions come from the layout
 *    data and will not.
 *
 * The word-box overlay (checkbox at the top) draws every hit-test rectangle, so
 * a mismatch between where a word is drawn and where it can be tapped is
 * visible rather than theoretical.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';

import { openPack, trustedKeyFromPem, type QuranPack } from '@qc/quran-core';

import { createPageComposer } from '../src/index.js';
import { ComposedPage } from '../src/web/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const CORE_FIXTURES = resolve(PACKAGE_ROOT, '..', 'quran-core', 'tests', 'fixtures');
const OUT_DIR = join(HERE, 'out');

/** Opening spread, Āyat al-Kursī, and the last page. */
const PAGES = [1, 2, 42, 604];

const CAPTIONS: Record<number, string> = {
  1: 'Page 1 — al-Fātiḥa, framed opening page (8 lines)',
  2: 'Page 2 — al-Baqara opens: surah-name line, basmallah line, 8 framed lines',
  42: 'Page 42 — contains Āyat al-Kursī (2:255), a dense 15-line page',
  604: 'Page 604 — the last page: four short surahs, several centred final lines',
};

/**
 * A face the harness machine is likely to have. The composition asks for
 * whatever family the font provider names, so pointing it at a system Arabic
 * stack is all it takes to preview without the per-page fonts.
 */
const FALLBACK_STACK =
  "'Amiri Quran', 'Amiri', 'Scheherazade New', 'Noto Naskh Arabic', 'Traditional Arabic', serif";

async function loadPack(): Promise<QuranPack> {
  const bytes = new Uint8Array(readFileSync(join(CORE_FIXTURES, 'sample-hafs-2026.07.0.qpack')));
  return openPack(bytes, {
    trustedKeys: [
      trustedKeyFromPem(
        'fixture',
        readFileSync(join(CORE_FIXTURES, 'fixture-signing.pub'), 'utf-8'),
      ),
    ],
  });
}

const STYLES = `
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    padding: 24px;
    font: 14px/1.5 system-ui, sans-serif;
    background: #f4f1ea;
    color: #23201b;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #14120f; color: #ece7dd; }
    .page { background: #1d1a16 !important; border-color: #3a3229 !important; }
  }
  header { max-width: 1200px; margin: 0 auto 20px; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  p { margin: 0 0 6px; max-width: 70ch; }
  .pages { display: flex; flex-wrap: wrap; gap: 28px; justify-content: center; }
  figure { margin: 0; }
  figcaption { font-size: 12px; opacity: 0.75; margin-top: 8px; text-align: center; max-width: 420px; }
  .page {
    background: #fffdf7;
    border: 1px solid #d9d0bd;
    border-radius: 6px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  }
  /* The overlay draws the hit-test rectangles the layout core produced. */
  body.boxes [data-kind='word'] { outline: 1px solid rgba(190, 60, 60, 0.5); }
  body.boxes [data-kind='ayah-marker'] { outline: 1px solid rgba(60, 120, 190, 0.5); }
  body.boxes [data-line] { outline: 1px dashed rgba(60, 160, 120, 0.45); }
  label { user-select: none; cursor: pointer; }
`;

async function main(): Promise<void> {
  const pack = await loadPack();
  const composer = createPageComposer(pack, {
    fonts: { fontFamilyFor: () => FALLBACK_STACK },
  });

  const figures = PAGES.map((page) => {
    const composition = composer.compose(page);
    const markup = renderToStaticMarkup(
      <ComposedPage composition={composition} width={420} className="page" />,
    );
    return `<figure>${markup}<figcaption>${CAPTIONS[page] ?? `Page ${page}`}</figcaption></figure>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Muṣḥaf renderer harness — pages ${PAGES.join(', ')}</title>
<style>${STYLES}</style>
</head>
<body>
<header>
  <h1>@qc/mushaf-renderer — static page harness</h1>
  <p>
    Composed from <code>${pack.packId}-${pack.version}</code> through the real pack reader and
    the web target. Text is the pack's; positions come from the QUL layout data.
  </p>
  <p>
    <strong>Typography is the fallback face.</strong> The KFGQPC per-page fonts are not in the
    pack yet, so word shapes and widths are approximate — line structure and word order are not.
  </p>
  <p><label><input type="checkbox" id="boxes"> Show word and line boxes (the hit-test rectangles)</label></p>
</header>
<main class="pages">
${figures}
</main>
<script>
  document.getElementById('boxes').addEventListener('change', (event) => {
    document.body.classList.toggle('boxes', event.target.checked);
  });
</script>
</body>
</html>
`;

  mkdirSync(OUT_DIR, { recursive: true });
  const target = join(OUT_DIR, 'mushaf-pages.html');
  writeFileSync(target, html);
  console.log(`wrote ${target} (${PAGES.length} pages)`);
}

await main();
