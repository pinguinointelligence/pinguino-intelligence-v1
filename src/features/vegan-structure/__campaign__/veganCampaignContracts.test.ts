/**
 * DEFAULT SUITE — cheap contracts extracted from the Vegan qualification campaign.
 *
 * The heavy matrices live in `*.campaign.test.ts` and run via `npm run vegan:campaign`.
 * What stays here is everything that is fast AND would catch a real regression:
 * the corpus/Mapper identity contract, and the Rescue/Direction decoupling that a
 * previous defect broke for every profile without a Direction calibration.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { plannedSum } from '@/features/constraint-studio/applyPipeline';
import { simulateRescueCandidates } from '@/features/constraint-studio/rescueIngredientAdvisor';
import { veganRecipeEligibilityIssues } from '@/data/ingredients/veganEligibility';
import { VEGAN_INTERNET_CORPUS } from './veganInternetCorpus';
import { AT, byId, EMPTY, OWNER_PRICES, toVeganInput } from './veganCampaignInput';

const scale = (input: RecipeInput, match: RegExp, factor: number): RecipeInput => ({
  ...input,
  items: input.items.map((i) =>
    match.test(i.id)
      ? { ...i, planned_grams: Math.max(1, Math.round(i.planned_grams * factor)) }
      : i,
  ),
});

describe('Vegan campaign contracts (default suite)', () => {
  it('every corpus recipe maps only to VEGAN_VERIFIED Mapper articles', () => {
    expect(VEGAN_INTERNET_CORPUS.length).toBeGreaterThanOrEqual(20);
    const classes = new Set(VEGAN_INTERNET_CORPUS.map((r) => r.flavourClass));
    expect(classes.size).toBeGreaterThanOrEqual(20);
    for (const recipe of VEGAN_INTERNET_CORPUS) {
      const input = toVeganInput(recipe, -11, 'optimal');
      expect(veganRecipeEligibilityIssues(input.items), recipe.id).toEqual([]);
      expect(Math.abs(plannedSum(input) - 1000), recipe.id).toBeLessThanOrEqual(12);
    }
  });

  it('Rescue is independent of Direction state', () => {
    const broken = scale(toVeganInput(byId('R01'), -13, 'optimal'), /PI-ING-000514/, 0.15);
    const run = (input: RecipeInput) =>
      simulateRescueCandidates({
        input,
        set: EMPTY,
        createdAt: AT,
        options: { effectivePriceOverrides: OWNER_PRICES },
        bestCurrent: null,
      });
    // Direction DISABLED — the case that used to return null immediately.
    expect(run(broken).trigger).toBe('operational');
    // Direction ACTIVE on the same broken recipe.
    const withDirection: RecipeInput = {
      ...broken,
      goals: {
        ...broken.goals,
        direction_targets_active: true,
        direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
      },
    };
    expect(run(withDirection).trigger).not.toBeNull();
    // A healthy recipe must NOT produce a pointless suggestion.
    const healthy = toVeganInput(byId('R01'), -11, 'optimal');
    const healthyReport = run(healthy);
    if ((healthyReport.current?.hardMetricCount ?? 0) === 0)
      expect(healthyReport.advice).toBeNull();
  });
});
