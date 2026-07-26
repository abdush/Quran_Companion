/**
 * Web target.
 *
 * Absolutely positioned words inside a page box, in the coordinates the layout
 * core produced. Deliberately *not* flowed text: word boxes are the unit of
 * interaction (tap, highlight, playback follow), and the muṣḥaf's line breaks
 * are fixed by the layout data rather than by the browser's line breaker, which
 * would happily reflow them and destroy the page a memoriser knows by sight.
 *
 * The components are pure and hook-free. Composition caching belongs to the
 * caller (`createPageComposer`), which keeps this file a straight function from
 * data to elements — and therefore snapshot-testable without a DOM.
 *
 * Static rendering only in this phase: no selection, no highlight layers, no
 * playback. Those arrive with the interaction API in Phase 1.
 */

import type { CSSProperties, ReactElement } from 'react';

import { composePage, type ComposePageOptions } from '../layout/compose.js';
import type {
  ComposedElement,
  ComposedLine,
  PageComposition,
} from '../layout/types.js';
import { boxStyle, fontSizeFor, renderedHeight, scaleFor } from '../style.js';
import type { QuranPack } from '@qc/quran-core';
import { formatWordKey } from '@qc/quran-core';

export interface ComposedPageProps {
  readonly composition: PageComposition;
  /** Rendered width in CSS pixels. Height follows the page's aspect ratio. */
  readonly width?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Family used for headings and markers when no page font is loaded. */
  readonly fallbackFontFamily?: string;
  readonly dir?: 'rtl' | 'ltr';
}

const PAGE_STYLE: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

const ELEMENT_STYLE: CSSProperties = {
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  whiteSpace: 'nowrap',
  lineHeight: 1,
};

function elementStyle(element: ComposedElement, scale: number): CSSProperties {
  return {
    ...ELEMENT_STYLE,
    ...boxStyle(element.box, scale),
    fontFamily: element.fontFamily,
    fontSize: fontSizeFor(element.fontSize, scale),
  };
}

function renderElement(element: ComposedElement, scale: number, index: number): ReactElement {
  switch (element.kind) {
    case 'word':
      return (
        <span
          key={formatWordKey(element.key)}
          data-kind="word"
          data-word-key={formatWordKey(element.key)}
          style={elementStyle(element, scale)}
        >
          {element.text}
        </span>
      );
    case 'ayah-marker':
      return (
        <span
          key={`marker-${element.surah}-${element.ayah}`}
          data-kind="ayah-marker"
          data-verse-key={`${element.surah}:${element.ayah}`}
          aria-hidden="true"
          style={elementStyle(element, scale)}
        >
          {element.label}
        </span>
      );
    case 'heading':
      return (
        <span
          key={`heading-${element.type}-${element.surah}-${index}`}
          data-kind="heading"
          data-heading-type={element.type}
          data-surah={element.surah}
          style={elementStyle(element, scale)}
        >
          {element.label ?? ''}
        </span>
      );
  }
}

function renderLine(line: ComposedLine, scale: number): ReactElement {
  return (
    <div
      key={line.lineNumber}
      data-line={line.lineNumber}
      data-line-type={line.type}
      style={{ ...boxStyle(line.box, scale), position: 'absolute' }}
    >
      {line.elements.map((element, index) =>
        renderElement(element, scale, index),
      )}
    </div>
  );
}

/** Render an already-composed page. */
export function ComposedPage(props: ComposedPageProps): ReactElement {
  const { composition } = props;
  const width = props.width ?? composition.box.width;
  const scale = scaleFor(composition, width);

  return (
    <div
      className={props.className}
      dir={props.dir ?? 'rtl'}
      data-mushaf-id={composition.mushafId}
      data-page={composition.page}
      data-pack={`${composition.packId}-${composition.packVersion}`}
      style={{
        ...PAGE_STYLE,
        width,
        height: renderedHeight(composition, width),
        fontFamily: props.fallbackFontFamily ?? 'inherit',
        ...props.style,
      }}
    >
      {/* Words are absolutely positioned; the line boxes exist so that a line
          is a real element for hit-testing, highlighting and a11y grouping. */}
      {composition.lines.map((line) => renderLine(line, scale))}
    </div>
  );
}

export interface MushafPageProps extends Omit<ComposedPageProps, 'composition'> {
  readonly pack: QuranPack;
  readonly page: number;
  readonly compose?: Omit<ComposePageOptions, 'page'>;
}

/**
 * Compose and render a page in one step.
 *
 * Convenient for a single page; for a scrolling reader hold a
 * `createPageComposer` and render {@link ComposedPage}, so pages are not
 * recomposed on every render.
 */
export function MushafPage({ pack, page, compose, ...rest }: MushafPageProps): ReactElement {
  return <ComposedPage composition={composePage(pack, { ...compose, page })} {...rest} />;
}
