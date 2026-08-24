import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { starterMilkBase, starterLine } from '@/features/recipe-constraints/constraintFixtures';
import {
  attachPracticalRecipeAudit,
  readPracticalRecipeAudit,
} from '@/features/practical-recipe/practicalRecipe';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  productionRecipeLifecycleState,
  productionVersionFingerprint,
} from './productionReadinessState';

const composition = (
  recipe: RecipeInput,
  toppingGrams: number | null = null,
): RecipeCompositionMetadata => ({
  schemaVersion: 1,
  baseScope: 'BASE_FORMULATION',
  baseOrder: recipe.items.map((item) => item.id),
  toppings:
    toppingGrams === null
      ? []
      : [
          {
            id: 'topping-qa',
            ingredient: recipe.items[0]!.ingredient,
            planned_grams: toppingGrams,
            actual_grams: null,
            process_scope: 'POST_PROCESS_ADDON',
            addon_sort_order: 0,
          },
        ],
  behaviorSnapshots: {},
  migrationAmbiguities: [],
});

const audit = (recipe: RecipeInput, cycle = 0) =>
  readPracticalRecipeAudit(
    attachPracticalRecipeAudit(
      recipe,
      recipe,
      `2026-08-21T10:${String(cycle).padStart(2, '0')}:00.000Z`,
    ),
  )!;

const editBase = (recipe: RecipeInput, delta: number): RecipeInput => ({
  ...recipe,
  items: recipe.items.map((item) =>
    item.id === starterLine('milk_3_5')
      ? { ...item, planned_grams: item.planned_grams + delta }
      : item.id === starterLine('cream_30')
        ? { ...item, planned_grams: item.planned_grams - delta }
        : item,
  ),
});

describe('Production recipe lifecycle state machine', () => {
  it('distinguishes stale, calculated-unsaved and saved matching states', () => {
    const saved = starterMilkBase();
    const savedFingerprint = productionVersionFingerprint(saved, composition(saved));
    const changed = editBase(saved, 1);
    const currentFingerprint = productionVersionFingerprint(changed, composition(changed));

    expect(
      productionRecipeLifecycleState({
        workingInput: changed,
        practicalAudit: audit(saved),
        calculationStale: true,
        currentProductionFingerprint: currentFingerprint,
        savedProductionFingerprint: savedFingerprint,
        savedVersionId: 'version-1',
      }),
    ).toBe('TECHNICALLY_STALE');

    expect(
      productionRecipeLifecycleState({
        workingInput: changed,
        practicalAudit: audit(changed),
        calculationStale: false,
        currentProductionFingerprint: currentFingerprint,
        savedProductionFingerprint: savedFingerprint,
        savedVersionId: 'version-1',
      }),
    ).toBe('CALCULATED_BUT_UNSAVED');

    expect(
      productionRecipeLifecycleState({
        workingInput: changed,
        practicalAudit: audit(changed),
        calculationStale: false,
        currentProductionFingerprint: currentFingerprint,
        savedProductionFingerprint: currentFingerprint,
        savedVersionId: 'version-2',
      }),
    ).toBe('READY');
  });

  it('never requests BASE recalculation for topping-only, price-only or name-only changes', () => {
    const recipe = starterMilkBase();
    const currentAudit = audit(recipe);
    const savedFingerprint = productionVersionFingerprint(recipe, composition(recipe));
    const withTopping = productionVersionFingerprint(recipe, composition(recipe, 20));
    const withPrice = {
      ...recipe,
      items: recipe.items.map((item, index) =>
        index === 0 ? { ...item, ingredient: { ...item.ingredient, cost_per_kg: 999 } } : item,
      ),
    };

    expect(
      productionRecipeLifecycleState({
        workingInput: recipe,
        practicalAudit: currentAudit,
        calculationStale: false,
        currentProductionFingerprint: withTopping,
        savedProductionFingerprint: savedFingerprint,
        savedVersionId: 'version-1',
      }),
    ).toBe('CALCULATED_BUT_UNSAVED');
    expect(productionVersionFingerprint(withPrice, composition(withPrice))).toBe(savedFingerprint);
    expect(
      productionRecipeLifecycleState({
        workingInput: withPrice,
        practicalAudit: currentAudit,
        calculationStale: false,
        currentProductionFingerprint: savedFingerprint,
        savedProductionFingerprint: savedFingerprint,
        savedVersionId: 'version-1',
      }),
    ).toBe('READY');
    // Recipe name/favourite/notes are not inputs to this state machine.
  });

  it('keeps topping 0 → 1 → 20 → 0 g persistence-only and restores the saved identity', () => {
    const recipe = starterMilkBase();
    const savedFingerprint = productionVersionFingerprint(recipe, composition(recipe));

    for (const grams of [1, 20]) {
      const toppingFingerprint = productionVersionFingerprint(recipe, composition(recipe, grams));
      expect(
        productionRecipeLifecycleState({
          workingInput: recipe,
          practicalAudit: audit(recipe),
          calculationStale: false,
          currentProductionFingerprint: toppingFingerprint,
          savedProductionFingerprint: savedFingerprint,
          savedVersionId: 'version-1',
        }),
      ).toBe('CALCULATED_BUT_UNSAVED');
    }

    expect(productionVersionFingerprint(recipe, composition(recipe))).toBe(savedFingerprint);
  });

  it('classifies every supported technical settings change as stale until revalidated', () => {
    const base = starterMilkBase();
    const technicalChanges: RecipeInput[] = [
      { ...base, target_temperature_c: -12 },
      { ...base, target_batch_grams: base.target_batch_grams + 1 },
      { ...base, category: 'sorbet' },
      {
        ...base,
        goals: { ...base.goals, formulation_strategy: 'eco' },
      },
      {
        ...base,
        goals: {
          ...base.goals,
          direction_targets: { sweetness: 1, softness: 0, creaminess: 0, flavor: 0 },
          direction_targets_active: true,
        },
      },
      {
        ...base,
        items: base.items.map((item, index) =>
          index === 0
            ? {
                ...item,
                lock_type: 'percent' as const,
                percent_constraint: { percent: 40 },
              }
            : item,
        ),
      },
      { ...base, items: base.items.slice(0, -1) },
      {
        ...base,
        items: [
          ...base.items,
          {
            ...base.items.at(-1)!,
            id: 'added-base-line',
            planned_grams: 1,
          },
        ],
      },
    ];

    for (const changed of technicalChanges) {
      expect(
        productionRecipeLifecycleState({
          workingInput: changed,
          practicalAudit: audit(base),
          calculationStale: true,
          currentProductionFingerprint: productionVersionFingerprint(changed, composition(changed)),
          savedProductionFingerprint: productionVersionFingerprint(base, composition(base)),
          savedVersionId: 'version-1',
        }),
      ).toBe('TECHNICALLY_STALE');
    }
  });

  it('uses the same deterministic lifecycle for a supported non-Gelato profile', () => {
    const starter = buildCanonicalNewRecipeStarter({
      visibleProductType: 'protein',
      servingModeId: 'temp_minus_11',
      formulationStrategy: 'optimal',
      targetBatchGrams: 1_000,
    });
    const protein: RecipeInput = {
      items: starter.items,
      mode: 'classic',
      category: starter.category,
      target_temperature_c: starter.targetTemperatureC,
      target_batch_grams: starter.targetBatchGrams,
      machine_capacity_grams: null,
      goals: { formulation_strategy: starter.formulationStrategy },
    };
    const proteinComposition = composition(protein);
    const savedFingerprint = productionVersionFingerprint(protein, proteinComposition);
    const changed: RecipeInput = {
      ...protein,
      target_batch_grams: protein.target_batch_grams + 1,
    };
    const changedFingerprint = productionVersionFingerprint(changed, composition(changed));

    expect(
      productionRecipeLifecycleState({
        workingInput: changed,
        practicalAudit: audit(protein),
        calculationStale: true,
        currentProductionFingerprint: changedFingerprint,
        savedProductionFingerprint: savedFingerprint,
        savedVersionId: 'protein-version-1',
      }),
    ).toBe('TECHNICALLY_STALE');
    expect(
      productionRecipeLifecycleState({
        workingInput: changed,
        practicalAudit: audit(changed),
        calculationStale: false,
        currentProductionFingerprint: changedFingerprint,
        savedProductionFingerprint: savedFingerprint,
        savedVersionId: 'protein-version-1',
      }),
    ).toBe('CALCULATED_BUT_UNSAVED');
    expect(
      productionRecipeLifecycleState({
        workingInput: changed,
        practicalAudit: audit(changed),
        calculationStale: false,
        currentProductionFingerprint: changedFingerprint,
        savedProductionFingerprint: changedFingerprint,
        savedVersionId: 'protein-version-2',
      }),
    ).toBe('READY');
  });

  it('has zero false recalculation classifications across 50 edit/apply/save cycles', () => {
    let current = starterMilkBase();
    let savedFingerprint = productionVersionFingerprint(current, composition(current));

    for (let cycle = 1; cycle <= 50; cycle += 1) {
      current = editBase(current, cycle % 2 === 0 ? -1 : 1);
      const currentFingerprint = productionVersionFingerprint(current, composition(current));
      expect(
        productionRecipeLifecycleState({
          workingInput: current,
          practicalAudit: null,
          calculationStale: true,
          currentProductionFingerprint: currentFingerprint,
          savedProductionFingerprint: savedFingerprint,
          savedVersionId: `version-${cycle}`,
        }),
      ).toBe('TECHNICALLY_STALE');

      expect(
        productionRecipeLifecycleState({
          workingInput: current,
          practicalAudit: audit(current, cycle),
          calculationStale: false,
          currentProductionFingerprint: currentFingerprint,
          savedProductionFingerprint: savedFingerprint,
          savedVersionId: `version-${cycle}`,
        }),
      ).toBe('CALCULATED_BUT_UNSAVED');

      savedFingerprint = currentFingerprint;
      expect(
        productionRecipeLifecycleState({
          workingInput: current,
          practicalAudit: audit(current, cycle),
          calculationStale: false,
          currentProductionFingerprint: currentFingerprint,
          savedProductionFingerprint: savedFingerprint,
          savedVersionId: `version-${cycle + 1}`,
        }),
      ).toBe('READY');
    }
  });

  it('allows only a clean pre-migration saved version to use the legacy compatibility seam', () => {
    const recipe = starterMilkBase();
    const fingerprint = productionVersionFingerprint(recipe, composition(recipe));
    expect(
      productionRecipeLifecycleState({
        workingInput: recipe,
        practicalAudit: audit(recipe),
        calculationStale: false,
        currentProductionFingerprint: fingerprint,
        savedProductionFingerprint: null,
        savedVersionId: 'legacy-version',
        legacySavedStateClean: true,
      }),
    ).toBe('READY');
    expect(
      productionRecipeLifecycleState({
        workingInput: recipe,
        practicalAudit: audit(recipe),
        calculationStale: false,
        currentProductionFingerprint: fingerprint,
        savedProductionFingerprint: null,
        savedVersionId: 'legacy-version',
        legacySavedStateClean: false,
      }),
    ).toBe('CALCULATED_BUT_UNSAVED');
  });
});
