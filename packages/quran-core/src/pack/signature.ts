/**
 * Ed25519 verification of pack manifests (§6.3 — clients refuse unsigned packs,
 * NFR-1). Verification only: nothing in a client ever signs.
 *
 * The signature covers the *canonical manifest bytes*: the manifest as compact,
 * recursively key-sorted JSON with the `signature` field removed. Because the
 * manifest carries a SHA-256 for every payload, signing it transitively covers
 * the whole pack — so a verified manifest plus matching digests is the whole
 * trust chain.
 *
 * The canonical form must be byte-identical to the producer's
 * (`tools/pack-builder/pack_builder/signing.py`, which uses
 * `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)`).
 * `JSON.stringify` agrees with that on escaping — both escape only `"`, `\` and
 * C0 controls, and both emit non-ASCII verbatim — so only key ordering has to be
 * imposed here. `tests/signature.test.ts` pins the bytes against a manifest
 * produced by the Python signer.
 */

import { hashes, verify as ed25519Verify } from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// @noble/ed25519 ships without a hash implementation so it can stay dependency
// free; wiring it here (rather than in an app bootstrap) means the pack reader
// verifies on any runtime — Node, browser, Hermes — with no host crypto and no
// setup step a client could forget.
hashes.sha512 = sha512;

export const SIGNATURE_PREFIX = 'ed25519:';

/** DER prefix of an Ed25519 SubjectPublicKeyInfo, followed by the 32 raw bytes. */
const SPKI_ED25519_PREFIX = Uint8Array.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

/** A public key a client is willing to accept packs from. */
export interface TrustedKey {
  /** Key name, e.g. `dev` or `release-2026`; reported in errors. */
  readonly name: string;
  /** Raw 32-byte Ed25519 public key. */
  readonly publicKey: Uint8Array;
}

export class SignatureFormatError extends Error {
  override readonly name = 'SignatureFormatError';
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

function canonicalise(value: unknown): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, JsonValue> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = canonicalise(source[key]);
    }
    return sorted;
  }
  return value as JsonValue;
}

/** Deterministic bytes to verify: sorted keys, no whitespace, no `signature`. */
export function canonicalManifestBytes(manifest: Record<string, unknown>): Uint8Array {
  const withoutSignature: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(manifest)) {
    if (key !== 'signature') withoutSignature[key] = value;
  }
  return new TextEncoder().encode(JSON.stringify(canonicalise(withoutSignature)));
}

export function decodeBase64(value: string): Uint8Array {
  // atob is present in Node >= 16, every browser, and Hermes/JSC via RN 0.74+.
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Parse a PEM `PUBLIC KEY` block (the form `pack-builder keygen` writes) into
 * the raw 32-byte Ed25519 key.
 */
export function publicKeyFromPem(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '');
  if (body.length === 0) throw new SignatureFormatError('not a PEM public key block');
  const der = decodeBase64(body);
  if (der.length !== SPKI_ED25519_PREFIX.length + 32) {
    throw new SignatureFormatError(
      `not an Ed25519 SubjectPublicKeyInfo: ${der.length} bytes`,
    );
  }
  for (let i = 0; i < SPKI_ED25519_PREFIX.length; i += 1) {
    if (der[i] !== SPKI_ED25519_PREFIX[i]) {
      throw new SignatureFormatError('SubjectPublicKeyInfo is not Ed25519');
    }
  }
  return der.slice(SPKI_ED25519_PREFIX.length);
}

export function trustedKeyFromPem(name: string, pem: string): TrustedKey {
  return { name, publicKey: publicKeyFromPem(pem) };
}

export type SignatureCheck =
  | { readonly ok: true; readonly key: TrustedKey }
  | { readonly ok: false; readonly reason: 'unsigned' | 'untrusted-key' | 'bad-signature' };

/**
 * Check a manifest signature against the keys a client trusts.
 *
 * An empty trust list is *not* a way to skip verification: it yields
 * `untrusted-key`, so a misconfigured client refuses every pack rather than
 * accepting every pack.
 */
export function checkManifestSignature(
  manifest: Record<string, unknown>,
  trustedKeys: readonly TrustedKey[],
): SignatureCheck {
  const signature = manifest['signature'];
  if (typeof signature !== 'string' || !signature.startsWith(SIGNATURE_PREFIX)) {
    return { ok: false, reason: 'unsigned' };
  }

  let raw: Uint8Array;
  try {
    raw = decodeBase64(signature.slice(SIGNATURE_PREFIX.length));
  } catch {
    return { ok: false, reason: 'bad-signature' };
  }
  if (raw.length !== 64) return { ok: false, reason: 'bad-signature' };

  const message = canonicalManifestBytes(manifest);
  let anyKeyUsable = false;
  for (const key of trustedKeys) {
    if (key.publicKey.length !== 32) continue;
    anyKeyUsable = true;
    let verified = false;
    try {
      verified = ed25519Verify(raw, message, key.publicKey);
    } catch {
      verified = false;
    }
    if (verified) return { ok: true, key };
  }
  return { ok: false, reason: anyKeyUsable ? 'bad-signature' : 'untrusted-key' };
}
