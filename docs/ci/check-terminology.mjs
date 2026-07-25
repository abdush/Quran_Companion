#!/usr/bin/env node
// Terminology consistency check (agents/documentation.md standing constraint).
//
// The error-taxonomy names (handbook §13.3) and the seeded annotation category
// names (FR-AN-2: حفظ، تجويد، وقف وابتداء) must be spelled identically in UI
// strings, docs, API enums, event schemas, and database enums. This check reads
// docs/ci/terminology.json and fails on any variant spelling.
//
// Usage:
//   node docs/ci/check-terminology.mjs [--json] [--verbose]
//
// Suppression (for docs that must quote a wrong spelling, e.g. the style guide):
//   ... on one line:   <!-- terminology-ignore-line -->  or  terminology-ignore-line
//   ... for a region:  <!-- terminology-ignore-start --> … <!-- terminology-ignore-end -->
// Suppression is an authoring affordance for showing counter-examples; it is not
// a way to land an inconsistent identifier (Rule R4 in spirit).

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const CONFIG = resolve(HERE, 'terminology.json');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const verbose = args.includes('--verbose');

const ARABIC_LETTER = '\\u0621-\\u064A';
const ARABIC_MARK = '\\u064B-\\u065F\\u0670\\u0640'; // harakat, dagger alif, tatweel
const ARABIC_LETTER_CLASSES = {
  'ا': '[اأإآٱ]', // alef family
  'ي': '[يى]', // ya / alef maqsura
  'ه': '[هة]', // ha / ta marbuta
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Diacritics and tatweel are a rendering choice, not a different term: حِفْظ and حفظ
// are the same word. Spacing, hyphenation, and letter choice (hamza forms) are not.
const stripArabicMarks = (s) => s.replace(new RegExp(`[${ARABIC_MARK}]`, 'g'), '');

function globToRegExp(glob) {
  let out = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') out += '[^/]';
    else out += escapeRe(c);
  }
  return new RegExp(out + '$');
}

function latinPattern(canonical) {
  const parts = canonical.split('_').map(escapeRe);
  return new RegExp(`(?<![A-Za-z0-9])${parts.join('[\\s_\\-]*')}(?![A-Za-z0-9])`, 'gi');
}

function arabicPattern(canonical) {
  // One atom per letter, joined by an optional separator, so spacing variants
  // ("وقف و ابتداء", "وقفوابتداء", "وقف-وابتداء") are caught. The separator is
  // only ever *between* atoms, so a match never swallows trailing whitespace.
  const atoms = [];
  for (const ch of canonical) {
    if (/\s/.test(ch)) continue;
    atoms.push((ARABIC_LETTER_CLASSES[ch] ?? escapeRe(ch)) + `[${ARABIC_MARK}]*`);
  }
  const body = atoms.join('[\\s_\\-]*');
  return new RegExp(`(?<![${ARABIC_LETTER}])${body}(?![${ARABIC_LETTER}])`, 'g');
}

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const excludes = (config.scan.exclude ?? []).map(globToRegExp);
const extensions = new Set(config.scan.extensions);

const terms = config.terms.map((t) => ({
  ...t,
  arabic: t.script === 'arabic',
  re: t.script === 'arabic' ? arabicPattern(t.canonical) : latinPattern(t.canonical),
}));
const forbidden = (config.forbidden ?? []).map((f) => ({
  ...f,
  re: new RegExp(escapeRe(f.pattern), 'gi'),
}));

// Tracked files plus new, non-ignored files, so the check is meaningful before
// the first commit of a branch as well as in CI.
const trackedFiles = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { cwd: REPO, encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
  .filter((f) => extensions.has(extname(f)))
  .filter((f) => !excludes.some((re) => re.test(f)));

/** Returns the parts of a markdown line that are code (inline spans or fenced). */
function codeSpans(line, inFence) {
  if (inFence) return [line];
  const spans = [];
  for (const m of line.matchAll(/`+([^`]*)`+/g)) spans.push(m[1]);
  return spans;
}

const violations = [];
const counts = new Map();

for (const file of trackedFiles) {
  const isMarkdown = extname(file) === '.md';
  let text;
  try {
    text = readFileSync(resolve(REPO, file), 'utf8');
  } catch {
    continue; // deleted or unreadable in this checkout
  }
  if (!text) continue;

  let inFence = false;
  let ignoring = false;
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/terminology-ignore-start/.test(line)) ignoring = true;
    if (/terminology-ignore-end/.test(line)) {
      ignoring = false;
      continue;
    }
    const fenceToggle = isMarkdown && /^\s*(```|~~~)/.test(line);
    const lineIsCodeFenceMarker = fenceToggle;
    if (ignoring || /terminology-ignore-line/.test(line)) {
      if (fenceToggle) inFence = !inFence;
      continue;
    }

    // Latin terms in markdown are only checked inside code spans/fences: prose may
    // legitimately read "a similar-verse jump"; an identifier may not.
    const latinTargets = isMarkdown
      ? lineIsCodeFenceMarker
        ? []
        : codeSpans(line, inFence)
      : [line];

    for (const term of terms) {
      const targets = term.arabic ? [line] : latinTargets;
      for (const target of targets) {
        term.re.lastIndex = 0;
        for (const m of target.matchAll(term.re)) {
          const literal = m[0];
          const ok = term.arabic
            ? stripArabicMarks(literal) === term.canonical
            : literal === term.canonical || literal.toLowerCase() === term.canonical;
          counts.set(term.canonical, (counts.get(term.canonical) ?? 0) + 1);
          if (!ok) {
            violations.push({
              file,
              line: i + 1,
              found: literal,
              expected: term.canonical,
              kind: term.kind,
              rule: 'variant-spelling',
            });
          }
        }
      }
    }

    for (const f of forbidden) {
      f.re.lastIndex = 0;
      for (const m of line.matchAll(f.re)) {
        violations.push({
          file,
          line: i + 1,
          found: m[0],
          expected: f.instead,
          kind: 'forbidden',
          rule: 'forbidden-spelling',
        });
      }
    }

    if (fenceToggle) inFence = !inFence;
  }
}

// Deduplicate overlapping forbidden matches on the same line.
const seen = new Set();
const unique = violations.filter((v) => {
  const key = `${v.file}:${v.line}:${v.found}:${v.expected}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

if (asJson) {
  console.log(JSON.stringify({ violations: unique, scanned: trackedFiles.length }, null, 2));
} else {
  if (verbose) {
    console.log(`Scanned ${trackedFiles.length} tracked files.`);
    for (const t of terms) {
      console.log(`  ${t.canonical.padEnd(14)} ${counts.get(t.canonical) ?? 0} occurrence(s)`);
    }
  }
  if (unique.length === 0) {
    console.log(`✅ terminology: ${trackedFiles.length} files scanned, no variant spellings.`);
  } else {
    console.error(`❌ terminology: ${unique.length} inconsistent spelling(s).\n`);
    for (const v of unique) {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`      found:    ${v.found}`);
      console.error(`      expected: ${v.expected}   (${v.kind})`);
    }
    console.error(
      [
        '',
        'Canonical names: docs/STYLEGUIDE.md §4 (machine list: docs/ci/terminology.json).',
        'These names are shared by API enums, event schemas, DB enums, UI strings and',
        'analytics — a variant here becomes a data inconsistency later. Fix the spelling;',
        'adding or renaming a canonical term requires an Interface Change Protocol RFC.',
        'To quote a wrong spelling deliberately in docs, wrap it in',
        '<!-- terminology-ignore-start --> / <!-- terminology-ignore-end -->.',
      ].join('\n'),
    );
  }
}

process.exit(unique.length === 0 ? 0 : 1);
