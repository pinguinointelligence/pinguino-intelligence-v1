import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { assessProteinFormulation } from './proteinAuthority';

/**
 * PROTEIN DIRECTION AUTHORITY — investigated 2026-08-23, axis remains BLOCKED.
 *
 * This file locks the truthful current state and records WHY, so the next
 * attempt starts from evidence instead of from scratch.
 *
 * SWEETNESS — safe, but NOT yet honest, so it stays blocked.
 *   Safety was proven: the complete −2..+2 × −2..+2 × 3 temperatures × 2
 *   strategies matrix (150 states) is natively hard-safe, claim-qualified,
 *   applied, with zero zero-gram lines. POD is also a legitimate protein-side
 *   measure — it is composition-derived from each ingredient's own stored
 *   `pod_value`, and a five-fifth target subdivides the Protein profile's OWN
 *   approved POD band [12,17]. No borrowed curve, no invented reference.
 *
 *   What blocks it is DELIVERY, not safety. Routing Protein through the exact
 *   five-step objective (the Standard Gelato path) made −12 fully monotone and
 *   five-distinct — 13.8201 / 13.8224 / 14.9346 / 15.1027 / 16.4588 — and made
 *   ECO stop collapsing. Two sequences still move BACKWARDS at the extremes:
 *
 *     −11 optimal+eco:  12.4716 13.4992 14.3305 15.5571 [14.7201]  ← +2 < +1
 *     −13 optimal+eco:  13.9272 14.9812 [14.6927] 15.5194 16.5279  ← −1 overshoots
 *
 *   Both are optimizer defects, NOT feasibility frontiers. At −11 the engine
 *   demonstrably reaches POD 15.5571 (it does so at +1), and 15.5571 is nearer
 *   to +2's requested band [16,17] than the 14.7201 it actually returns — so
 *   the returned candidate is not the nearest reachable one. At −13 the −1
 *   result 14.9812 sits ABOVE its own requested band [13,14] while level 0
 *   lands inside [14,15]; the mis-ordered pair is −1, not 0.
 *
 *   Root cause is in the SHARED Direction NEAREST selection, not in Protein:
 *   when a requested band is unreachable the solver returns whatever its search
 *   settled on rather than the closest legal candidate to that band. Shipping a
 *   five-position selector that can move backwards would be the exact "control
 *   that lies about what it did" failure the axis gate exists to prevent, so
 *   sweetness stays blocked until that shared frontier defect is fixed.
 *
 * HARDNESS — blocked on cited science, and expected to stay that way.
 *   At otherwise constant formulation, instrumental hardness rises 13.60 N →
 *   47.66 N as protein goes 4 % → 10 % (Applied Food Research 2(1) 100029,
 *   2022, DOI 10.1016/j.afres.2021.100029). The Gelato NPAC→hardness
 *   calibration therefore does not transfer, and no published controlled series
 *   reports NPAC/PAC alongside hardness for high-protein frozen desserts.
 */

const TEMP = { temp_minus_11: -11, temp_minus_12: -12, temp_minus_13: -13 } as const;
type Serving = keyof typeof TEMP;

const draft = (serving: Serving, strategy: 'optimal' | 'eco' = 'optimal'): RecipeInput => {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: 'protein',
    servingModeId: serving,
    formulationStrategy: strategy,
    targetBatchGrams: 1000,
  });
  return {
    items: starter.items,
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: TEMP[serving],
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: {
      flavor_intensity: 'balanced',
      cost_priority: 'balanced',
      formulation_strategy: strategy,
      direction_targets_active: true,
      direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    },
  };
};

describe('Protein Direction axis status is truthful', () => {
  it.each([-11, -12, -13] as const)(
    '@ %s °C both axes are blocked with a stated reason — no silent no-op control',
    (temperatureC) => {
      const serving = `temp_minus_${Math.abs(temperatureC)}` as Serving;
      const input = draft(serving);
      const plan = buildRecipeDirectionPlan(input);
      const sweetness = plan.axes.find((a) => a.axis === 'sweetness')!;
      const hardness = plan.axes.find((a) => a.axis === 'softness')!;

      // A blocked axis must carry NO target band, so nothing downstream can
      // silently optimize toward a target the UI says is unavailable.
      expect(sweetness.status).not.toBe('working');
      expect(sweetness.targetBand).toBeNull();
      expect(sweetness.reason).toBeTruthy();

      expect(hardness.status).toBe('blocked_science');
      expect(hardness.targetBand).toBeNull();
      expect(hardness.reason).toBeTruthy();

      // Zero supported axes ⇒ Direction must not advertise itself as usable.
      const assessment = assessRecipeDirection(input, calculateRecipe(input));
      expect(assessment.supportedAxisCount).toBe(0);
    },
  );

  it('the starter itself is already safe and qualified at every temperature', () => {
    // Direction being blocked must never be the thing keeping Protein legal:
    // the shipped starter stands on its own at all three serving temperatures.
    for (const serving of ['temp_minus_11', 'temp_minus_12', 'temp_minus_13'] as const) {
      const input = draft(serving);
      const assessment = assessProteinFormulation(input, calculateRecipe(input));
      expect(assessment.qualification.qualified).toBe(true);
      expect(assessment.hardSafe).toBe(true);
    }
  });
});
