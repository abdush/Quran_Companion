import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The native target imports React Native primitives. Installing the whole
      // RN toolchain to snapshot an element tree would be a poor trade, so tests
      // resolve `react-native` to a double that mirrors the handful of members
      // the adapter uses (`tests/support/react-native.tsx`).
      'react-native': resolve(import.meta.dirname, 'tests/support/react-native.tsx'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      reporter: ['text', 'json-summary'],
    },
  },
});
