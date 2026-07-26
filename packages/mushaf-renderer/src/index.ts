/**
 * `@qc/mushaf-renderer` — muṣḥaf page composition (handbook §6.3, §5.3, FR-RD-1).
 *
 * This entry point is the **layout core**: pure, platform-free, and the single
 * implementation both targets render. Import the targets separately:
 *
 * ```ts
 * import { MushafPage } from '@qc/mushaf-renderer/web';
 * import { MushafPage } from '@qc/mushaf-renderer/native';
 * ```
 *
 * Text is only ever read from a verified pack (`@qc/quran-core`). Nothing here
 * fetches at render time, and nothing here can produce Quran text that was not
 * in the pack (rule R2 / D-003).
 */

export {
  MushafRenderError,
  composePage,
  createPageComposer,
  FALLBACK_FONT_FAMILY,
  type ComposePageOptions,
  type PageFontResolver,
  type PageLabels,
} from './layout/compose.js';

export {
  MADANI_604_METRICS,
  contentHeight,
  contentWidth,
  lineBox,
  metricsForPage,
  pageBox,
  scaleToWidth,
  type PageMetrics,
} from './layout/metrics.js';

export {
  DEFAULT_MEASURER,
  createLetterCountMeasurer,
  createTableMeasurer,
  type LetterCountMeasurerOptions,
  type TextMeasurer,
} from './layout/measure.js';

export { toArabicIndicDigits } from './layout/numerals.js';

export {
  boxOfWord,
  centreOf,
  hitTestPage,
  lineAt,
  toDesignUnits,
  wordAt,
  type HitTestOptions,
  type WordHit,
} from './layout/hit-test.js';

export type {
  ComposedAyahMarker,
  ComposedElement,
  ComposedHeading,
  ComposedLine,
  ComposedWord,
  PageComposition,
  Point,
  Rect,
  Size,
} from './layout/types.js';

export {
  DEFAULT_FALLBACK_FAMILY,
  createPageFontProvider,
  neighbourPages,
  type PageFontProviderOptions,
} from './fonts/cache.js';

export { createWebFontLoader, type WebFontLoaderOptions } from './fonts/web.js';

export {
  createNativeFontLoader,
  type NativeFontLoaderOptions,
  type NativePageFontSource,
} from './fonts/native.js';

export type {
  FontLoader,
  FontStatus,
  MushafFontProvider,
  PageFontSource,
} from './fonts/types.js';

export {
  boxStyle,
  fontSizeFor,
  renderedHeight,
  round,
  scaleFor,
  type PixelBox,
} from './style.js';
