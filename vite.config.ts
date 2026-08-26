import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Heavy qualification matrices (thousands of solver states) are deliberately
    // NOT part of `npm test`. They are not deleted or weakened — they run in full
    // via `npm run vegan:campaign` (vitest.campaign.config.ts) and still fail the
    // build on any contract violation. The rule: the CAMPAIGN DISCOVERS defects,
    // the DEFAULT SUITE PREVENTS their regression, so every defect the campaign
    // finds gets a small deterministic test that stays here.
    exclude: [
      ...configDefaults.exclude,
      'src/**/*.campaign.test.{ts,tsx}',
      'src/**/*.crown-campaign.test.{ts,tsx}',
    ],
    // Full formulation/Protein proofs are CPU-bound and OCR fixtures load
    // shared language assets. Run files serially so `npm test` exercises the
    // real per-test time contracts without cross-file resource starvation.
    fileParallelism: false,
  },
});
