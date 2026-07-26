/**
 * React Native target.
 *
 * The same composition, the same numbers, the same reading order as the web
 * target — only the host primitives differ. Both files are deliberately thin:
 * anything that decides *where* something goes belongs in `layout/`, so a
 * divergence between platforms can only be a rendering bug, never a layout one.
 *
 * Absolute positioning rather than flowed `<Text>` for the same reason as on
 * web: the muṣḥaf's line breaks come from the layout data, and word boxes are
 * the unit of interaction. It also sidesteps RN's bidi text handling entirely —
 * every box is placed in left-based coordinates by the layout core.
 *
 * Static rendering only in this phase: no selection, no highlight layers, no
 * playback.
 */

import type { ReactElement } from 'react';
import { Text, View, type TextStyle, type ViewStyle } from 'react-native';

import { composePage, type ComposePageOptions } from '../layout/compose.js';
import type { ComposedElement, ComposedLine, PageComposition } from '../layout/types.js';
import { boxStyle, fontSizeFor, renderedHeight, scaleFor } from '../style.js';
import type { QuranPack } from '@qc/quran-core';
import { formatWordKey } from '@qc/quran-core';

export interface ComposedPageProps {
  readonly composition: PageComposition;
  /** Rendered width in device-independent pixels. Height follows the aspect ratio. */
  readonly width?: number;
  readonly style?: ViewStyle;
  readonly accessibilityLabel?: string;
}

function elementStyle(element: ComposedElement, scale: number): TextStyle {
  const box = boxStyle(element.box, scale);
  return {
    position: 'absolute',
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    fontFamily: element.fontFamily,
    fontSize: fontSizeFor(element.fontSize, scale),
    lineHeight: box.height,
  };
}

function renderElement(element: ComposedElement, scale: number, index: number): ReactElement {
  switch (element.kind) {
    case 'word':
      return (
        <Text
          key={formatWordKey(element.key)}
          testID={`word:${formatWordKey(element.key)}`}
          allowFontScaling={false}
          style={elementStyle(element, scale)}
        >
          {element.text}
        </Text>
      );
    case 'ayah-marker':
      return (
        <Text
          key={`marker-${element.surah}-${element.ayah}`}
          testID={`ayah-marker:${element.surah}:${element.ayah}`}
          accessible={false}
          allowFontScaling={false}
          style={elementStyle(element, scale)}
        >
          {element.label}
        </Text>
      );
    case 'heading':
      return (
        <Text
          key={`heading-${element.type}-${element.surah}-${index}`}
          testID={`heading:${element.type}:${element.surah}`}
          allowFontScaling={false}
          style={elementStyle(element, scale)}
        >
          {element.label ?? ''}
        </Text>
      );
  }
}

function renderLine(line: ComposedLine, scale: number): ReactElement {
  const box = boxStyle(line.box, scale);
  return (
    <View
      key={line.lineNumber}
      testID={`line:${line.lineNumber}`}
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      }}
    >
      {line.elements.map((element, index) => renderElement(element, scale, index))}
    </View>
  );
}

/** Render an already-composed page. */
export function ComposedPage(props: ComposedPageProps): ReactElement {
  const { composition } = props;
  const width = props.width ?? composition.box.width;
  const scale = scaleFor(composition, width);

  return (
    <View
      testID={`mushaf-page:${composition.mushafId}:${composition.page}`}
      accessible={false}
      accessibilityLabel={props.accessibilityLabel}
      style={{
        position: 'relative',
        overflow: 'hidden',
        width,
        height: renderedHeight(composition, width),
        ...props.style,
      }}
    >
      {composition.lines.map((line) => renderLine(line, scale))}
    </View>
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
 * For a scrolling reader hold a `createPageComposer` and render
 * {@link ComposedPage} instead, so pages are not recomposed on every render.
 */
export function MushafPage({ pack, page, compose, ...rest }: MushafPageProps): ReactElement {
  return <ComposedPage composition={composePage(pack, { ...compose, page })} {...rest} />;
}
