#!/usr/bin/env node
// Docs-freshness check (agents/documentation.md; universal rule R5).
//
// Fails a PR whose diff touches an interface — schemas/openapi, schemas/events,
// pack/licensing schemas, prompts, or a packages/* public API — without touching
// the corresponding docs/*.md. Rules live in docs/ci/freshness.json.
//
// Usage:
//   node docs/ci/check-docs-freshness.mjs --base origin/main --head HEAD
//   node docs/ci/check-docs-freshness.mjs --files changed.txt   # one path per line
//   node docs/ci/check-docs-freshness.mjs --files -             # read paths from stdin
//
// Escape hatch: a commit in the range carrying a `Docs-Exempt: <reason>` trailer
// (or DOCS_EXEMPT=<reason> in the environment) reports the exemption and passes.
// Exemptions are visible in review; they are for changes with no contract impact
// (typo in a description, formatting), never for landing an undocumented change.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const CONFIG = resolve(HERE, 'freshness.json');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const git = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const matches = (file, globs) => globs.some((g) => globToRegExp(g).test(file));

function changedFiles() {
  const filesArg = arg('--files');
  if (filesArg) {
    const raw =
      filesArg === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(process.cwd(), filesArg), 'utf8');
    return raw.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  const base = arg('--base', 'origin/main');
  const head = arg('--head', 'HEAD');
  let range;
  try {
    range = `${git(['merge-base', base, head])}..${head}`;
  } catch {
    console.error(`docs-freshness: cannot resolve merge-base of '${base}' and '${head}'.`);
    console.error('In CI, check out with fetch-depth: 0 so both refs are present.');
    process.exit(2);
  }
  return git(['diff', '--name-only', range]).split('\n').filter(Boolean);
}

function exemption() {
  if (process.env.DOCS_EXEMPT) return process.env.DOCS_EXEMPT;
  if (arg('--files')) return null; // no commit range to inspect
  const base = arg('--base', 'origin/main');
  const head = arg('--head', 'HEAD');
  try {
    const log = git(['log', '--format=%B', `${git(['merge-base', base, head])}..${head}`]);
    const m = log.match(/^\s*Docs-Exempt:\s*(.+)$/im);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const files = changedFiles();
const touched = new Set(files);
const ignored = config.ignore ?? [];
const interfaceFiles = files.filter((f) => !matches(f, ignored));

const failures = [];

for (const rule of config.rules) {
  const triggers = interfaceFiles.filter((f) => matches(f, rule.when));
  if (triggers.length === 0) continue;

  if (rule.perPackage) {
    const byPackage = new Map();
    for (const f of triggers) {
      const pkg = f.split('/')[1];
      if (!byPackage.has(pkg)) byPackage.set(pkg, []);
      byPackage.get(pkg).push(f);
    }
    for (const [pkg, pkgFiles] of byPackage) {
      const docs = rule.packageDocs?.[pkg] ?? rule.defaultDocs ?? [];
      if (docs.some((d) => touched.has(d))) continue;
      failures.push({ rule: `${rule.id} (${pkg})`, triggers: pkgFiles, docs, guidance: rule.guidance });
    }
    continue;
  }

  const docs = rule.requireAnyOf ?? [];
  if (docs.some((d) => touched.has(d))) continue;
  failures.push({ rule: rule.id, triggers, docs, guidance: rule.guidance });
}

const exempt = exemption();

if (failures.length === 0) {
  console.log(
    `✅ docs-freshness: ${files.length} changed file(s), ${interfaceFiles.length} interface-relevant, all documented.`,
  );
  process.exit(0);
}

if (exempt) {
  console.log(`⚠️  docs-freshness: ${failures.length} rule(s) unmet, exempted.`);
  console.log(`   Docs-Exempt: ${exempt}`);
  for (const f of failures) console.log(`   - ${f.rule}: ${f.triggers.join(', ')}`);
  console.log('   Exemptions are reviewable — a reviewer may still ask for the doc update.');
  process.exit(0);
}

console.error(`❌ docs-freshness: interface changed without a matching doc update (rule R5).\n`);
for (const f of failures) {
  console.error(`  ${f.rule}`);
  console.error(`      changed: ${f.triggers.join('\n               ')}`);
  console.error(`      update any of: ${f.docs.join(', ')}`);
  console.error(`      why: ${f.guidance}\n`);
}
console.error(
  [
    'Interface-affecting changes update the relevant docs/*.md in the same PR',
    '(agents/README.md rule R5; docs/CONTRIBUTING.md §5).',
    '',
    'If this change genuinely has no contract impact, add a trailer to a commit:',
    '  Docs-Exempt: <reason>',
  ].join('\n'),
);
process.exit(1);
