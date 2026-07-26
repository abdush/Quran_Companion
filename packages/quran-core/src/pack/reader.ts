/**
 * The data-pack reader (handbook §6.3).
 *
 * `openPack` either returns a **fully verified** pack or throws: unsigned packs,
 * packs signed by an untrusted key, and packs whose payloads do not hash to the
 * digests the signed manifest declares are all refused (NFR-1). There is no
 * option to skip verification — a client that could be talked into reading an
 * unverified pack is a client that can be fed a forged muṣḥaf.
 *
 * Payloads are matched to dataset items **by digest**, not by file name: every
 * file under `data/` is hashed once, and an item claims the file whose SHA-256
 * equals its declared checksum. A file nobody claims is a refusal too, so an
 * attacker cannot append a payload and hope a client picks it up.
 *
 * Nothing here touches the network. A pack is bytes the caller already has —
 * from the app bundle, from the download manager, from a test fixture.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { unzip, type Unzipped } from 'fflate';

import { PackError } from '../errors.js';
import { type PageRef, type VerseKey, type WordKey, pageRef } from '../keys.js';
import {
  DEFAULT_WORD_ITEMS,
  languageOf,
  mushafIdOf,
  roleOf,
  type ItemRole,
} from './items.js';
import {
  assertChecksumsCoverContents,
  assertLicensesCoverContents,
  validateManifest,
  type PackManifest,
} from './manifest.js';
import { checkManifestSignature, type TrustedKey } from './signature.js';
import { GlossTable, LayoutTable, WordTable, type WordPlacement } from './tables.js';

const MANIFEST_NAME = 'manifest.json';
const PAYLOAD_DIR = 'data/';

export interface OpenPackOptions {
  /**
   * Public keys this client accepts packs from. Required, and an empty list
   * refuses everything — trust is a decision the caller makes explicitly.
   */
  readonly trustedKeys: readonly TrustedKey[];
  /**
   * Item ids whose payload is a word-level text table. Defaults to
   * {@link DEFAULT_WORD_ITEMS}; override when a pack ships a new script edition.
   */
  readonly wordItems?: readonly string[];
}

export interface PackAttribution {
  readonly item: string;
  readonly license: string;
  /** Rendered verbatim on the About screen (§6.4). */
  readonly attribution: string;
}

function decodeUtf8(item: string, bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new PackError('malformed-payload', `${item}: payload is not valid UTF-8`);
  }
}

function unzipAsync(bytes: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, unzipped) => {
      if (error) reject(new PackError('malformed-archive', `not a readable zip: ${error.message}`));
      else resolve(unzipped);
    });
  });
}

/**
 * A verified pack. All accessors are synchronous and parse lazily, so opening a
 * 604-page pack costs one hash pass and nothing else until a page is asked for.
 */
export class QuranPack {
  readonly manifest: PackManifest;
  /** Name of the trusted key whose signature verified this pack. */
  readonly signedBy: string;

  readonly #payloads: ReadonlyMap<string, Uint8Array>;
  readonly #wordItems: readonly string[];
  readonly #layouts = new Map<string, LayoutTable>();
  readonly #glosses = new Map<string, GlossTable>();
  #words: WordTable | null = null;

  /** @internal — construct through {@link openPack}, which verifies. */
  constructor(
    manifest: PackManifest,
    signedBy: string,
    payloads: ReadonlyMap<string, Uint8Array>,
    wordItems: readonly string[],
  ) {
    this.manifest = manifest;
    this.signedBy = signedBy;
    this.#payloads = payloads;
    this.#wordItems = wordItems;
  }

  get packId(): string {
    return this.manifest.pack_id;
  }

  get version(): string {
    return this.manifest.version;
  }

  get contents(): readonly string[] {
    return this.manifest.contents;
  }

  /** What the About screen must render for the datasets in this pack (§6.4). */
  attributions(): readonly PackAttribution[] {
    return this.manifest.licenses.map((entry) => ({
      item: entry.item,
      license: entry.license,
      attribution: entry.attribution,
    }));
  }

  has(item: string): boolean {
    return this.#payloads.has(item);
  }

  roleOf(item: string): ItemRole {
    return roleOf(item, this.#wordItems);
  }

  /** Verified bytes of a dataset item, exactly as the pack ships them. */
  rawPayload(item: string): Uint8Array {
    const bytes = this.#payloads.get(item);
    if (bytes === undefined) {
      throw new PackError('unknown-item', `pack ${this.packId} does not contain ${item}`);
    }
    return bytes;
  }

  /** Every `mushaf_id` this pack can lay out. */
  get mushafIds(): readonly string[] {
    return this.contents.filter((item) => this.roleOf(item) === 'layout').map(mushafIdOf);
  }

  /** Every word-by-word language this pack carries. */
  get glossLanguages(): readonly string[] {
    return this.contents.filter((item) => this.roleOf(item) === 'glosses').map(languageOf);
  }

  /**
   * Page/line structure for a muṣḥaf edition. With one layout in the pack the
   * argument may be omitted.
   */
  layout(mushafId?: string): LayoutTable {
    const available = this.mushafIds;
    const id = mushafId ?? available[0];
    if (id === undefined) {
      throw new PackError('unknown-item', `pack ${this.packId} ships no layout`);
    }
    const cached = this.#layouts.get(id);
    if (cached !== undefined) return cached;
    if (!available.includes(id)) {
      throw new PackError(
        'unknown-item',
        `pack ${this.packId} has no layout for ${id} (has ${available.join(', ') || 'none'})`,
      );
    }
    const item = `layout:${id}`;
    const table = LayoutTable.parse(item, id, decodeUtf8(item, this.rawPayload(item)));
    this.#layouts.set(id, table);
    return table;
  }

  /** The word-level text table (script text + transliteration). */
  words(): WordTable {
    if (this.#words !== null) return this.#words;
    const item = this.contents.find((candidate) => this.roleOf(candidate) === 'words');
    if (item === undefined) {
      throw new PackError('unknown-item', `pack ${this.packId} ships no word text`);
    }
    this.#words = WordTable.parse(item, decodeUtf8(item, this.rawPayload(item)));
    return this.#words;
  }

  /** Word-by-word glosses in `language`. */
  glosses(language: string): GlossTable {
    const cached = this.#glosses.get(language);
    if (cached !== undefined) return cached;
    const item = `wbw:${language}`;
    if (!this.has(item)) {
      throw new PackError(
        'unknown-item',
        `pack ${this.packId} has no ${language} glosses ` +
          `(has ${this.glossLanguages.join(', ') || 'none'})`,
      );
    }
    const table = GlossTable.parse(item, language, decodeUtf8(item, this.rawPayload(item)));
    this.#glosses.set(language, table);
    return table;
  }

  /** `word_key → (mushaf_id, page, line)` — the §6.1 mapping, from the pack. */
  locate(word: WordKey, mushafId?: string): WordPlacement | null {
    return this.layout(mushafId).locate(word);
  }

  /** The page an ayah starts on, as a `PageRef`. */
  pageRefFor(verse: VerseKey, mushafId?: string): PageRef | null {
    const layout = this.layout(mushafId);
    const page = layout.pageOf(verse);
    return page === null ? null : pageRef(layout.mushafId, page);
  }
}

/**
 * Verify and open a pack. Throws {@link PackError} — never returns an
 * unverified pack.
 *
 * @param source the `.qpack` bytes
 */
export async function openPack(
  source: Uint8Array | ArrayBuffer,
  options: OpenPackOptions,
): Promise<QuranPack> {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const entries = await unzipAsync(bytes);

  const manifestBytes = entries[MANIFEST_NAME];
  if (manifestBytes === undefined) {
    throw new PackError('malformed-archive', `archive has no ${MANIFEST_NAME}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
  } catch (cause) {
    throw new PackError(
      'malformed-archive',
      `${MANIFEST_NAME} is not valid JSON: ${(cause as Error).message}`,
    );
  }

  const manifest = validateManifest(parsed);

  // Cheapest gate first: a forged or unsigned manifest is refused before we
  // spend a hash pass over several megabytes of payload.
  const signature = checkManifestSignature(manifest as unknown as Record<string, unknown>, [
    ...options.trustedKeys,
  ]);
  if (!signature.ok) {
    const message =
      signature.reason === 'unsigned'
        ? 'pack is unsigned — refused'
        : signature.reason === 'untrusted-key'
          ? 'no usable trusted key configured — refused'
          : 'manifest signature does not verify under any trusted key — refused';
    throw new PackError(signature.reason, message);
  }

  assertChecksumsCoverContents(manifest);
  assertLicensesCoverContents(manifest);

  // Match payloads to items by digest. One pass over the archive; a file no
  // item claims, or an item no file satisfies, refuses the pack.
  const digests = new Map<string, string[]>();
  for (const [name, content] of Object.entries(entries)) {
    if (name === MANIFEST_NAME) continue;
    if (name.endsWith('/')) continue;
    if (!name.startsWith(PAYLOAD_DIR)) {
      throw new PackError('undeclared-payload', `archive holds ${name} outside ${PAYLOAD_DIR}`);
    }
    const digest = `sha256:${bytesToHex(sha256(content))}`;
    const names = digests.get(digest);
    if (names === undefined) digests.set(digest, [name]);
    else names.push(name);
  }

  const payloads = new Map<string, Uint8Array>();
  const claimed = new Set<string>();
  for (const item of manifest.contents) {
    const digest = manifest.checksums[item] as string;
    const candidates = digests.get(digest) ?? [];
    if (candidates.length === 0) {
      throw new PackError(
        'checksum-mismatch',
        `no payload in the archive hashes to the checksum declared for ${item}`,
      );
    }
    if (candidates.length > 1) {
      throw new PackError(
        'malformed-archive',
        `${candidates.length} payloads share the checksum declared for ${item}`,
      );
    }
    const name = candidates[0] as string;
    claimed.add(name);
    payloads.set(item, entries[name] as Uint8Array);
  }

  for (const name of Object.keys(entries)) {
    if (name === MANIFEST_NAME || name.endsWith('/')) continue;
    if (!claimed.has(name)) {
      throw new PackError(
        'undeclared-payload',
        `archive holds ${name}, which no manifest item declares`,
      );
    }
  }

  return new QuranPack(
    manifest,
    signature.key.name,
    payloads,
    options.wordItems ?? DEFAULT_WORD_ITEMS,
  );
}
