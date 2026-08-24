/// <reference types="vitest/config" />
/**
 * Heavy qualification campaign — NOT part of `npm test`.
 *
 * Run with `npm run vegan:campaign`. These matrices exercise thousands of real
 * solver states against the internet recipe corpus and take roughly an hour, which
 * is why they are excluded from the default suite. They are NOT informational:
 * every contract violation fails the run with a non-zero exit code.
 *
 * Run it:
 *   - before a Vegan final closeout;
 *   - after any material Vegan / Direction / solver change;
 *   - before a production release;
 *   - optionally as an extended/nightly CI job.
 *
 * Anything this campaign discovers must also get a small deterministic test in the
 * default suite, so the regression can never come back unnoticed.
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
    include: ['src/**/*.campaign.test.{ts,tsx}'],
    // Same serial policy as the default suite: these matrices are CPU-bound and
    // must not starve each other, so per-test time contracts stay meaningful.
    fileParallelism: false,
  },
});
