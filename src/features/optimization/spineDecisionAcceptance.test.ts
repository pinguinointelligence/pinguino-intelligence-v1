/**
 * Spine decision-layer ACCEPTANCE pins (Slice 25) — the cross-cutting invariants
 * behind docs/spine/SPINE_DECISION_ACCEPTANCE.md:
 *
 *  1. the FULL 12-cell profile × temperature grid selects its own seeded band —
 *     no category fallback, no temperature fallback, and the solver's violation
 *     detection, the regulator target and the Slice-14 override all carry the
 *     SAME numbers (single source of band truth per cell);
 *  2. every exact preview equals a DIRECT `calculateRecipe` re-run of the
 *     proposed snapshot — a preview can never drift from the engine of record;
 *  3. batch totals stay coherent through every recipe-changing branch (add-only
 *     rescue, uniform scale-down, verified substitution);
 *  4. no stale violation survives a branch: the after-state hard-gate list is
 *     always a FRESH regulator evaluation of the resulting full recipe.
 *
 * Pure fixtures + the real engine. No DB, no Mapper, no persistence.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, selectTargetBand, type ProductCategory, type RecipeInput } from '@/engine';
import {
  ACTIVE_PRODUCT_PROFILES,
  adaptBaseEngineResult,
  evaluateTemperatureRegulator,
  type ProductProfile,
  type ServingTemperatureC,
} from '@/spine';
import {
  previewBatchRescueRecalculation,
  previewStockShortageRecalculation,
  previewVerifiedSubstituteRecalculation,
} from './branchRecalculationPreview';
import {
  BRANCH_RECALCULATION_SCENARIOS,
  type BatchRescueScenario,
  type StockShortageScenario,
  type VerifiedSubstituteScenario,
} from './branchRecalculationFixtures';
import { compareEngineVsShadowBands } from './temperatureAwareTargetBands';
import { regulatorTargetOverride } from './solverTargetInjection';

const TEMPERATURES: readonly ServingTemperatureC[] = [-11, -12, -13];

/** Spine profile → the engine category whose seeded band the recipe selects. */
const PROFILE_TO_CATEGORY: Readonly<Record<ProductProfile, ProductCategory>> = {
  standard_gelato: 'milk_gelato',
  chocolate_gelato: 'chocolate_gelato',
  sorbet: 'sorbet',
  vegan_gelato: 'vegan_gelato',
};

const scenario = <T>(id: string): T =>
  BRANCH_RECALCULATION_SCENARIOS.find((s) => s.id === id)! as unknown as T;

const rescue = (id: string) => {
  const s = scenario<BatchRescueScenario>(id);
  return previewBatchRescueRecalculation({ rescueIntent: s.rescueIntent, actualRecipe: s.actualRecipe });
};

/* ────────────────────────────────────────────────────────────────────────── *
 * 1. The 12-cell band grid — one source of truth per profile × temperature    *
 * ────────────────────────────────────────────────────────────────────────── */

describe('acceptance — the FULL 12-cell profile × temperature band grid (B2)', () => {
  it('every cell selects its OWN seeded band: no category fallback, no temperature fallback', () => {
    for (const profile of ACTIVE_PRODUCT_PROFILES) {
      const category = PROFILE_TO_CATEGORY[profile];
      for (const t of TEMPERATURES) {
        const selection = selectTargetBand(category, t);
        expect(selection, `${profile} ${t}`).not.toBeNull();
        expect(selection!.band.category, `${profile} ${t} category`).toBe(category);
        expect(selection!.band.temperature_c, `${profile} ${t} temperature`).toBe(t);
        expect(selection!.band.status, `${profile} ${t} status`).toBe('seeded');
        expect(selection!.category_fallback, `${profile} ${t} category_fallback`).toBe(false);
        expect(selection!.temperature_fallback, `${profile} ${t} temperature_fallback`).toBe(false);
      }
    }
  });

  it('every cell is ALIGNED with the locked regulator bands (shadow comparison, all 12 cells)', () => {
    for (const profile of ACTIVE_PRODUCT_PROFILES) {
      for (const t of TEMPERATURES) {
        const comparison = compareEngineVsShadowBands(profile, t);
        expect(comparison.status, `${profile} ${t}`).toBe('aligned');
        expect(comparison.solverTargetsCorrectBand, `${profile} ${t}`).toBe(true);
        expect(comparison.engineCategoryFallback, `${profile} ${t}`).toBe(false);
        expect(comparison.engineTemperatureFallback, `${profile} ${t}`).toBe(false);
      }
    }
  });

  it('the Slice-14 solver override matches the engine npac band on all 12 cells (one documented residual)', () => {
    for (const profile of ACTIVE_PRODUCT_PROFILES) {
      const category = PROFILE_TO_CATEGORY[profile];
      for (const t of TEMPERATURES) {
        const override = regulatorTargetOverride(profile, t);
        expect(override.active, `${profile} ${t}`).toBe(true);
        const engineBand = selectTargetBand(category, t)!.band.metrics.npac!;
        if (profile === 'standard_gelato' && t === -11) {
          // The ONE documented residual spec difference: engine −11 npac [33,42]
          // (−11 engine contract) vs regulator −11 [33,43] (GELATO doc). Center
          // delta 0.5 — inside the documented same-target tolerance (1 point).
          // Pinned exactly so any drift is loud.
          expect(engineBand).toEqual({ min: 33, max: 42 });
          expect(override.bands.npac).toEqual({ min: 33, max: 43 });
        } else {
          expect(override.bands.npac, `${profile} ${t} npac band`).toEqual({
            min: engineBand.min,
            max: engineBand.max,
          });
        }
        // In EVERY cell the two centers agree within the documented tolerance.
        const engineCenter = (engineBand.min + engineBand.max) / 2;
        const overrideCenter = (override.bands.npac!.min + override.bands.npac!.max) / 2;
        expect(Math.abs(engineCenter - overrideCenter), `${profile} ${t} center`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('chocolate NEVER silently reuses the milk bands — its npac band differs at every temperature', () => {
    for (const t of TEMPERATURES) {
      const milk = selectTargetBand('milk_gelato', t)!.band.metrics.npac!;
      const chocolate = selectTargetBand('chocolate_gelato', t)!.band.metrics.npac!;
      expect(
        milk.min !== chocolate.min || milk.max !== chocolate.max,
        `chocolate ${t} must not equal milk`,
      ).toBe(true);
    }
  });

  it('unseeded categories (fruit/nut/alcohol) keep the DOCUMENTED milk fallback — flagged, never silent', () => {
    for (const category of ['fruit_gelato', 'nut_gelato', 'alcohol_gelato'] as const) {
      const selection = selectTargetBand(category, -12);
      expect(selection).not.toBeNull();
      expect(selection!.band.category).toBe('milk_gelato'); // calibration-pending fallback
      expect(selection!.category_fallback).toBe(true); // always flagged
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 * 2. Exact previews equal a direct calculateRecipe re-run (B4)                *
 * ────────────────────────────────────────────────────────────────────────── */

const metricsOf = (recipe: RecipeInput) => adaptBaseEngineResult(calculateRecipe(recipe)).metrics;

describe('acceptance — every exact preview equals a DIRECT calculateRecipe re-run (B4)', () => {
  it('IF9 add-only rescue (partial, −12): afterMetrics === engine metrics of the proposed snapshot', () => {
    const r = rescue('rescue-too-hard-13');
    expect(r.exactStatus).toBe('partial_improvement');
    const fresh = metricsOf(r.proposedRecipeSnapshot as RecipeInput);
    expect(r.afterMetrics).toEqual(fresh);
  });

  it('IF9 verified vegan rescue (calculated, −11): afterMetrics === engine metrics of the snapshot', () => {
    const r = rescue('rescue-vegan-too-soft');
    expect(r.exactStatus).toBe('calculated');
    const fresh = metricsOf(r.proposedRecipeSnapshot as RecipeInput);
    expect(r.afterMetrics).toEqual(fresh);
  });

  it('IF10 scale-down: afterMetrics === engine metrics of the scaled snapshot', () => {
    const s = scenario<StockShortageScenario>('shortage-scale-down');
    const r = previewStockShortageRecalculation({ shortageIntent: s.shortageIntent, plannedRecipe: s.plannedRecipe });
    expect(r.exactStatus).toBe('calculated');
    const fresh = metricsOf(r.proposedRecipeSnapshot as RecipeInput);
    expect(r.afterMetrics).toEqual(fresh);
  });

  it('IF10 verified substitution: afterMetrics === engine metrics of the swapped snapshot', () => {
    const s = scenario<VerifiedSubstituteScenario>('shortage-verified-substitute');
    const r = previewVerifiedSubstituteRecalculation({
      shortageIntent: s.shortageIntent,
      plannedRecipe: s.plannedRecipe,
      contract: s.contract(),
    });
    expect(r.exactStatus).toBe('calculated');
    const fresh = metricsOf(r.proposedRecipeSnapshot as RecipeInput);
    expect(r.afterMetrics).toEqual(fresh);
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 * 3. Batch totals stay coherent through every recipe-changing branch (B3)     *
 * ────────────────────────────────────────────────────────────────────────── */

const itemSum = (recipe: RecipeInput): number =>
  recipe.items.reduce((sum, i) => sum + i.planned_grams, 0);

describe('acceptance — batch totals stay coherent through recipe-changing branches (B3)', () => {
  it('IF9 add-only: snapshot item mass = original mass + EXACTLY the exposed added grams', () => {
    for (const id of ['rescue-too-hard-13', 'rescue-vegan-too-soft', 'rescue-sorbet-too-soft']) {
      const s = scenario<BatchRescueScenario>(id);
      const r = rescue(id);
      expect(['calculated', 'partial_improvement'], `${id} status`).toContain(r.exactStatus);
      const added = r.exactActions.reduce((sum, a) => sum + a.grams, 0);
      const snapshot = r.proposedRecipeSnapshot as RecipeInput;
      expect(itemSum(snapshot), id).toBeCloseTo(itemSum(s.actualRecipe) + added, 6);
      // add-only: no original line ever shrinks
      for (const original of s.actualRecipe.items) {
        const after = snapshot.items.find((i) => i.id === original.id);
        expect(after, `${id} kept line ${original.id}`).toBeDefined();
        expect(after!.planned_grams, `${id} line ${original.id}`).toBeGreaterThanOrEqual(
          original.planned_grams,
        );
      }
    }
  });

  it('IF10 scale-down: EVERY line and the batch target scale by exactly the limiting ratio', () => {
    const s = scenario<StockShortageScenario>('shortage-scale-down');
    const r = previewStockShortageRecalculation({ shortageIntent: s.shortageIntent, plannedRecipe: s.plannedRecipe });
    const factor = r.scaleFactor!;
    const snapshot = r.proposedRecipeSnapshot as RecipeInput;
    expect(snapshot.target_batch_grams).toBeCloseTo(s.plannedRecipe.target_batch_grams * factor, 6);
    expect(snapshot.items).toHaveLength(s.plannedRecipe.items.length);
    for (const [index, item] of snapshot.items.entries()) {
      expect(item.planned_grams, item.id).toBeCloseTo(
        s.plannedRecipe.items[index]!.planned_grams * factor,
        6,
      );
    }
  });

  it('IF10 substitution: kept original + substitute grams = EXACTLY the original line grams', () => {
    const s = scenario<VerifiedSubstituteScenario>('shortage-verified-substitute');
    const contract = s.contract();
    const r = previewVerifiedSubstituteRecalculation({
      shortageIntent: s.shortageIntent,
      plannedRecipe: s.plannedRecipe,
      contract,
    });
    expect(r.exactStatus).toBe('calculated');
    const original = s.plannedRecipe.items.find((i) => i.id === contract.lineId)!;
    expect(r.substitution!.availableOriginalG + r.substitution!.substituteG).toBeCloseTo(
      original.planned_grams,
      6,
    );
    // total batch mass is preserved by the swap
    const snapshot = r.proposedRecipeSnapshot as RecipeInput;
    expect(itemSum(snapshot)).toBeCloseTo(itemSum(s.plannedRecipe), 6);
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 * 4. No stale violation survives a recipe-changing branch (B3)                *
 * ────────────────────────────────────────────────────────────────────────── */

describe('acceptance — the after-state is ALWAYS a fresh regulator evaluation (B3)', () => {
  const freshFailures = (r: { proposedRecipeSnapshot: unknown }, profile: string, t: number) =>
    evaluateTemperatureRegulator({
      productProfile: profile,
      servingTemperatureC: t,
      metrics: metricsOf(r.proposedRecipeSnapshot as RecipeInput),
      texturePreference: 'medium',
    }).hardGateFailures;

  it('IF9 partial (−12): the reported residual failures equal a fresh evaluation of the snapshot', () => {
    const s = scenario<BatchRescueScenario>('rescue-too-hard-13');
    const r = rescue('rescue-too-hard-13');
    expect(r.rerun!.after.hardGateFailures).toEqual(
      freshFailures(r, s.rescueIntent.productProfile, s.rescueIntent.intendedServingTemperatureC),
    );
    // the pre-branch failure list is NOT what is reported after the branch
    expect(r.rerun!.after.hardGateFailures).not.toEqual(r.rerun!.before.hardGateFailures);
  });

  it('IF9 calculated vegan rescue: the pre-branch npac violation is GONE in the fresh evaluation', () => {
    const s = scenario<BatchRescueScenario>('rescue-vegan-too-soft');
    const r = rescue('rescue-vegan-too-soft');
    expect(r.rerun!.before.hardGateFailures.length).toBeGreaterThan(0); // it WAS broken
    const fresh = freshFailures(r, s.rescueIntent.productProfile, s.rescueIntent.intendedServingTemperatureC);
    expect(fresh).toEqual([]); // fully rescued — verified against the FULL resulting recipe
    expect(r.rerun!.after.hardGateFailures).toEqual(fresh);
  });
});
