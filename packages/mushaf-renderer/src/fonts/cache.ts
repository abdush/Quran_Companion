/**
 * The per-page font cache, shared by both targets.
 *
 * 604 page fonts at roughly 60–130 KB each is far more than a phone should hold
 * resident, and a reader only ever looks at a few pages at once. The policy:
 *
 * - **Bounded, least-recently-used.** `capacity` families stay registered;
 *   beyond that the least recently used one is dropped (where the platform can
 *   drop it — see {@link FontLoader.canUnregister}).
 * - **Pinned pages are never evicted.** The page on screen is pinned by
 *   `ensure`; `release` unpins it. Eviction can therefore never pull the font
 *   out from under a visible page.
 * - **Neighbours are prefetched, not loaded on demand.** Scrolling is
 *   predictable: {@link neighbourPages} gives the pages a reader is about to
 *   reach, and prefetch failures are silent because a missing prefetch is not
 *   an error — the fallback family renders it.
 * - **In-flight loads are shared.** Two views asking for the same page await
 *   one load.
 */

import type { FontLoader, FontStatus, MushafFontProvider, PageFontSource } from './types.js';

export interface PageFontProviderOptions {
  /** Where the bytes come from; return `null` for a page with no page font. */
  sourceFor(page: number): PageFontSource | null;
  readonly loader: FontLoader;
  /** Families kept registered at once. Default 12 — roughly a spread plus slack. */
  readonly capacity?: number;
  /** Family used until a page font is ready, and for pages that have none. */
  readonly fallbackFamily?: string;
  /** Called when a load fails, so the host can log it. Never throws upward. */
  onError?(page: number, error: unknown): void;
}

/** The default fallback: a general Uthmani face the app bundles once. */
export const DEFAULT_FALLBACK_FAMILY = 'qc-uthmani-fallback';

interface Entry {
  readonly source: PageFontSource;
  status: FontStatus;
  pinned: number;
  inFlight: Promise<FontStatus> | null;
}

/**
 * Pages worth having ready around `page`: the current page first, then
 * outwards. A muṣḥaf is read as a spread and turned one page at a time, so a
 * small symmetric window with a bias forward is the whole policy.
 */
export function neighbourPages(
  page: number,
  { ahead = 2, behind = 1, first = 1, last = 604 } = {},
): number[] {
  const pages: number[] = [];
  for (let offset = 0; offset <= Math.max(ahead, behind); offset += 1) {
    if (offset === 0) {
      pages.push(page);
      continue;
    }
    if (offset <= ahead && page + offset <= last) pages.push(page + offset);
    if (offset <= behind && page - offset >= first) pages.push(page - offset);
  }
  return pages;
}

export function createPageFontProvider(
  options: PageFontProviderOptions,
): MushafFontProvider {
  const capacity = options.capacity ?? 12;
  const fallbackFamily = options.fallbackFamily ?? DEFAULT_FALLBACK_FAMILY;
  const loader = options.loader;

  /** Insertion order is recency order: re-inserting moves an entry to the end. */
  const entries = new Map<number, Entry>();

  function touch(page: number, entry: Entry): void {
    entries.delete(page);
    entries.set(page, entry);
  }

  function evictIfNeeded(): void {
    if (!loader.canUnregister) return;
    while (entries.size > capacity) {
      const victim = [...entries.entries()].find(
        ([, entry]) => entry.pinned === 0 && entry.inFlight === null,
      );
      if (victim === undefined) return; // Everything resident is in use.
      const [page, entry] = victim;
      entries.delete(page);
      if (entry.status === 'ready') loader.unregister?.(entry.source.family);
    }
  }

  function entryFor(page: number): Entry | null {
    const existing = entries.get(page);
    if (existing !== undefined) return existing;
    const source = options.sourceFor(page);
    if (source === null) return null;
    const entry: Entry = { source, status: 'absent', pinned: 0, inFlight: null };
    entries.set(page, entry);
    return entry;
  }

  async function load(page: number, entry: Entry): Promise<FontStatus> {
    entry.status = 'loading';
    try {
      await loader.register(entry.source);
      entry.status = 'ready';
    } catch (error) {
      entry.status = 'failed';
      options.onError?.(page, error);
    } finally {
      entry.inFlight = null;
    }
    return entry.status;
  }

  return {
    fallbackFamily,

    fontFamilyFor(page) {
      const entry = entries.get(page);
      return entry !== undefined && entry.status === 'ready'
        ? entry.source.family
        : fallbackFamily;
    },

    status(page) {
      return entries.get(page)?.status ?? 'absent';
    },

    async ensure(page) {
      const entry = entryFor(page);
      if (entry === null) return 'absent';
      touch(page, entry);
      entry.pinned += 1;
      evictIfNeeded();

      if (entry.status === 'ready' || entry.status === 'failed') return entry.status;
      if (entry.inFlight === null) entry.inFlight = load(page, entry);
      return entry.inFlight;
    },

    prefetch(pages) {
      for (const page of pages) {
        const entry = entryFor(page);
        if (entry === null || entry.status !== 'absent') continue;
        touch(page, entry);
        entry.inFlight = load(page, entry);
        // A prefetch that fails is not an error: the fallback family renders.
        void entry.inFlight.catch(() => undefined);
      }
      evictIfNeeded();
    },

    release(page) {
      const entry = entries.get(page);
      if (entry === undefined) return;
      entry.pinned = Math.max(0, entry.pinned - 1);
      evictIfNeeded();
    },
  };
}
