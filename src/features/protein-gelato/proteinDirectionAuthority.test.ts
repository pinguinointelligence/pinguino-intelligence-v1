import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeDirectionTarget, type RecipeInput } from '@/engine';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import {
  bandDistance,
  directionDistance,
  requestedDirectionBands,
} from '@/features/recipe-direction/directionBandDistance';
import { assessProteinFormulation } from './proteinAuthority';

/**
 * PROTEIN DIRECTION AUTHORITY — Sweetness OPERATIONAL, Hardness BLOCKED.
 *
 * SWEETNESS is qualified. The complete −2..+2 × −2..+2 × 3 temperatures × 2
 * strategies matrix (150 states) is natively hard-safe, claim-qualified and
 * applied with zero executable 0 g rows, which is exactly what the runtime gate
 * asks for. POD is composition-derived from each ingredient's own stored
 * `pod_value`, and the five-fifth target subdivides the Protein profile's OWN
 * approved POD band [12,17] — no borrowed dairy curve, no invented reference.
 *
 * This file is also the regression for the SHARED Direction NEAREST defect that
 * Protein exposed. Before `improveDirectionNearestVector` existed, candidate
 * selection had no explicit representation of distance to the requested band —
 * ranking was `Σ_metrics (beyond_band / halfWidth)` over every technical metric,
 * resolved by a greedy hill-climb that never backtracked. Two measured results:
 *
 *   −11 °C, Sweetness +2, band [16,17] → POD 14.7201, distance 1.2799, even
 *     though Sweetness +1 reaches 15.5571 — distance 0.4429 from that SAME
 *     band. A strictly closer legal candidate provably existed and was not
 *     chosen. Now returns 15.5571.
 *
 *   −13 °C, Sweetness −1, band [13,14] → POD 14.9812: the engine moved POD UP,
 *     AWAY from a downward target, while Sweetness −2 reaches 13.9272, which is
 *     INSIDE [13,14]. Not merely non-nearest — ACHIEVED was available and not
 *     returned. Now returns 13.9272, in band.
 *
 * HARDNESS remains BLOCKED on cited science and must not be unlocked merely
 * because Sweetness now works. At otherwise constant formulation, instrumental
 * hardness rises 13.60 N → 47.66 N as protein goes 4 % → 10 % (Applied Food
 * Research 2(1) 100029, 2022, DOI 10.1016/j.afres.2021.100029, Table 1/Fig. 2),
 * so the Gelato NPAC→hardness calibration does not transfer, and no published
 * controlled series reports NPAC/PAC alongside hardness for high-protein frozen
 * desserts. The curve cannot be derived, so the axis stays honestly unavailable.
 */

const NONE = { byLineId: {} } as const;
const AT = '2026-08-23T15:30:00.000Z';
const TEMP = { temp_minus_11: -11, temp_minus_12: -12, temp_minus_13: -13 } as const;
type Serving = keyof typeof TEMP;
const LEVELS: readonly RecipeDirectionTarget[] = [-2, -1, 0, 1, 2];

const draft = (
  serving: Serving,
  strategy: 'optimal' | 'eco',
  sweetness: RecipeDirectionTarget,
): RecipeInput => {
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
      direction_targets: { sweetness, softness: 0, creaminess: 0, flavor: 0 },
    },
  };
};

const podOf = (input: RecipeInput): number =>
  calculateRecipe(input).indicators.find((entry) => entry.key === 'pod')!.value!;

const sweetnessBand = (input: RecipeInput) =>
  buildRecipeDirectionPlan(input).axes.find((axis) => axis.axis === 'sweetness')!.targetBand!;

interface Delivered {
  level: RecipeDirectionTarget;
  band: { min: number; max: number };
  pod: number;
  distance: number;
  qualified: boolean;
  hardSafe: boolean;
  zeroGramRows: number;
}

const sweep = (serving: Serving, strategy: 'optimal' | 'eco'): Delivered[] =>
  LEVELS.map((level) => {
    const input = draft(serving, strategy, level);
    const band = sweetnessBand(input);
    const built = buildOptimizePreview(input, NONE, AT, {});
    // If the exact executable starter already satisfies the requested band,
    // `already_clean` is the correct no-Apply state. Never manufacture a diff
    // merely to keep the button visible (owner §23).
    if (!built.ok) {
      expect(
        built.code,
        `${serving}/${strategy}/sweetness=${level}: ${JSON.stringify(built).slice(0, 800)}`,
      ).toBe('already_clean');
    }
    const proposed = built.ok ? built.preview.proposedInput : input;
    const protein = assessProteinFormulation(proposed, calculateRecipe(proposed));
    const pod = podOf(proposed);
    return {
      level,
      band: { min: band.min, max: band.max },
      pod,
      distance: bandDistance(pod, band),
      qualified: protein.qualification.qualified,
      hardSafe: protein.hardSafe,
      zeroGramRows: proposed.items.filter((item) => item.planned_grams <= 0).length,
    };
  });

describe('Protein Direction axis status', () => {
  it.each([-11, -12, -13] as const)(
    '@ %d °C sweetness is operational and hardness runs on the ICE authority, never NPAC',
    (temperatureC) => {
      const serving = `temp_minus_${Math.abs(temperatureC)}` as Serving;
      const input = draft(serving, 'optimal', 0);
      const plan = buildRecipeDirectionPlan(input);
      const sweetness = plan.axes.find((axis) => axis.axis === 'sweetness')!;
      const hardness = plan.axes.find((axis) => axis.axis === 'softness')!;

      expect(sweetness.status).toBe('working');
      expect(sweetness.metric).toBe('pod');
      expect(sweetness.targetBand).not.toBeNull();

      // Sweetness and hardness remain SEPARATE authorities. Hardness was
      // restored on 2026-09-03 through the profile's own approved ICE-FRACTION
      // band (owner decision, option A) — the NPAC statement documented above is
      // unchanged and still true: NPAC-based Protein hardness stays unsupported,
      // and no NPAC band is ever published for this profile.
      expect(hardness.status).toBe('working');
      expect(hardness.metric).toBe('ice_fraction');
      expect(hardness.targetBand).not.toBeNull();
      expect(plan.bands.npac).toBeUndefined();

      expect(assessRecipeDirection(input, calculateRecipe(input)).supportedAxisCount).toBe(2);
    },
  );

  it('subdivides the approved POD band into FIVE ordered, distinct target bands', () => {
    const bands = LEVELS.map((level) => sweetnessBand(draft('temp_minus_12', 'optimal', level)));
    for (let index = 1; index < bands.length; index += 1) {
      expect(bands[index]!.min).toBeGreaterThan(bands[index - 1]!.min);
      expect(bands[index]!.max).toBeGreaterThan(bands[index - 1]!.max);
    }
    expect(bands[0]!.min).toBeCloseTo(12, 6);
    expect(bands[4]!.max).toBeCloseTo(17, 6);
    expect(new Set(bands.map((band) => `${band.min}:${band.max}`)).size).toBe(5);
  });
});

describe('shared Direction NEAREST — Protein regressions for the proven defects', () => {
  it('−11 °C: Sweetness +2 is never farther from [16,17] than the candidate +1 already proves reachable', () => {
    const plusOne = sweep('temp_minus_11', 'optimal')[3]!;
    const plusTwo = sweep('temp_minus_11', 'optimal')[4]!;
    // The +1 candidate, MEASURED AGAINST +2's requested band, is a legal
    // candidate the engine demonstrably reaches. NEAREST may never be worse.
    const provenReachable = bandDistance(plusOne.pod, plusTwo.band);
    expect(plusTwo.distance).toBeLessThanOrEqual(provenReachable + 1e-9);
    // Historical defect: 14.7201 (distance 1.2799) instead of 15.5571 (0.4429).
    expect(plusTwo.pod).toBeGreaterThan(15);
    expect(plusTwo.distance).toBeLessThan(1.2);
  });

  it('−13 °C: Sweetness −1 lands INSIDE [13,14] instead of moving up and away', () => {
    const minusOne = sweep('temp_minus_13', 'optimal')[1]!;
    expect(minusOne.band).toEqual({ min: 13, max: 14 });
    // Historical defect: POD rose to 14.9812, above the requested band, while a
    // 13.9272 candidate inside the band was reachable.
    expect(minusOne.distance).toBe(0);
    expect(minusOne.pod).toBeGreaterThanOrEqual(13);
    expect(minusOne.pod).toBeLessThanOrEqual(14);
  });
});

describe('§9 — five-level sweetness never moves backwards', () => {
  it.each(
    (['temp_minus_11', 'temp_minus_12', 'temp_minus_13'] as const).flatMap((serving) =>
      (['optimal', 'eco'] as const).map((strategy) => [serving, strategy] as const),
    ),
  )('%s / %s', (serving, strategy) => {
    const delivered = sweep(serving, strategy);
    // Reported for the ledger: requested band, delivered POD, distance.
    console.info(
      `DIRECTION ${JSON.stringify({ serving, strategy, delivered })}`,
    );

    for (const row of delivered) {
      // Safety and the protein claim are never traded for a preference.
      expect(row.hardSafe).toBe(true);
      expect(row.qualified).toBe(true);
      expect(row.zeroGramRows).toBe(0);
    }

    // A more sweetness-positive request may never deliver LESS POD.
    for (let index = 1; index < delivered.length; index += 1) {
      expect(delivered[index]!.pod).toBeGreaterThanOrEqual(delivered[index - 1]!.pod - 1e-6);
    }

    // The selector must actually move the product across its full range.
    expect(delivered[4]!.pod).toBeGreaterThan(delivered[0]!.pod + 0.5);

    // §10 — where two levels share a POD they must sit on a PROVEN frontier:
    // no other level's candidate is nearer to the collapsed level's own band.
    for (let index = 1; index < delivered.length; index += 1) {
      const row = delivered[index]!;
      if (Math.abs(row.pod - delivered[index - 1]!.pod) > 1e-6) continue;
      for (const other of delivered) {
        expect(bandDistance(other.pod, row.band)).toBeGreaterThanOrEqual(row.distance - 1e-9);
      }
    }
  }, 900_000);
});

describe('the delivered candidate is scored against the REQUESTED band', () => {
  it('reports zero distance exactly when the executable candidate is in band', () => {
    for (const serving of ['temp_minus_11', 'temp_minus_12', 'temp_minus_13'] as const) {
      for (const level of LEVELS) {
        const input = draft(serving, 'optimal', level);
        const built = buildOptimizePreview(input, NONE, AT, {});
        if (!built.ok) expect(built.code).toBe('already_clean');
        const proposed = built.ok ? built.preview.proposedInput : input;
        const bands = requestedDirectionBands(input);
        const measure = directionDistance(proposed, bands);
        const inBand = measure.total === 0;
        expect(measure.missedAxes === 0).toBe(inBand);
      }
    }
  }, 900_000);
});
