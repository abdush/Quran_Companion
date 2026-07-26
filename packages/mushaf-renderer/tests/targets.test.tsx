/**
 * Layout snapshots on both targets, plus the guarantee that makes two targets
 * defensible at all: **the same composition renders to the same geometry on
 * web and on React Native.** The element trees differ (spans versus Text), but
 * every word's key, text and box must match exactly.
 *
 * Snapshots are golden files (rule R8). A diff here means the rendered page has
 * moved; `vitest -u` is only appropriate once the move has been understood and
 * is being approved deliberately.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { ComposedPage as NativePage, MushafPage as NativeMushafPage } from '../src/native/index.js';
import { ComposedPage as WebPage, MushafPage as WebMushafPage } from '../src/web/index.js';
import { composePage, createPageComposer } from '../src/index.js';
import type { PageComposition } from '../src/index.js';
import { formatWordKey, type QuranPack } from '@qc/quran-core';
import { SAMPLE_PAGES, samplePack } from './support/pack.js';
import { findAll, renderTree, textOf, type TreeNode } from './support/render.js';

const RENDERED_WIDTH = 420;

interface RenderedWord {
  readonly key: string;
  readonly text: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
}

function styleOf(node: TreeNode): Record<string, unknown> {
  return (node.props['style'] ?? {}) as Record<string, unknown>;
}

function webWords(tree: TreeNode): RenderedWord[] {
  return findAll(tree, (node) => node.props['data-kind'] === 'word').map((node) => {
    const style = styleOf(node);
    return {
      key: node.props['data-word-key'] as string,
      text: textOf(node),
      left: style['left'] as number,
      top: style['top'] as number,
      width: style['width'] as number,
      height: style['height'] as number,
      fontSize: style['fontSize'] as number,
    };
  });
}

function nativeWords(tree: TreeNode): RenderedWord[] {
  return findAll(
    tree,
    (node) => typeof node.props['testID'] === 'string' && (node.props['testID'] as string).startsWith('word:'),
  ).map((node) => {
    const style = styleOf(node);
    return {
      key: (node.props['testID'] as string).slice('word:'.length),
      text: textOf(node),
      left: style['left'] as number,
      top: style['top'] as number,
      width: style['width'] as number,
      height: style['height'] as number,
      fontSize: style['fontSize'] as number,
    };
  });
}

let pack: QuranPack;

beforeAll(async () => {
  pack = await samplePack();
});

describe.each(SAMPLE_PAGES)('page %i', (page) => {
  let composition: PageComposition;

  beforeAll(() => {
    composition = composePage(pack, { page });
  });

  it('renders the same words, text and geometry on both targets', () => {
    const web = webWords(renderTree(<WebPage composition={composition} width={RENDERED_WIDTH} />));
    const native = nativeWords(
      renderTree(<NativePage composition={composition} width={RENDERED_WIDTH} />),
    );

    expect(web).toHaveLength(composition.words.length);
    expect(native).toEqual(web);
  });

  it('renders every word the composition placed, in reading order', () => {
    const web = webWords(renderTree(<WebPage composition={composition} width={RENDERED_WIDTH} />));
    expect(web.map((word) => word.key)).toEqual(
      composition.words.map((word) => formatWordKey(word.key)),
    );
  });

  it('matches the web layout snapshot', () => {
    const tree = renderTree(<WebPage composition={composition} width={RENDERED_WIDTH} />);
    expect({
      page: tree.props['data-page'],
      mushafId: tree.props['data-mushaf-id'],
      pack: tree.props['data-pack'],
      box: {
        width: (styleOf(tree)['width'] as number) ?? null,
        height: (styleOf(tree)['height'] as number) ?? null,
      },
      lines: tree.children.map((line) => {
        const node = line as TreeNode;
        return {
          line: node.props['data-line'],
          type: node.props['data-line-type'],
          elements: node.children.map((element) => {
            const child = element as TreeNode;
            const style = styleOf(child);
            return [
              child.props['data-kind'],
              child.props['data-word-key'] ??
                child.props['data-verse-key'] ??
                child.props['data-heading-type'],
              style['left'],
              style['top'],
              style['width'],
              style['fontSize'],
            ];
          }),
        };
      }),
    }).toMatchSnapshot();
  });

  it('matches the native layout snapshot', () => {
    const tree = renderTree(<NativePage composition={composition} width={RENDERED_WIDTH} />);
    expect({
      testID: tree.props['testID'],
      box: {
        width: styleOf(tree)['width'],
        height: styleOf(tree)['height'],
      },
      lines: tree.children.map((line) => {
        const node = line as TreeNode;
        return {
          testID: node.props['testID'],
          elements: node.children.map((element) => {
            const child = element as TreeNode;
            const style = styleOf(child);
            return [
              child.props['testID'],
              style['left'],
              style['top'],
              style['width'],
              style['fontSize'],
            ];
          }),
        };
      }),
    }).toMatchSnapshot();
  });
});

describe('target details', () => {
  it('web renders right-to-left with a page-sized box', () => {
    const tree = renderTree(
      <WebPage composition={composePage(pack, { page: 42 })} width={RENDERED_WIDTH} />,
    );
    expect(tree.type).toBe('div');
    expect(tree.props['dir']).toBe('rtl');
    expect(styleOf(tree)['width']).toBe(RENDERED_WIDTH);
    expect(styleOf(tree)['position']).toBe('relative');
  });

  it('native renders View/Text primitives only', () => {
    const tree = renderTree(
      <NativePage composition={composePage(pack, { page: 42 })} width={RENDERED_WIDTH} />,
    );
    const types = new Set([...findAll(tree, () => true)].map((node) => node.type));
    expect([...types].sort()).toEqual(['rn-text', 'rn-view']);
  });

  it('ayah markers are hidden from assistive technology, not from the page', () => {
    const web = renderTree(
      <WebPage composition={composePage(pack, { page: 42 })} width={RENDERED_WIDTH} />,
    );
    const markers = findAll(web, (node) => node.props['data-kind'] === 'ayah-marker');
    expect(markers.length).toBeGreaterThan(0);
    for (const marker of markers) expect(marker.props['aria-hidden']).toBe('true');

    const native = renderTree(
      <NativePage composition={composePage(pack, { page: 42 })} width={RENDERED_WIDTH} />,
    );
    const nativeMarkers = findAll(native, (node) =>
      String(node.props['testID'] ?? '').startsWith('ayah-marker:'),
    );
    expect(nativeMarkers.length).toBe(markers.length);
    for (const marker of nativeMarkers) expect(marker.props['accessible']).toBe(false);
  });

  it('the convenience component composes the same page as the composer does', () => {
    const composer = createPageComposer(pack);
    const direct = renderTree(<WebMushafPage pack={pack} page={604} width={RENDERED_WIDTH} />);
    const composed = renderTree(
      <WebPage composition={composer.compose(604)} width={RENDERED_WIDTH} />,
    );
    expect(webWords(direct)).toEqual(webWords(composed));

    const nativeDirect = renderTree(
      <NativeMushafPage pack={pack} page={604} width={RENDERED_WIDTH} />,
    );
    expect(nativeWords(nativeDirect)).toEqual(webWords(composed));
  });

  it('defaults to the composition box when no width is given', () => {
    const composition = composePage(pack, { page: 1 });
    const tree = renderTree(<WebPage composition={composition} />);
    expect(styleOf(tree)['width']).toBe(composition.box.width);
    expect(styleOf(tree)['height']).toBe(composition.box.height);
  });

  it('sets the font family the composition asked for', () => {
    const composition = composePage(pack, {
      page: 42,
      fonts: { fontFamilyFor: (page) => `qpc-page-${page}` },
    });
    const tree = renderTree(<WebPage composition={composition} width={RENDERED_WIDTH} />);
    for (const word of findAll(tree, (node) => node.props['data-kind'] === 'word')) {
      expect(styleOf(word)['fontFamily']).toBe('qpc-page-42');
    }
  });
});
