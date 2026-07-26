/**
 * Font pipeline contracts.
 *
 * Authentic muṣḥaf rendering uses the KFGQPC **per-page** fonts: one font file
 * per page, cut so that the page's lines fill the column exactly. That is 604
 * font files, so loading is necessarily incremental and cached — the strategy
 * lives in `cache.ts`, the platform mechanics in `web.ts` and `native.ts`.
 *
 * Two facts shape these interfaces:
 *
 * 1. **Composition is synchronous, loading is not.** `fontFamilyFor` always
 *    returns a family immediately — the page font if it is ready, the fallback
 *    otherwise — so a page can be composed and shown before its font arrives,
 *    and recomposed when it does. Nothing blocks on a font.
 * 2. **Font bytes are supplied by the host, not fetched here.** Today they come
 *    from app assets; when the pack format grows a font item they will come
 *    from the pack. Either way the renderer never reaches the network, and it
 *    never treats a font as a source of *text* — a missing font degrades the
 *    typeface, never the words.
 */

import type { PageFontResolver } from '../layout/compose.js';

export type FontStatus = 'absent' | 'loading' | 'ready' | 'failed';

/** Font bytes for one page, as the host can provide them. */
export interface PageFontSource {
  readonly page: number;
  /** Family name the target will set text in. Must be unique per page. */
  readonly family: string;
  /**
   * Resolve the font data. Implementations read app assets or verified pack
   * bytes; a network fetch here would break offline reading (§6.3).
   */
  load(): Promise<ArrayBuffer | Uint8Array>;
}

/** Platform mechanics for registering and dropping a font family. */
export interface FontLoader {
  /** Register the font so text set in `source.family` renders with it. */
  register(source: PageFontSource): Promise<void>;
  /** Drop it again. Optional: some platforms cannot unregister a font. */
  unregister?(family: string): void;
  /** Whether this platform can actually reclaim a font's memory. */
  readonly canUnregister: boolean;
}

export interface MushafFontProvider extends PageFontResolver {
  /** Load the page font, if it is not loaded or in flight. */
  ensure(page: number): Promise<FontStatus>;
  /** Warm neighbouring pages; failures are swallowed by design. */
  prefetch(pages: Iterable<number>): void;
  /** Let a page's font be evicted again. */
  release(page: number): void;
  status(page: number): FontStatus;
  readonly fallbackFamily: string;
}
