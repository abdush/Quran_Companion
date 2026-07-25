/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: schemas/packs/manifest.schema.json
 * Regenerate: pnpm --dir tools/codegen generate
 */

/**
 * Dataset item id as `kind:name[-version]`.
 */
export type ItemId = string;

/**
 * Manifest of a .qpack data pack (zip + manifest) built by tools/pack-builder (Handbook §6.3). Packs are immutable and signed; clients refuse unsigned or checksum-failing packs (NFR-1). CI fails if any licenses[].item is absent from schemas/licenses.json (§6.4).
 */
export interface PackManifest {
  /**
   * Manifest format version; bump only via ADR.
   */
  manifest_version: 1;
  /**
   * Stable pack identity across versions.
   */
  pack_id: string;
  /**
   * CalVer YYYY.0M.MICRO; updates ship as new versions, clients keep current + previous.
   */
  version: string;
  /**
   * Dataset items included in the pack.
   *
   * @minItems 1
   */
  contents: [ItemId, ...ItemId[]];
  /**
   * SHA-256 per contents item; keys must be a subset of contents (enforced by pack-builder, mirrored in golden tests R8).
   */
  checksums: {
    [k: string]: string;
  };
  /**
   * Per-item license declarations; every item must exist in the licensing registry (§6.4).
   */
  licenses: {
    item: ItemId;
    /**
     * SPDX identifier or registry-defined license code from schemas/licenses.json.
     */
    license: string;
    /**
     * Attribution string rendered on the About screen.
     */
    attribution: string;
  }[];
  /**
   * Ed25519 signature over the canonical manifest bytes (signature field excluded).
   */
  signature: string;
}
