/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: schemas/licenses.schema.json
 * Regenerate: pnpm --dir tools/codegen generate
 */

/**
 * Schema for schemas/licenses.json — the single registry of every third-party dataset, its license, attribution string, and usage constraints (Handbook §6.4). CI fails if a pack manifest references an item absent here; the About screen renders attributions from this file.
 */
export interface LicenseRegistry {
  $schema?: string;
  registry_version: 1;
  entries: Entry[];
}
export interface Entry {
  /**
   * Dataset item id, matching pack-manifest contents ids (`kind:name[-version]`).
   */
  item: string;
  /**
   * Human-readable dataset name.
   */
  name: string;
  /**
   * Upstream source of the dataset.
   */
  source_url: string;
  /**
   * SPDX identifier where one exists; otherwise a registry-defined code documented in usage_constraints.
   */
  license: string;
  license_url?: string;
  /**
   * Exact attribution string to render on the About screen.
   */
  attribution: string;
  /**
   * Constraints beyond the SPDX license text (redistribution limits, no-modification clauses, share-alike scope).
   */
  usage_constraints?: string;
  /**
   * Date the entry was added to the registry.
   */
  added_at: string;
}
