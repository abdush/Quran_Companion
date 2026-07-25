#!/usr/bin/env node
/**
 * Schema → TypeScript codegen (Task 0.2, Rule R1: schemas first, code second).
 *
 * Sources (schemas/):            Outputs (packages/api-client/src/generated/):
 *   openapi/qds.yaml          →    qds.ts
 *   events/*.json             →    events.ts
 *   packs/manifest.schema.json →   packs.ts
 *   licenses.schema.json      →    licenses.ts
 *
 * `--check` regenerates in-memory and exits 1 if committed output differs.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';
import { compile } from 'json-schema-to-typescript';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const schemasDir = path.join(repoRoot, 'schemas');
const outDir = path.join(repoRoot, 'packages', 'api-client', 'src', 'generated');
const checkMode = process.argv.includes('--check');

const header = (source) =>
  `/**\n * GENERATED FILE — DO NOT EDIT.\n * Source: ${source}\n * Regenerate: pnpm --dir tools/codegen generate\n */\n\n`;

const compileOptions = {
  additionalProperties: false,
  bannerComment: '',
  cwd: '', // set per call so relative $refs resolve
  style: { singleQuote: true },
};

async function generateOpenApi() {
  const source = path.join(schemasDir, 'openapi', 'qds.yaml');
  const ast = await openapiTS(new URL(`file://${source}`), { exportType: true });
  return header('schemas/openapi/qds.yaml') + astToString(ast);
}

async function generateEvents() {
  const eventsDir = path.join(schemasDir, 'events');
  const files = (await readdir(eventsDir)).filter((f) => f.endsWith('.json')).sort();
  let out = header('schemas/events/*.json');
  for (const file of files) {
    const schema = JSON.parse(await readFile(path.join(eventsDir, file), 'utf8'));
    out += await compile(schema, schema.title, { ...compileOptions, cwd: eventsDir });
    out += '\n';
  }
  return out;
}

async function generateSingle(relPath) {
  const source = path.join(schemasDir, relPath);
  const schema = JSON.parse(await readFile(source, 'utf8'));
  const body = await compile(schema, schema.title, {
    ...compileOptions,
    cwd: path.dirname(source),
  });
  return header(`schemas/${relPath}`) + body;
}

const outputs = {
  'qds.ts': await generateOpenApi(),
  'events.ts': await generateEvents(),
  'packs.ts': await generateSingle('packs/manifest.schema.json'),
  'licenses.ts': await generateSingle('licenses.schema.json'),
};

if (checkMode) {
  const stale = [];
  for (const [name, content] of Object.entries(outputs)) {
    const target = path.join(outDir, name);
    const committed = existsSync(target) ? await readFile(target, 'utf8') : null;
    if (committed !== content) stale.push(name);
  }
  if (stale.length > 0) {
    console.error(
      `Stale generated types: ${stale.join(', ')}\n` +
        'schemas/ changed without regenerating packages/api-client (Rule R1).\n' +
        'Run: pnpm --dir tools/codegen generate  — and commit the result.'
    );
    process.exit(1);
  }
  console.log('Generated types are up to date.');
} else {
  await mkdir(outDir, { recursive: true });
  for (const [name, content] of Object.entries(outputs)) {
    await writeFile(path.join(outDir, name), content);
    console.log(`wrote packages/api-client/src/generated/${name}`);
  }
}
