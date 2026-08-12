/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
    // Full formulation/Protein proofs are CPU-bound and OCR fixtures load
    // shared language assets. Run files serially so `npm test` exercises the
    // real per-test time contracts without cross-file resource starvation.
    fileParallelism: false,
  },
});
