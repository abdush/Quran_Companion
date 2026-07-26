/**
 * React Native font loading, through an injected `expo-font`-shaped API.
 *
 * The renderer must not depend on Expo — it is a library, and the app owns its
 * platform dependencies — so the host passes `loadAsync` in:
 *
 * ```ts
 * import * as Font from 'expo-font';
 * const loader = createNativeFontLoader({ loadAsync: Font.loadAsync });
 * ```
 *
 * Two platform truths worth stating plainly:
 *
 * - **RN cannot unregister a font.** Once a family is loaded it stays for the
 *   process lifetime, so `canUnregister` is false and the LRU degrades to
 *   bookkeeping: it still bounds how many fonts are *loaded*, which is the part
 *   that costs, but it cannot give memory back. This is why the native side
 *   prefetches a narrow window rather than a generous one.
 * - **`loadAsync` takes a source, not bytes.** On device that is an asset
 *   module or a `file://` URI, so {@link NativePageFontSource} carries a `uri`
 *   alongside the byte loader the web side uses.
 */

import type { FontLoader, PageFontSource } from './types.js';

/** A page font source that also knows where the file lives on device. */
export interface NativePageFontSource extends PageFontSource {
  /** Asset module id or `file://` URI, whichever the host has. */
  readonly uri: string | number;
}

export interface NativeFontLoaderOptions {
  /** `expo-font`'s `loadAsync`, or any `(map) => Promise<void>` equivalent. */
  loadAsync(map: Record<string, string | number>): Promise<void>;
}

function isNativeSource(source: PageFontSource): source is NativePageFontSource {
  return typeof (source as NativePageFontSource).uri !== 'undefined';
}

export function createNativeFontLoader(options: NativeFontLoaderOptions): FontLoader {
  const registered = new Set<string>();

  return {
    // React Native keeps loaded fonts for the process lifetime.
    canUnregister: false,

    async register(source: PageFontSource): Promise<void> {
      if (registered.has(source.family)) return;
      if (!isNativeSource(source)) {
        throw new Error(
          `font source for page ${source.page} has no uri — the native loader needs an ` +
            'asset module or file:// URI, not raw bytes',
        );
      }
      await options.loadAsync({ [source.family]: source.uri });
      registered.add(source.family);
    },
  };
}
