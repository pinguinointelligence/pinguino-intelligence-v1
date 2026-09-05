import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { GOLDEN_RECIPES } from '@/engine/__fixtures__/goldenRecipes';
import { findDemoIngredient } from '@/data/demoIngredients';
import { INTERNET_PROTEIN_RECIPES } from '@/features/protein-gelato/__fixtures__/internetProteinRecipes';
import {
  sorbetMapperIngredient,
  sorbetMultiMainBase,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { buildVeganCampaignInput } from '@/features/vegan-structure/__campaign__/veganCampaignInput';
import { HOME_FORMULATION_MODULES } from '@/features/machine-catalog';
import { evaluateHomeFormulationPreference } from './homeFormulationPreference';
import {
  compareExperimentalCandidateMeasures,
  evaluateExperimentalCandidate,
  experimentalNeighborhoodSearch,
} from './experimentalNeighborhoodSearch';

const atHomeCell = (input: RecipeInput): RecipeInput => ({
  ...structuredClone(input),
  target_temperature_c: -11,
  goals: {
    ...input.goals,
    formulation_strategy: 'optimal',
    direction_targets_active: false,
  },
});

const proteinCocoa = (): RecipeInput => {
  const recipe = INTERNET_PROTEIN_RECIPES.find(
    (candidate) => candidate.id === 'dark-cocoa-wholesomeyum',
  )!;
  return atHomeCell({
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    items: recipe.lines.map((line, index) => ({
      id: `protein-${index}-${line.mapperId}`,
      ingredient: sorbetMapperIngredient(line.mapperId),
      planned_grams: line.grams,
      actual_grams: null,
      lock_type: 'unlocked' as const,
    })),
  });
};

const fixtures = [
  {
    id: 'gelato',
    input: () =>
      atHomeCell(GOLDEN_RECIPES.find((recipe) => recipe.id === 'milk-base-classic')!.input),
    npacPreferenceApplies: true,
  },
  {
    id: 'sorbet',
    input: () => atHomeCell(sorbetMultiMainBase(-11)),
    npacPreferenceApplies: true,
  },
  {
    id: 'vegan',
    input: () => atHomeCell(buildVeganCampaignInput('R01', -11, 'optimal')),
    npacPreferenceApplies: true,
  },
  { id: 'protein', input: proteinCocoa, npacPreferenceApplies: false },
] as const;

describe('Home formulation modules — preference-only Engine integration', () => {
  for (const fixture of fixtures) {
    it(`${fixture.id}: compares all four modules without changing the native green band`, () => {
      const input = fixture.input();
      const nativeNpacBand = calculateRecipe(input).indicators.find(
        (indicator) => indicator.key === 'npac',
      )?.band;
      const frozenBowl = evaluateHomeFormulationPreference(input, 'FROZEN_BOWL');
      const compressor = evaluateHomeFormulationPreference(input, 'COMPRESSOR');
      const frozenPint = evaluateHomeFormulationPreference(input, 'FROZEN_PINT');
      const softDispense = evaluateHomeFormulationPreference(input, 'SOFT_DISPENSE');

      expect(
        calculateRecipe(input).indicators.find((indicator) => indicator.key === 'npac')?.band,
      ).toEqual(nativeNpacBand);
      expect(frozenPint).toMatchObject({ applicable: false, distance: null, targetNpac: null });

      if (!fixture.npacPreferenceApplies) {
        expect([frozenBowl, compressor, softDispense].every((entry) => !entry.applicable)).toBe(
          true,
        );
        return;
      }
      expect(frozenBowl.nativeBand).toEqual(compressor.nativeBand);
      expect(compressor.nativeBand).toEqual(softDispense.nativeBand);
      expect(frozenBowl.targetNpac!).toBeLessThan(compressor.targetNpac!);
      expect(compressor.targetNpac!).toBeLessThan(softDispense.targetNpac!);
    });
  }

  it('keeps Frozen Pint neutral while lower/upper modules can select safe nearby Gelato vectors', () => {
    const original = fixtures[0].input();
    const ingredientIds: Record<string, string> = {
      milk: 'milk_3_5',
      cream: 'cream_30',
      smp: 'smp',
      sucrose: 'sucrose',
      dextrose: 'dextrose',
      tara: 'tara_gum',
    };
    const input = {
      ...original,
      items: original.items.map((item) =>
        item.id === 'tara'
          ? { ...item, ingredient: findDemoIngredient('tara_gum')!, planned_grams: 2 }
          : item.id === 'milk'
            ? {
                ...item,
                ingredient: findDemoIngredient('milk_3_5')!,
                planned_grams: item.planned_grams + 3,
              }
            : { ...item, ingredient: findDemoIngredient(ingredientIds[item.id]!)! },
      ),
    };
    const run = (homeFormulationModuleId: keyof typeof HOME_FORMULATION_MODULES) =>
      experimentalNeighborhoodSearch(
        input,
        { byLineId: {} },
        {
          beamWidth: 3,
          evaluationBudget: 2_500,
          homeFormulationModuleId,
        },
      );
    const pint = run('FROZEN_PINT');
    const bowl = run('FROZEN_BOWL');
    const compressor = run('COMPRESSOR');
    const soft = run('SOFT_DISPENSE');

    expect(pint.measure.hardViolationCount).toBe(0);
    expect([pint.status, bowl.status, compressor.status, soft.status]).toEqual([
      'no_change',
      'candidate',
      'candidate',
      'candidate',
    ]);
    expect(pint.input).toEqual(input);
    expect(calculateRecipe(bowl.input).npac_points!).toBeLessThan(
      calculateRecipe(compressor.input).npac_points!,
    );
    expect(calculateRecipe(compressor.input).npac_points!).toBeLessThan(
      calculateRecipe(soft.input).npac_points!,
    );
    for (const candidate of [bowl, compressor, soft]) {
      expect(candidate.measure.hardViolationCount).toBe(0);
    }
  });

  it('ranks explicit customer Direction above a conflicting module preference', () => {
    const input = fixtures[0].input();
    const base = evaluateExperimentalCandidate(
      input,
      input,
      { byLineId: {} },
      {
        homeFormulationModuleId: 'SOFT_DISPENSE',
      },
    );
    const modulePreferredButDirectionWorse = {
      ...base,
      explicitTargetViolationCount: 1,
      explicitTargetSeverityPoints: 0.2,
      homeModulePreferenceDistance: 0,
    };
    const directionPreferred = {
      ...base,
      explicitTargetViolationCount: 0,
      explicitTargetSeverityPoints: 0,
      homeModulePreferenceDistance: 1,
    };
    expect(
      compareExperimentalCandidateMeasures(
        directionPreferred,
        modulePreferredButDirectionWorse,
        'optimal',
      ),
    ).toBeLessThan(0);
  });
});
