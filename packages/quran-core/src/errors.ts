/** Error types shared across the package. */

export class QuranCoreError extends Error {}

/** A canonical key is malformed or addresses content that does not exist. */
export class InvalidKeyError extends QuranCoreError {
  override readonly name = 'InvalidKeyError';
}

/**
 * Why a pack was refused. Every value here is a *refusal*: `openPack` either
 * returns a fully verified pack or throws (§6.3, NFR-1).
 */
export type PackErrorCode =
  /** Not a readable zip, or `manifest.json` is missing/unparseable. */
  | 'malformed-archive'
  /** The manifest does not match the shape `schemas/packs/manifest.schema.json` declares. */
  | 'malformed-manifest'
  /** `manifest_version` is newer than this reader understands. */
  | 'unsupported-manifest-version'
  /** No `ed25519:` signature at all. */
  | 'unsigned'
  /** Signed by a key the caller does not trust. */
  | 'untrusted-key'
  /** Signature present and key trusted, but the manifest bytes do not verify. */
  | 'bad-signature'
  /** `checksums` does not cover exactly `contents`. */
  | 'checksums-incomplete'
  /** No payload in the archive hashes to a declared checksum. */
  | 'checksum-mismatch'
  /** The archive carries a payload the manifest does not declare. */
  | 'undeclared-payload'
  /** A declared content item has no licence declaration (§6.4). */
  | 'missing-license'
  /** A payload does not parse as the format its item id implies. */
  | 'malformed-payload'
  /** The caller asked for an item the pack does not contain. */
  | 'unknown-item';

export class PackError extends QuranCoreError {
  override readonly name = 'PackError';
  readonly code: PackErrorCode;

  constructor(code: PackErrorCode, message: string) {
    super(`${message} [${code}]`);
    this.code = code;
  }
}
