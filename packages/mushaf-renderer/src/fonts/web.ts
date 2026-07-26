/**
 * Web font loading: the CSS Font Loading API.
 *
 * `new FontFace(family, bytes)` registers a family from bytes we already have,
 * which is what offline reading needs — no `@font-face` URL, no network, no
 * FOUT chasing. `display: 'block'` is deliberate: a page rendered in the
 * fallback face and then reflowed into the real one is worse than a brief wait,
 * because the muṣḥaf's line breaks are part of its meaning to a memoriser.
 *
 * Unregistering is supported here, so the LRU in `cache.ts` genuinely reclaims
 * memory on web.
 */

import type { FontLoader, PageFontSource } from './types.js';

/**
 * The two members of `document.fonts` this loader uses, structurally — the DOM
 * lib has typed `FontFaceSet` differently across versions, and a library should
 * not go red because of that.
 */
export interface FontFaceRegistry {
  add(face: FontFace): unknown;
  delete(face: FontFace): unknown;
}

export interface WebFontLoaderOptions {
  /** Defaults to the ambient `document.fonts`; injectable for tests. */
  readonly fontSet?: FontFaceRegistry;
  readonly display?: FontDisplay;
}

export function createWebFontLoader(options: WebFontLoaderOptions = {}): FontLoader {
  const fontSet: FontFaceRegistry | undefined =
    options.fontSet ??
    (typeof document === 'undefined'
      ? undefined
      : (document.fonts as unknown as FontFaceRegistry));
  if (fontSet === undefined) {
    throw new Error('no FontFaceSet available — pass one, or use the native loader');
  }
  const registered = new Map<string, FontFace>();

  return {
    canUnregister: true,

    async register(source: PageFontSource): Promise<void> {
      if (registered.has(source.family)) return;
      const bytes = await source.load();
      const buffer = bytes instanceof Uint8Array ? toArrayBuffer(bytes) : bytes;
      const face = new FontFace(source.family, buffer, {
        display: options.display ?? 'block',
      });
      await face.load();
      fontSet.add(face);
      registered.set(source.family, face);
    },

    unregister(family: string): void {
      const face = registered.get(family);
      if (face === undefined) return;
      fontSet.delete(face);
      registered.delete(family);
    },
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
