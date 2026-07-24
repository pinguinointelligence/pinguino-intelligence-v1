/**
 * LIVE FAILURE 2 — OPTIMIZATION STOPS EARLY (owner P0 NIGHTLY).
 *
 * Contract pinned here: for UNCONSTRAINED drafts the pipeline ITERATES the
 * canonical solver WHILE a verified improvement exists and stops ONLY at:
 *  - all bands in range (10/10) — `all_bands_in_range`;
 *  - a VERIFIED fixed point — `fixed_point_no_proposal` (with the sub-detail
 *    distinguishing a true fixed point from a missing candidate and from a
 *    provisional-band-only conflict) or `no_improving_move`;
 *  - the deterministic iteration cap (MAX_SOLVER_ROUNDS = 12), REPORTED
 *    honestly via `capped`;
 *  - a hard incompatibility (upstream structured failures).
 * Iteration count, the per-round violation/severity trajectory and the stop
 * reason are exposed on the preview / structured failure for QA diagnostics.
 * Determinism: same input → same rounds → same result. Beat-the-null and the
 * provisional-score labelling are unchanged.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { B3_OWNER_DAIRY_MILK_GELATO, strawberrySurrogate } from '@/qa/engine-validation/fixtures';
import { buildOptimizePreview, MAX_SOLVER_ROUNDS, plannedSum } from './applyPipeline';

const NO = { byLineId: {} };

const b3 = (): RecipeInput => structuredClone(B3_OWNER_DAIRY_MILK_GELATO) as RecipeInput;

/** The complete fruit-gelato reference draft (provisional/fallback bands). */
const fruitComplete = (): RecipeInput => ({
  mode: 'classic',
  category: 'fruit_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  items: [
    { id: 'l-straw', ingredient: strawberrySurrogate(), planned_grams: 350, actual_grams: null, lock_type: 'unlocked' },
    { id: 'l-milk', ingredient: findDemoIngredient('milk_3_5')!, planned_grams: 380, actual_grams: null, lock_type: 'unlocked' },
    { id: 'l-cream', ingredient: findDemoIngredient('cream_30')!, planned_grams: 80, actual_grams: null, lock_type: 'unlocked' },
    { id: 'l-smp', ingredient: findDemoIngredient('smp')!, planned_grams: 40, actual_grams: null, lock_type: 'unlocked' },
    { id: 'l-suc', ingredient: findDemoIngredient('sucrose')!, planned_grams: 110, actual_grams: null, lock_type: 'unlocked' },
    { id: 'l-dex', ingredient: findDemoIngredient('dextrose')!, planned_grams: 35, actual_grams: null, lock_type: 'unlocked' },
    { id: 'l-tara', ingredient: findDemoIngredient('tara_gum')!, planned_grams: 5, actual_grams: null, lock_type: 'unlocked' },
  ],
});

describe('multi-round iteration on NATIVE approved bands (tests 11–12)', () => {
  it('B3 (milk_gelato −11, native seeded bands): iterates PAST round 1 to 10/10 (test 11)', () => {
    const result = buildOptimizePreview(b3(), NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const iteration = result.preview.iteration!;
    expect(iteration).toBeDefined();
    // The owner failure was a 1-round stop — B3 provably needs MORE than one.
    expect(iteration.solverInvocations).toBeGreaterThan(1);
    expect(iteration.stopReason).toBe('all_bands_in_range');
    expect(iteration.capped).toBe(false);
    expect(result.preview.violationsAfter).toBe(0); // 10/10 — every band in range
    // Trajectory: monotone verified improvement, round 0 = the start state.
    expect(iteration.rounds[0]!.round).toBe(0);
    expect(iteration.rounds[0]!.violations).toBeGreaterThan(0);
    for (let i = 1; i < iteration.rounds.length; i += 1) {
      const prev = iteration.rounds[i - 1]!;
      const next = iteration.rounds[i]!;
      const improved =
        next.violations < prev.violations || next.severityPoints < prev.severityPoints;
      expect(improved, `round ${next.round} must verifiably improve`).toBe(true);
    }
    expect(iteration.rounds[iteration.rounds.length - 1]!.violations).toBe(0);
  });

  it('the NATIVE fixed point is proven, never assumed: a clean recipe reports already_clean (test 12)', () => {
    const clean = buildOptimizePreview(b3(), NO, 'now');
    expect(clean.ok).toBe(true);
    if (!clean.ok) return;
    // Feed the converged result back in: the pipeline must recognize the
    // fixed point honestly (nothing left to improve — 10/10).
    const again = buildOptimizePreview(clean.preview.proposedInput, NO, 'now');
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.code).toBe('already_clean');
  });
});

describe('provisional/fallback profiles keep iterating AND keep the honest labels (test 13)', () => {
  it('fruit_gelato: fallback bands GUIDE the iteration; the label stays provisional', () => {
    const result = buildOptimizePreview(fruitComplete(), NO, 'now');
    // This fixture IS the reference template — the honest terminal state is
    // the explanatory best-safe result (never a bare 1-round rejection), with
    // the iteration diagnostics attached and the band provenance named.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('best_safe_result');
    if (result.code !== 'best_safe_result') return;
    expect(result.bandSource).toBe('category_fallback'); // provisional, labelled
    expect(result.templateStatus).toBe('reference_derived'); // never „approved”
    expect(result.iteration).toBeDefined();
    // The solver REALLY ran and stopped for a named reason — not after round 1
    // by construction: the stop is a verified fixed point / cap, never a
    // hard-coded round limit of 1.
    expect(result.iteration!.solverInvocations).toBeGreaterThan(0);
    expect(['fixed_point_no_proposal', 'no_improving_move', 'iteration_cap']).toContain(
      result.iteration!.stopReason,
    );
    // Provisional-band conflicts are named as such (fallback bands do not
    // hard-reject alone — the explanatory state carries the classification).
    if (result.iteration!.stopReason !== 'iteration_cap') {
      expect(result.iteration!.stopDetail).toBe('provisional_band_conflict');
    }
  });
});

describe('determinism + the honest cap (tests 14, 18)', () => {
  it('same input → byte-identical result and identical trajectory, 5 runs (test 14)', () => {
    const runs = Array.from({ length: 5 }, () => buildOptimizePreview(b3(), NO, 'now'));
    const serialize = (r: (typeof runs)[number]) =>
      JSON.stringify(
        r.ok
          ? {
              items: r.preview.proposedInput.items.map((i) => [i.id, i.planned_grams]),
              iteration: r.preview.iteration,
            }
          : r,
      );
    for (const run of runs) expect(serialize(run)).toBe(serialize(runs[0]!));
  });

  it('the iteration cap is a DETERMINISTIC, honestly-reported guard (test 18)', () => {
    expect(MAX_SOLVER_ROUNDS).toBe(12);
    const result = buildOptimizePreview(b3(), NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // B3 converges well under the cap — `capped` must be FALSE (the flag may
    // only ever fire when the cap really cut an improving run short).
    expect(result.preview.iteration!.capped).toBe(false);
    expect(result.preview.iteration!.solverInvocations).toBeLessThanOrEqual(MAX_SOLVER_ROUNDS);
  });

  it('beat-the-null stays absolute for unconstrained NATIVE-profile drafts (frozen baseline)', () => {
    // The owner's forbidden 8 × 125 g class: an off-band draft whose only
    // "improvement" would be the proportional rescale must still fail.
    const damaged: RecipeInput = {
      ...b3(),
      items: b3().items.map((item) => ({ ...item, planned_grams: 1 })),
    };
    const result = buildOptimizePreview(damaged, NO, 'now');
    if (result.ok) {
      // If a preview exists it must be a REAL formulation that beats the null —
      // batch-true and materially different from the equal-split projection.
      expect(Math.abs(plannedSum(result.preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
      const grams = result.preview.proposedInput.items.map((i) => i.planned_grams);
      const equalSplit = 1000 / grams.length;
      expect(grams.some((g) => Math.abs(g - equalSplit) > 1)).toBe(true);
    } else {
      expect(['no_proposal', 'unsafe_proposal', 'best_safe_result', 'missing_required_role']).toContain(
        result.code,
      );
    }
  });
});
