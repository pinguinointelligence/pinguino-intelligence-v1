/// <reference types="node" />
/**
 * AGENT 2 — TASK A drift detectors: every runtime score derives from CURRENT
 * engine output.
 *
 * The manual audit (docs/engine-validation/AGENT2_ENGINE_AUTHENTICITY_LEDGER.md)
 * verified each score surface by reading; this suite pins the findings at the
 * SOURCE level (like the constraint-studio boundary test) so a future
 * hard-coded score, static result object or fake label fails CI:
 *
 *  1. every score display surface calls `recipeMatchScore(` on an engine
 *     result and contains NO integer score literal;
 *  2. `recipeMatchScore` itself is a pure monotone function of
 *     `scores.overall` — no state, no constants per recipe;
 *  3. the landing Monitor demo is REAL pipeline output (recomputed here and
 *     compared), not a static payload;
 *  4. dev fixtures with sample scores stay confined to `/dev` routes that are
 *     registered only under `import.meta.env.DEV`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import { recipeMatchScore } from '@/features/recipe-score';
import { buildLandingMonitorDemo } from '@/pages/landing/landingMonitorDemo';
import { buildMonitorHomeView } from '@/features/pi-monitor';
import {
  buildCustomerResult,
  createCustomerFlow,
  selectServingMode,
  setBatchGrams,
  setProductType,
} from '@/features/customer-flow';

const SRC = resolve(import.meta.dirname, '../..');
const read = (rel: string): string => readFileSync(resolve(SRC, rel), 'utf8');

/** Every runtime surface that renders the public 1–10 score. */
const SCORE_SURFACES = [
  'features/pi-panel/OverallScoreCard.tsx',
  'features/pi-monitor/piMonitorHomeView.ts',
  'features/user-monitor/recipeIndicatorStatuses.ts',
  'features/pro-core/ProRecalcPanel.tsx',
  'pages/landing/landingMonitorDemo.ts',
];

describe('TASK A — score surfaces derive from the engine (source-level pins)', () => {
  it('every score surface derives its score from the engine adapters and hard-codes no score', () => {
    // ACCEPTANCE ADDENDUM (2), owner 2026-07-24: public headline surfaces now
    // derive „Dopasowanie techniczne" via `recipeTechnicalFit(` (band truth);
    // `recipeMatchScore(` remains sanctioned for QA/diagnostic recorders.
    for (const rel of SCORE_SURFACES) {
      const source = read(rel);
      const derived =
        /recipeTechnicalFit\(/.test(source) ||
        /recipeMatchScore\(/.test(source) ||
        /buildMonitorHomeView\(/.test(source);
      expect(derived, `${rel} must derive its score`).toBe(true);
      // No integer score literals feeding a display (config weights live in the
      // engine config, not in presentation surfaces).
      expect(/score:\s*\d/.test(source), `hard-coded score in ${rel}`).toBe(false);
      expect(/display:\s*['"`]\d+\/10['"`]/.test(source), `hard-coded display in ${rel}`).toBe(false);
    }
  });

  it('recipeMatchScore is a pure monotone map of scores.overall — no per-recipe constants', () => {
    expect(recipeMatchScore(null).score).toBeNull();
    expect(recipeMatchScore({ overall: Number.NaN }).score).toBeNull();
    expect(recipeMatchScore({ overall: 4 }).score).toBe(1); // clamped floor
    expect(recipeMatchScore({ overall: 53.8735 }).score).toBe(5); // historical T9 preview value (pure-map pin)
    expect(recipeMatchScore({ overall: 82.1399 }).score).toBe(8); // T10 observed
    expect(recipeMatchScore({ overall: 88.1667 }).score).toBe(9); // T17 observed
    expect(recipeMatchScore({ overall: 99 }).score).toBe(10);
    // monotone: a higher overall can never present lower
    let previous = 0;
    for (let overall = 0; overall <= 100; overall += 1) {
      const score = recipeMatchScore({ overall }).score!;
      expect(score).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });

  it('the landing Monitor demo equals a fresh REAL pipeline run (not a static payload)', () => {
    const demo = buildLandingMonitorDemo();
    // recompute independently through the same public pipeline
    let flow = createCustomerFlow({ text: 'wanilia' });
    flow = setProductType(flow, 'gelato');
    flow = selectServingMode(flow, 'temp_minus_11');
    flow = setBatchGrams(flow, 1000);
    const result = buildCustomerResult(flow);
    expect(result.recipeInput).not.toBeNull();
    const recomputed = buildMonitorHomeView(calculateRecipe(result.recipeInput!), null);
    expect(demo).toEqual(recomputed);
    // and the score is the sanctioned derived presentation, not free text
    expect(demo.score.display).toMatch(/^(\d{1,2}\/10|—)$/);
  });

  it('dev fixtures with sample scores are only reachable behind import.meta.env.DEV routes', () => {
    const lines = read('app/router.tsx').split('\n');
    const devRouteIndexes = lines
      .map((line, index) => (line.includes('path="/dev/') ? index : -1))
      .filter((index) => index >= 0);
    expect(devRouteIndexes.length).toBeGreaterThan(0);
    for (const index of devRouteIndexes) {
      // the guard sits on the same line or (multi-line JSX) the previous one
      const guarded =
        lines[index]!.includes('import.meta.env.DEV') ||
        (lines[index - 1] ?? '').includes('import.meta.env.DEV');
      expect(guarded, `unguarded dev route: ${lines[index]!.trim()}`).toBe(true);
    }
  });

  it('the §14.1 status line and readiness derive from the same engine result (no fake "balanced")', () => {
    // ADDENDUM (2): the status line/readiness now read the TECHNICAL fit.
    const source = read('features/user-monitor/recipeIndicatorStatuses.ts');
    expect(source).toContain('recipeTechnicalFit(result)');
    expect(source).not.toMatch(/status:\s*['"]balanced['"]/);
  });
});
