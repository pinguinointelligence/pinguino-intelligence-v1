import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { GOLDEN_RECIPES } from '@/engine/__fixtures__/goldenRecipes';
import { machineEducationById } from '@/features/education';
import { INTERNET_PROTEIN_RECIPES } from '@/features/protein-gelato/__fixtures__/internetProteinRecipes';
import {
  sorbetMapperIngredient,
  sorbetMultiMainBase,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { buildVeganCampaignInput } from '@/features/vegan-structure/__campaign__/veganCampaignInput';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { BATCH_RESIZE_TOLERANCE_GRAMS, useRecipeStore } from '@/stores/recipeStore';
import { MACHINE_CATALOG, deriveMachineSetup } from '.';
import { machineDisplayName } from '@/features/machine-onboarding';

const bananaGelato = (): RecipeInput => {
  const input = structuredClone(
    GOLDEN_RECIPES.find((recipe) => recipe.id === 'banana-classic')!.input,
  );
  return {
    ...input,
    items: input.items.map((item) =>
      item.id === 'banana' ? { ...item, lock_type: 'main' as const } : item,
    ),
  };
};

const proteinCocoa = (): RecipeInput => {
  const recipe = INTERNET_PROTEIN_RECIPES.find(
    (candidate) => candidate.id === 'dark-cocoa-wholesomeyum',
  )!;
  return {
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: -13,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: { formulation_strategy: 'optimal' },
    items: recipe.lines.map((line, index) => ({
      id: `${recipe.id}-${index}-${line.mapperId}`,
      ingredient: sorbetMapperIngredient(line.mapperId),
      planned_grams: line.grams,
      actual_grams: null,
      lock_type: /cocoa/i.test(line.displayName) ? ('main' as const) : ('unlocked' as const),
    })),
  };
};

const FIXTURES = [
  {
    id: 'banana-gelato',
    visibleProductType: 'gelato' as const,
    input: bananaGelato,
  },
  {
    id: 'green-sorbet-multi-main',
    visibleProductType: 'sorbet' as const,
    input: () => sorbetMultiMainBase(-11),
  },
  {
    id: 'vegan-vanilla-r01',
    visibleProductType: 'vegan' as const,
    input: () => buildVeganCampaignInput('R01', -11, 'optimal'),
  },
  {
    id: 'protein-dark-cocoa',
    visibleProductType: 'protein' as const,
    input: proteinCocoa,
  },
] as const;

const sum = (input: RecipeInput) =>
  input.items.reduce((total, item) => total + item.planned_grams, 0);

describe('all predefined Home machines × four accepted recipe controls', () => {
  for (const profile of MACHINE_CATALOG) {
    for (const fixture of FIXTURES) {
      it(`${profile.id} × ${fixture.id}: immediate coherent batch, profile, Main and Production routing`, () => {
        const original = fixture.input();
        const originalMain = original.items
          .filter((item) => item.lock_type === 'main')
          .map((item) => ({ id: item.id, grams: item.planned_grams }));
        const originalLocks = Object.fromEntries(
          original.items.map((item) => [item.id, item.lock_type]),
        );

        useRecipeStore.getState().loadRecipeInput(structuredClone(original));
        const setup = deriveMachineSetup(profile, fixture.visibleProductType);
        expect(setup.recommendedBatchGrams).not.toBeNull();
        expect(setup.resolvedVisibleMode).not.toBeNull();
        const batchGrams = setup.recommendedBatchGrams!;

        expect(
          useRecipeStore.getState().setMachineSelection({
            kind: 'home',
            servingModeId: setup.resolvedVisibleMode!,
            machineId: profile.id,
            label: machineDisplayName(profile),
            machineTechnology: profile.technology,
            homeFormulationModuleId: profile.homeFormulationModuleId,
            temperatureC: setup.engineTemperatureC,
            batchGrams,
            hardCapacityGrams: setup.hardMaximumBatchGrams,
            batchSource: 'MACHINE_DEFAULT',
          }),
        ).toEqual({ ok: true });

        const state = useRecipeStore.getState();
        const actual = buildRecipeInput(state);
        expect(state.visibleProductType).toBe(fixture.visibleProductType);
        expect(state.target_batch_grams).toBe(batchGrams);
        expect(Math.abs(sum(actual) - batchGrams)).toBeLessThanOrEqual(
          BATCH_RESIZE_TOLERANCE_GRAMS,
        );
        expect(state.batch_source).toBe('MACHINE_DEFAULT');
        expect(state.machine_capacity_grams).toBeNull();
        expect(state.target_temperature_c).toBe(-11);
        expect(state.homeFormulationModuleId).toBe(profile.homeFormulationModuleId);
        expect(state.batchResizeConflict).toBeNull();
        expect(Object.fromEntries(state.items.map((item) => [item.id, item.lock_type]))).toEqual(
          originalLocks,
        );

        const nextMain = state.items
          .filter((item) => item.lock_type === 'main')
          .map((item) => ({ id: item.id, grams: item.planned_grams }));
        expect(nextMain.map((item) => item.id)).toEqual(originalMain.map((item) => item.id));
        if (originalMain.length > 1) {
          expect(nextMain[0]!.grams / nextMain[1]!.grams).toBeCloseTo(
            originalMain[0]!.grams / originalMain[1]!.grams,
            10,
          );
        }
        expect(calculateRecipe(actual).total_batch_g).toBeCloseTo(batchGrams, 8);
        expect(machineEducationById(profile.id)?.sourceMachineId).toBe(profile.id);
      });
    }
  }
});
