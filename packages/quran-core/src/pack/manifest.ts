/**
 * Runtime validation of a pack manifest against the shape declared by
 * `schemas/packs/manifest.schema.json`.
 *
 * The *type* comes from `@qc/api-client`, which is generated from that schema —
 * so the compiler catches a drifting shape and this module catches a drifting
 * payload. Schemas change first, code second (rule R1): if a pack needs a field
 * that is not here, that is an ICP RFC, not an edit to this file.
 *
 * This is deliberately a hand-written checker rather than a bundled JSON-Schema
 * validator: it runs on every pack open, on device, and pulling ajv into the RN
 * bundle to re-check ten fields is not a trade worth making.
 */

import type { PackManifest } from '@qc/api-client';
import { PackError } from '../errors.js';

export type { PackManifest };

/** Highest `manifest_version` this reader understands. */
export const SUPPORTED_MANIFEST_VERSION = 1;

const PACK_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_RE = /^[0-9]{4}\.[0-9]{2}\.[0-9]+$/;
const ITEM_ID_RE = /^[a-z]+:[a-z0-9._-]+$/;
const CHECKSUM_RE = /^sha256:[a-f0-9]{64}$/;
const SIGNATURE_RE = /^ed25519:[A-Za-z0-9+/=]+$/;

const ALLOWED_KEYS = new Set([
  'manifest_version',
  'pack_id',
  'version',
  'contents',
  'checksums',
  'licenses',
  'signature',
]);

function malformed(message: string): never {
  throw new PackError('malformed-manifest', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate `value` as a manifest and narrow it.
 *
 * Version handling is split on purpose: an *unknown* `manifest_version` is
 * `unsupported-manifest-version` (this reader is too old — a client should say
 * "update the app"), while a known version with a bad shape is
 * `malformed-manifest` (the pack is broken — refuse it).
 */
export function validateManifest(value: unknown): PackManifest {
  if (!isRecord(value)) malformed('manifest is not a JSON object');

  const version = value['manifest_version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    malformed(`manifest_version is not a positive integer: ${JSON.stringify(version)}`);
  }
  if (version > SUPPORTED_MANIFEST_VERSION) {
    throw new PackError(
      'unsupported-manifest-version',
      `pack declares manifest_version ${version}; this reader supports ` +
        `${SUPPORTED_MANIFEST_VERSION}`,
    );
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) malformed(`unexpected manifest field: ${key}`);
  }
  for (const key of ALLOWED_KEYS) {
    // A missing `signature` is reported as `unsigned` below: the schema does
    // require the field, but "this pack is not signed" is the answer a client
    // needs to hear, and it is the same refusal either way.
    if (key !== 'signature' && !(key in value)) malformed(`manifest is missing ${key}`);
  }

  const packId = value['pack_id'];
  if (typeof packId !== 'string' || !PACK_ID_RE.test(packId)) {
    malformed(`pack_id is not a slug: ${JSON.stringify(packId)}`);
  }

  const packVersion = value['version'];
  if (typeof packVersion !== 'string' || !VERSION_RE.test(packVersion)) {
    malformed(`version is not CalVer YYYY.0M.MICRO: ${JSON.stringify(packVersion)}`);
  }

  const contents = value['contents'];
  if (!Array.isArray(contents) || contents.length === 0) {
    malformed('contents must be a non-empty array');
  }
  const seen = new Set<string>();
  for (const item of contents) {
    if (typeof item !== 'string' || !ITEM_ID_RE.test(item)) {
      malformed(`contents holds a malformed item id: ${JSON.stringify(item)}`);
    }
    if (seen.has(item)) malformed(`contents lists ${item} twice`);
    seen.add(item);
  }

  const checksums = value['checksums'];
  if (!isRecord(checksums)) malformed('checksums must be an object');
  for (const [item, digest] of Object.entries(checksums)) {
    if (!ITEM_ID_RE.test(item)) {
      malformed(`checksums holds a malformed item id: ${JSON.stringify(item)}`);
    }
    if (typeof digest !== 'string' || !CHECKSUM_RE.test(digest)) {
      malformed(`checksum for ${item} is not sha256:<64 hex>: ${JSON.stringify(digest)}`);
    }
  }

  const licenses = value['licenses'];
  if (!Array.isArray(licenses)) malformed('licenses must be an array');
  for (const declaration of licenses) {
    if (!isRecord(declaration)) malformed('licenses holds a non-object entry');
    for (const key of Object.keys(declaration)) {
      if (!['item', 'license', 'attribution'].includes(key)) {
        malformed(`unexpected licenses field: ${key}`);
      }
    }
    for (const key of ['item', 'license', 'attribution'] as const) {
      const field = declaration[key];
      if (typeof field !== 'string' || field.length === 0) {
        malformed(`licenses entry is missing a non-empty ${key}`);
      }
    }
    if (!ITEM_ID_RE.test(declaration['item'] as string)) {
      malformed(`licenses holds a malformed item id: ${JSON.stringify(declaration['item'])}`);
    }
  }

  // Shape only — whether it *verifies* is decided by `checkManifestSignature`.
  const signature = value['signature'];
  if (typeof signature !== 'string' || !SIGNATURE_RE.test(signature)) {
    throw new PackError(
      'unsigned',
      'manifest carries no ed25519:<base64> signature — refused',
    );
  }

  return value as unknown as PackManifest;
}

/**
 * `checksums` must cover exactly `contents`: an item without a digest could not
 * be verified, and a digest without an item is a payload nobody declared.
 */
export function assertChecksumsCoverContents(manifest: PackManifest): void {
  const declared = new Set<string>(manifest.contents);
  const checksummed = new Set(Object.keys(manifest.checksums));
  const missing = [...declared].filter((item) => !checksummed.has(item)).sort();
  const extra = [...checksummed].filter((item) => !declared.has(item)).sort();
  if (missing.length > 0 || extra.length > 0) {
    throw new PackError(
      'checksums-incomplete',
      `checksums do not cover contents: missing [${missing.join(', ')}], ` +
        `extra [${extra.join(', ')}]`,
    );
  }
}

/**
 * Every content item must carry a licence declaration (§6.4). The registry
 * itself (`schemas/licenses.json`) is a build-time gate; on device we can still
 * insist that the pack tells us what it is redistributing and under what terms,
 * because the About screen has to render exactly that.
 */
export function assertLicensesCoverContents(manifest: PackManifest): void {
  const declared = new Set(manifest.licenses.map((entry) => entry.item));
  const undeclared = manifest.contents.filter((item) => !declared.has(item)).sort();
  if (undeclared.length > 0) {
    throw new PackError(
      'missing-license',
      `no licence declaration for [${undeclared.join(', ')}]`,
    );
  }
}
