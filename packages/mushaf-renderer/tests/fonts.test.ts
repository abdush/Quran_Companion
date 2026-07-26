/**
 * The font strategy is a caching policy, and caching policies fail quietly, so
 * the tests here pin the promises the README makes: bounded residency, visible
 * pages never evicted, one load per page however many callers ask, and a failed
 * font degrading to the fallback family rather than to a blank page.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_FALLBACK_FAMILY,
  createNativeFontLoader,
  createPageFontProvider,
  createWebFontLoader,
  neighbourPages,
  type FontLoader,
  type NativePageFontSource,
  type PageFontSource,
} from '../src/index.js';

function sourceFor(page: number): PageFontSource {
  return {
    page,
    family: `qpc-page-${page}`,
    load: async () => new Uint8Array([0, 1, 2, 3]),
  };
}

function nativeSourceFor(page: number): NativePageFontSource {
  return { ...sourceFor(page), uri: `file:///fonts/p${String(page).padStart(3, '0')}.ttf` };
}

function recordingLoader(overrides: Partial<FontLoader> = {}): FontLoader & {
  readonly registered: string[];
  readonly unregistered: string[];
} {
  const registered: string[] = [];
  const unregistered: string[] = [];
  return {
    registered,
    unregistered,
    canUnregister: true,
    async register(source) {
      await source.load();
      registered.push(source.family);
    },
    unregister(family) {
      unregistered.push(family);
    },
    ...overrides,
  };
}

describe('neighbourPages', () => {
  it('returns the current page first, then forward, then back', () => {
    expect(neighbourPages(42)).toEqual([42, 43, 41, 44]);
  });

  it('does not run off either end of the muṣḥaf', () => {
    expect(neighbourPages(1)).toEqual([1, 2, 3]);
    expect(neighbourPages(604)).toEqual([604, 603]);
  });
});

describe('page font provider', () => {
  it('reports the fallback family until a page font is ready', async () => {
    const loader = recordingLoader();
    const provider = createPageFontProvider({ sourceFor, loader });

    expect(provider.fontFamilyFor(42)).toBe(DEFAULT_FALLBACK_FAMILY);
    expect(provider.status(42)).toBe('absent');

    await provider.ensure(42);

    expect(provider.status(42)).toBe('ready');
    expect(provider.fontFamilyFor(42)).toBe('qpc-page-42');
  });

  it('loads a page once however many callers ask', async () => {
    const loader = recordingLoader();
    const provider = createPageFontProvider({ sourceFor, loader });
    await Promise.all([provider.ensure(42), provider.ensure(42), provider.ensure(42)]);
    expect(loader.registered).toEqual(['qpc-page-42']);
  });

  it('evicts least-recently-used families beyond the capacity', async () => {
    const loader = recordingLoader();
    const provider = createPageFontProvider({ sourceFor, loader, capacity: 2 });

    for (const page of [1, 2, 3]) {
      await provider.ensure(page);
      provider.release(page);
    }

    expect(loader.unregistered).toEqual(['qpc-page-1']);
    expect(provider.fontFamilyFor(1)).toBe(DEFAULT_FALLBACK_FAMILY);
    expect(provider.fontFamilyFor(3)).toBe('qpc-page-3');
  });

  it('never evicts a page that is still on screen', async () => {
    const loader = recordingLoader();
    const provider = createPageFontProvider({ sourceFor, loader, capacity: 1 });

    await provider.ensure(1); // pinned: still displayed
    await provider.ensure(2);
    await provider.ensure(3);

    expect(loader.unregistered).toEqual([]);
    expect(provider.fontFamilyFor(1)).toBe('qpc-page-1');
  });

  it('keeps bookkeeping only where the platform cannot unregister', async () => {
    const loader = recordingLoader({ canUnregister: false });
    const provider = createPageFontProvider({ sourceFor, loader, capacity: 1 });
    await provider.ensure(1);
    provider.release(1);
    await provider.ensure(2);
    expect(loader.unregistered).toEqual([]);
    expect(provider.fontFamilyFor(1)).toBe('qpc-page-1');
  });

  it('prefetches neighbours without awaiting them', async () => {
    const loader = recordingLoader();
    const provider = createPageFontProvider({ sourceFor, loader });
    provider.prefetch(neighbourPages(42));
    await vi.waitFor(() => expect(loader.registered).toHaveLength(4));
    expect(loader.registered).toEqual([
      'qpc-page-42',
      'qpc-page-43',
      'qpc-page-41',
      'qpc-page-44',
    ]);
  });

  it('degrades to the fallback family when a font fails to load', async () => {
    const onError = vi.fn();
    const loader = recordingLoader({
      register: async () => {
        throw new Error('corrupt font file');
      },
    });
    const provider = createPageFontProvider({ sourceFor, loader, onError });

    expect(await provider.ensure(42)).toBe('failed');
    expect(provider.fontFamilyFor(42)).toBe(DEFAULT_FALLBACK_FAMILY);
    expect(onError).toHaveBeenCalledWith(42, expect.any(Error));
  });

  it('reports absent for a page with no page font at all', async () => {
    const provider = createPageFontProvider({
      sourceFor: () => null,
      loader: recordingLoader(),
    });
    expect(await provider.ensure(42)).toBe('absent');
    expect(provider.fontFamilyFor(42)).toBe(DEFAULT_FALLBACK_FAMILY);
  });

  it('releasing a page it never loaded is harmless', () => {
    const provider = createPageFontProvider({ sourceFor, loader: recordingLoader() });
    expect(() => provider.release(42)).not.toThrow();
  });
});

describe('web loader', () => {
  it('registers a FontFace built from the bytes, and can drop it again', async () => {
    const added: unknown[] = [];
    const deleted: unknown[] = [];
    const faces: { family: string; loaded: boolean }[] = [];

    class FakeFontFace {
      constructor(
        readonly family: string,
        readonly source: unknown,
        readonly descriptors: unknown,
      ) {
        faces.push({ family, loaded: false });
      }
      async load(): Promise<void> {
        (faces.find((face) => face.family === this.family) as { loaded: boolean }).loaded = true;
      }
    }
    vi.stubGlobal('FontFace', FakeFontFace);

    const loader = createWebFontLoader({
      fontSet: { add: (face) => added.push(face), delete: (face) => deleted.push(face) },
    });

    await loader.register(sourceFor(42));
    expect(added).toHaveLength(1);
    expect(faces).toEqual([{ family: 'qpc-page-42', loaded: true }]);

    // Registering the same family twice is a no-op, not a duplicate face.
    await loader.register(sourceFor(42));
    expect(added).toHaveLength(1);

    loader.unregister?.('qpc-page-42');
    expect(deleted).toHaveLength(1);
    loader.unregister?.('qpc-page-42');
    expect(deleted).toHaveLength(1);

    vi.unstubAllGlobals();
  });

  it('refuses to be constructed with no font set at all', () => {
    expect(() => createWebFontLoader()).toThrow(/no FontFaceSet available/);
  });
});

describe('native loader', () => {
  it('hands the uri to the injected expo-font loader', async () => {
    const loadAsync = vi.fn(async () => undefined);
    const loader = createNativeFontLoader({ loadAsync });

    await loader.register(nativeSourceFor(42));
    expect(loadAsync).toHaveBeenCalledWith({ 'qpc-page-42': 'file:///fonts/p042.ttf' });

    await loader.register(nativeSourceFor(42));
    expect(loadAsync).toHaveBeenCalledTimes(1);
    expect(loader.canUnregister).toBe(false);
  });

  it('says so plainly when a source has no uri', async () => {
    const loader = createNativeFontLoader({ loadAsync: async () => undefined });
    await expect(loader.register(sourceFor(42))).rejects.toThrow(/has no uri/);
  });
});
