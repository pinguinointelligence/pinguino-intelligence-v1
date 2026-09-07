import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeDirectionTarget, type RecipeInput } from '@/engine';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import {
  sorbetAuthoritySnapshots,
  sorbetMultiMainBase,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import type { VisibleProductType } from '@/features/studio/productType';
import { bandDistance, requestedDirectionBands } from './directionBandDistance';
import { buildRecipeDirectionPlan } from './recipeDirectionTargets';

/**
 * §8 — SHARED DIRECTION NEAREST, CROSS-PROFILE.
 *
 * The NEAREST ranking lives in shared machinery, so the contract it enforces has
 * to hold for every profile that exposes a Direction axis — not only for the
 * profile whose defect exposed it.
 *
 * THE CONTRACT, stated so it is falsifiable without hardcoding any expected POD:
 *
 *   Every level's delivered candidate is, by construction, a legal candidate the
 *   engine demonstrably reaches from this same draft. So for any requested level
 *   L, the candidate returned for L must be at least as near to L's OWN band as
 *   every other level's candidate is to L's band.
 *
 * That is exactly "do not move away from the requested target when a closer
 * legal candidate exists", and it is the assertion that fails loudly on the
 * historical defects:
 *
 *   Protein −11 +2 returned POD 14.7201 (distance 1.2799 from [16,17]) while the
 *     +1 candidate sat at 15.5571 — distance 0.4429 from that same band.
 *   Protein −13 −1 returned 14.9812 (0.9812 from [13,14]) while the −2 candidate
 *     sat at 13.9272 — inside the band.
 *   Gelato −2 moved POD UP to 16.35544 (3.3772 from [12,13]) when asked for LESS
 *     sweetness; the nearest reachable candidate was 15.14048 (2.1405).
 *
 * A profile whose axis is unavailable is asserted to be honestly unavailable
 * instead — no band published, so nothing downstream can silently optimize
 * toward a target the surface reports as blocked.
 */

const NONE = { byLineId: {} } as const;
const AT = '2026-08-23T15:30:00.000Z';
const LEVELS: readonly RecipeDirectionTarget[] = [-2, -1, 0, 1, 2];

const CATEGORY: Record<VisibleProductType, RecipeInput['category']> = {
  gelato: 'milk_gelato',
  sorbet: 'sorbet',
  vegan: 'vegan_gelato',
  protein: 'protein_gelato',
};

const withSweetness = (input: RecipeInput, sweetness: RecipeDirectionTarget): RecipeInput => ({
  ...input,
  goals: {
    ...input.goals,
    direction_targets_active: true,
    direction_targets: { sweetness, softness: 0, creaminess: 0, flavor: 0 },
  },
});

const draft = (
  product: VisibleProductType,
  temperatureC: -11 | -12 | -13,
  sweetness: RecipeDirectionTarget,
  strategy: 'optimal' | 'eco' = 'optimal',
): RecipeInput => {
  // Sorbet is a Main-driven profile: the bare scaffold has no fruit, so it
  // legitimately reports `missing_required_role`. Use the canonical Multi-Main
  // fixture (2:1 strawberry/lime), which also exercises §13 here.
  if (product === 'sorbet') return withSweetness(sorbetMultiMainBase(temperatureC), sweetness);
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: product,
    servingModeId: `temp_minus_${Math.abs(temperatureC)}` as
      | 'temp_minus_11'
      | 'temp_minus_12'
      | 'temp_minus_13',
    formulationStrategy: strategy,
    targetBatchGrams: 1000,
  });
  return {
    items: starter.items,
    mode: 'classic',
    category: CATEGORY[product],
    target_temperature_c: temperatureC,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: {
      flavor_intensity: 'balanced',
      cost_priority: 'balanced',
      formulation_strategy: strategy,
      direction_targets_active: true,
      direction_targets: { sweetness, softness: 0, creaminess: 0, flavor: 0 },
    },
  };
};

const options = (product: VisibleProductType, input: RecipeInput) =>
  product === 'sorbet' ? { productBehaviorSnapshots: sorbetAuthoritySnapshots(input) } : {};

const CELLS = (['gelato', 'sorbet', 'vegan', 'protein'] as const).flatMap((product) =>
  ([-11, -12, -13] as const).map((temperatureC) => [product, temperatureC] as const),
);

describe('§8 — no profile moves away from its requested Direction target', () => {
  it.each(CELLS)('%s @ %d °C', (product, temperatureC) => {
    const probe = draft(product, temperatureC, 0);
    const axis = buildRecipeDirectionPlan(probe).axes.find((entry) => entry.axis === 'sweetness')!;

    if (axis.status !== 'working') {
      // Honestly unavailable: never publish a band the profile cannot honour.
      expect(axis.targetBand).toBeNull();
      expect(axis.reason).toBeTruthy();
      return;
    }

    const delivered = LEVELS.map((level) => {
      const input = draft(product, temperatureC, level);
      const band = buildRecipeDirectionPlan(input).axes.find(
        (entry) => entry.axis === 'sweetness',
      )!.targetBand!;
      const built = buildOptimizePreview(input, NONE, AT, options(product, input));
      // `no_proposal` is itself a delivered outcome: the engine could not move
      // the draft toward the request, so the DRAFT is what the user is left
      // with. Ranking it as the delivered candidate is what makes the contract
      // below falsifiable rather than skippable.
      if (!built.ok) {
        expect(['no_proposal', 'already_clean']).toContain((built as { code: string }).code);
      }
      const proposed = built.ok ? built.preview.proposedInput : input;
      const value = calculateRecipe(proposed).indicators.find((i) => i.key === 'pod')!.value!;
      return { level, band, value, distance: bandDistance(value, band), proposed };
    });

    console.info(
      `NEAREST ${JSON.stringify({
        product,
        temperatureC,
        rows: delivered.map((row) => ({
          level: row.level,
          band: [row.band.min, row.band.max],
          pod: Number(row.value.toFixed(4)),
          distance: Number(row.distance.toFixed(4)),
          status: row.distance === 0 ? 'ACHIEVED' : 'NEAREST',
        })),
      })}`,
    );

    for (const row of delivered) {
      // Safety is never traded for a preference.
      expect(row.proposed.items.some((item) => item.planned_grams <= 0)).toBe(false);
      // THE CONTRACT: no other reachable candidate is nearer to this row's band.
      for (const other of delivered) {
        expect(bandDistance(other.value, row.band)).toBeGreaterThanOrEqual(row.distance - 1e-9);
      }
    }

    // A working selector must actually move the product.
    expect(new Set(delivered.map((row) => row.value.toFixed(4))).size).toBeGreaterThan(1);
    // And it may never move backwards.
    for (let index = 1; index < delivered.length; index += 1) {
      expect(delivered[index]!.value).toBeGreaterThanOrEqual(delivered[index - 1]!.value - 1e-6);
    }
  }, 900_000);

  it('the delivered candidate is always scored against the REQUESTED band', () => {
    // Guards the rebase: a candidate generated while aiming at a neighbouring
    // band must still carry the user's OWN request, never the probe's.
    for (const level of LEVELS) {
      const input = draft('protein', -11, level);
      const bands = requestedDirectionBands(input);
      // Protein now carries TWO requested bands: sweetness (pod) and hardness
      // (ice_fraction, restored 2026-09-03). Both must be scored against the
      // REQUESTED band, which is what this contract exists to prove.
      expect(bands.map((entry) => entry.axis).sort()).toEqual(['softness', 'sweetness']);
      expect(bands.find((entry) => entry.axis === 'sweetness')!.band).toEqual(
        buildRecipeDirectionPlan(input).axes.find((a) => a.axis === 'sweetness')!.targetBand,
      );
    }
  });
});
