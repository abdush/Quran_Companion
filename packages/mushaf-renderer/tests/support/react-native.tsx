/**
 * Stand-in for `react-native`, aliased in `vitest.config.ts`.
 *
 * `View` and `Text` are host component *names*, not implementations: the tests
 * assert the element tree the native target produces (types, props, geometry),
 * which is exactly the contract this package owns. Everything below that — how
 * RN turns a `<View>` into a native view — is React Native's job, and running
 * the RN toolchain here would test their code, not ours.
 */

import type { ComponentType, ReactNode } from 'react';

interface ViewProps {
  style?: unknown;
  children?: ReactNode;
  [property: string]: unknown;
}

export const View = 'rn-view' as unknown as ComponentType<ViewProps>;
export const Text = 'rn-text' as unknown as ComponentType<ViewProps>;
