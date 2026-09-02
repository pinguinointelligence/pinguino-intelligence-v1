/// <reference types="vitest/config" />
/**
 * GELLATTI full-application acceptance campaign — NOT part of `npm test`.
 *
 * Run with `npm run acceptance:matrix`. It signs into the staging QA account
 * and resolves real ProductBehavior authority over the network, so it needs
 * staging reachability and is excluded from the default suite and from CI.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.acceptance.test.{ts,tsx}'],
    fileParallelism: false,
    testTimeout: 60 * 60 * 1000,
    hookTimeout: 60 * 1000,
  },
});
