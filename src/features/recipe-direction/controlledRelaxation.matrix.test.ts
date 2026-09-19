/**
 * ONE SHARED DIRECTION / RELAXATION POLICY — PROVEN ACROSS PROFILES AND
 * MACHINE FAMILIES (owner decision 2026-09-19 § 15, § 17).
 *
 * „Global" is not a claim about where the source file lives. It is a claim
 * about what real consumers do, so this matrix walks the canonical Direction
 * profiles across the six customer-visible machine/serving choices and every
 * level that the policy distinguishes.
 *
 * The machine families differ ONLY by their real physical facts — the serving
 * temperature and, for the two domestic Ninja modes, the owner-approved recipe
 * mass (`customer-flow/servingMode.ts`: Ninja Gelato −13 at 700 g, Ninja Swirl
 * −11 at 480 g, Świeże −11). The POLICY may not differ at all, and that is
 * what every assertion below checks.
 *
 * Nothing here pins a POD. Pinning numbers would prove a fixture; these
 * assertions prove the rule:
 *
 *   • ±1 never leaves the normal envelope, on any profile, on any machine;
 *   • ±2 may, but never past the approved emergency band;
 *   • a relaxed result is VALID — legal, on batch, published — and priced;
 *   • an unrelaxed result is never priced;
 *   • the extended envelope is never reported for a level that cannot use it.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type RecipeDirectionTarget,
  type RecipeInput,
} from '@/engine';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import {
  sorbetAuthoritySnapshots,
  sorbetMultiMainBase,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import type { VisibleProductType } from '@/features/studio/productType';
import { SERVING_MODES } from '@/features/customer-flow/servingMode';
import {
  RELAXATION_SCORE_PENALTY_CAP,
  relaxableOwnerRanges,
  relaxationCost,
  relaxationScorePenalty,
} from './relaxableRangePolicy';

const NONE = { byLineId: {} } as const;
const AT = '2026-09-19T00:00:00.000Z';

const CATEGORY: Record<VisibleProductType, RecipeInput['category']> = {
  gelato: 'milk_gelato',
  sorbet: 'sorbet',
  vegan: 'vegan_gelato',
  protein: 'protein_gelato',
};

/** The six canonical customer-visible choices, as the app itself defines them. */
const MACHINES = SERVING_MODES.map((mode) => ({
  id: mode.id,
  kind: mode.kind,
  temperatureC: mode.temperatureC as -11 | -12 | -13,
  batchGrams: mode.approvedMassG ?? 1_000,
}));

const LEVELS: readonly RecipeDirectionTarget[] = [-2, -1, 1, 2];

/** Scale a draft to a machine's approved mass without moving any proportion. */
const toBatch = (input: RecipeInput, batchGrams: number): RecipeInput => {
  const total = input.items.reduce((sum, item) => sum + item.planned_grams, 0);
  if (!(total > 0)) return { ...input, target_batch_grams: batchGrams };
  const scaled = input.items.map((item) => ({
    ...item,
    planned_grams: Math.max(1, Math.round((item.planned_grams * batchGrams) / total)),
  }));
  const drift = scaled.reduce((sum, item) => sum + item.planned_grams, 0) - batchGrams;
  const largest = scaled.reduce((best, item) =>
    item.planned_grams > best.planned_grams ? item : best,
  );
  return {
    ...input,
    target_batch_grams: batchGrams,
    items: scaled.map((item) =>
      item.id === largest.id ? { ...item, planned_grams: item.planned_grams - drift } : item,
    ),
  };
};

const draft = (
  product: VisibleProductType,
  temperatureC: -11 | -12 | -13,
  batchGrams: number,
  sweetness: RecipeDirectionTarget,
): RecipeInput => {
  const goals = {
    flavor_intensity: 'balanced' as const,
    cost_priority: 'balanced' as const,
    formulation_strategy: 'optimal' as const,
    direction_targets_active: true,
    direction_targets: {
      sweetness,
      softness: 0 as RecipeDirectionTarget,
      creaminess: 0 as RecipeDirectionTarget,
      flavor: 0 as RecipeDirectionTarget,
    },
  };
  if (product === 'sorbet') {
    const base = sorbetMultiMainBase(temperatureC);
    return { ...toBatch(base, batchGrams), goals: { ...base.goals, ...goals } };
  }
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: product,
    servingModeId: `temp_minus_${Math.abs(temperatureC)}` as
      | 'temp_minus_11'
      | 'temp_minus_12'
      | 'temp_minus_13',
    formulationStrategy: 'optimal',
    targetBatchGrams: batchGrams,
  });
  return {
    items: starter.items,
    mode: 'classic',
    category: CATEGORY[product],
    target_temperature_c: temperatureC,
    target_batch_grams: batchGrams,
    machine_capacity_grams: null,
    goals,
  };
};

const options = (product: VisibleProductType, input: RecipeInput) =>
  product === 'sorbet' ? { productBehaviorSnapshots: sorbetAuthoritySnapshots(input) } : {};

const CELLS = (['gelato', 'sorbet', 'vegan', 'protein'] as const).flatMap((product) =>
  MACHINES.map((machine) => [product, machine] as const),
);

describe('§17 — one shared policy across every profile and machine family', () => {
  it.each(CELLS)('%s on %o', (product, machine) => {
    const seen: string[] = [];
    for (const level of LEVELS) {
      const input = draft(product, machine.temperatureC, machine.batchGrams, level);
      const built = buildOptimizePreview(input, NONE, AT, options(product, input));

      // A refusal is an allowed outcome — it is never allowed to be dishonest.
      if (!built.ok) {
        expect(built.code).toBeTruthy();
        seen.push(`${level}:refused`);
        continue;
      }
      const preview = built.preview;
      const proposed = preview.proposedInput;

      // HARD LEGALITY FIRST, on every cell, at every level.
      if (preview.diagnosticOnly !== true) {
        expect(detectViolations(calculateRecipe(proposed))).toEqual([]);
      }
      expect(
        Math.abs(
          proposed.items.reduce((sum, item) => sum + item.planned_grams, 0) -
            proposed.target_batch_grams,
        ),
      ).toBeLessThan(0.5);
      expect(proposed.items.some((item) => item.planned_grams < 0)).toBe(false);

      const cost = relaxationCost(proposed);
      const penalty = relaxationScorePenalty(proposed);

      if (Math.abs(level) === 1) {
        // CLASS C — ±1 keeps the normal / ideal envelope. No profile and no
        // machine may buy a ±1 target with an owner band.
        expect(cost).toBe(0);
        expect(penalty).toBe(0);
        expect(preview.directionEnvelope === 'extended').toBe(false);
      } else {
        // CLASS E — ±2 may leave a registered band, never past the approved one.
        for (const range of relaxableOwnerRanges(proposed)) {
          expect(range.normalizedExcursion).toBeLessThanOrEqual(1 + 1e-9);
        }
        // CLASS F — a relaxed candidate is VALID, and priced conservatively.
        expect(penalty).toBeLessThanOrEqual(RELAXATION_SCORE_PENALTY_CAP);
        if (cost > 0) expect(penalty).toBeGreaterThan(0);
      }
      // CLASS M — no excursion, no price. True on every cell, both levels.
      if (cost === 0) expect(penalty).toBe(0);

      seen.push(
        `${level}:${preview.directionEnvelope ?? 'normal'}${cost > 0 ? `:relaxed(${cost.toFixed(3)})` : ''}`,
      );
    }
    console.info(`RELAX-MATRIX ${product} ${machine.id} @${machine.temperatureC} ${machine.batchGrams}g — ${seen.join(' ')}`);
  }, 900_000);
});
