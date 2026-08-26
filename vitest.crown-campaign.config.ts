/// <reference types="vitest/config" />
/**
 * Crown / Multi-Main qualification campaign.
 *
 * This 200+ state audit is deliberately outside `npm test`. Every production
 * regression it discovers must receive a small deterministic default-suite
 * reproducer before production code changes.
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
    include: [
      'src/features/constraint-studio/__campaign__/crownMultiMainStress.crown-campaign.test.ts',
    ],
    fileParallelism: false,
    testTimeout: 7_200_000,
    hookTimeout: 7_200_000,
  },
});
