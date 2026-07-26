/**
 * Minimal ambient typings for the React Native primitives the native target
 * uses.
 *
 * The renderer must not depend on the React Native toolchain — it is a library,
 * and pulling RN in as a devDependency to typecheck two components would cost
 * more than it is worth. These declarations are structural and intentionally
 * tiny; an app that has the real `react-native` types resolves those instead,
 * because this file is scoped to this package's compilation.
 *
 * If this shim ever needs a third component, that is a sign the native target
 * is growing platform logic that belongs in the app, not here.
 */

declare module 'react-native' {
  import type { ComponentType, ReactNode } from 'react';

  export interface ViewStyle {
    [property: string]: unknown;
  }
  export interface TextStyle extends ViewStyle {}

  export interface ViewProps {
    style?: ViewStyle | readonly ViewStyle[] | undefined;
    children?: ReactNode | undefined;
    testID?: string | undefined;
    accessible?: boolean | undefined;
    accessibilityLabel?: string | undefined;
    accessibilityRole?: string | undefined;
    [property: string]: unknown;
  }

  export interface TextProps extends ViewProps {
    style?: TextStyle | readonly TextStyle[] | undefined;
    numberOfLines?: number | undefined;
    allowFontScaling?: boolean | undefined;
  }

  export const View: ComponentType<ViewProps>;
  export const Text: ComponentType<TextProps>;
}
