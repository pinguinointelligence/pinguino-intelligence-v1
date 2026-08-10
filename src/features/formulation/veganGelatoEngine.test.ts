import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  CONFIG_VERSION,
  DEFAULT_CORRECTION_CANDIDATES,
  detectViolations,
  ENGINE_VERSION,
  type EngineIngredient,
  type IngredientCategory,
  type RecipeInput,
} from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import {
  findVerifiedVeganFormulationCandidate,
  VEGAN_VERIFIED_CANONICAL_IDS,
} from '@/data/ingredients/verifiedVeganToolbox';
import { veganRecipeEligibilityIssues } from '@/data/ingredients/veganEligibility';
import { recipeTechnicalFit } from '@/features/recipe-score';
import { buildSavePayload, savedToRecipeInput } from '@/features/recipes/recipePayload';
import { buildRecipeVersion, restoreVersion } from '@/features/pro-core/recipeVersioning';
import {
  buildOptimizePreview,
  commitPreview,
  plannedSum,
} from '@/features/constraint-studio/applyPipeline';
import {
  selectFormulationTemplateForRecipe,
  veganFlavorStrategyForRecipe,
} from './templateRegistry';

const ZERO = {
  water_percent: 0,
  solids_percent: 0,
  fat_percent: 0,
  protein_percent: 0,
  carbohydrate_percent: 0,
  sugar_percent: 0,
  sucrose_percent: 0,
  glucose_percent: 0,
  dextrose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0,
  alcohol_percent: 0,
  kcal_per_100g: 0,
};

const verifiedMain = (
  id: string,
  name: string,
  category: IngredientCategory,
  composition: Partial<typeof ZERO>,
  pod: number,
  pac: number,
): EngineIngredient => ({
  id,
  canonical_ingredient_id: id,
  private_product_id: null,
  identity_provenance: 'mapper',
  name,
  category,
  composition: { ...ZERO, ...composition },
  pod_value: pod,
  pac_value: pac,
  npac_value: null,
  de_value: null,
  cost_per_kg: null,
  confidence_score: 95,
  source_type: 'verified_db',
  is_verified: true,
  flags: {
    vegan_eligibility: 'VEGAN_VERIFIED',
    vegan_eligibility_reasons: ['verified_mapper_vegan_true'],
  },
});

const STRAWBERRY = verifiedMain(
  'PI-ING-001553',
  'STRAWBERRIES · Fresh Fruit',
  'fruit',
  {
    water_percent: 89, solids_percent: 11, fat_percent: 0.3, protein_percent: 0.7,
    carbohydrate_percent: 8, sugar_percent: 5.8, sucrose_percent: 1,
    glucose_percent: 2.4, fructose_percent: 2.4, fiber_percent: 2,
    kcal_per_100g: 32,
  },
  6.928,
  10.12,
);
const BANANA = verifiedMain(
  'PI-ING-001589',
  'BANANA · Puree',
  'fruit',
  {
    water_percent: 76.5, solids_percent: 23.5, protein_percent: 1,
    carbohydrate_percent: 22, sugar_percent: 18.4, sucrose_percent: 11,
    glucose_percent: 4, fructose_percent: 3.4, salt_percent: 0.5,
    kcal_per_100g: 92,
  },
  19.86,
  27.985,
);
const PISTACHIO = verifiedMain(
  'PI-ING-000614',
  'PISTACHIO · Aldori Paste · 100% Nut',
  'nut_paste',
  {
    water_percent: 8, solids_percent: 92, fat_percent: 45, protein_percent: 20,
    carbohydrate_percent: 17, sugar_percent: 7.7, sucrose_percent: 7.7,
    fiber_percent: 10, kcal_per_100g: 573,
  },
  7.7,
  7.7,
);
const COCOA = verifiedMain(
  'PI-ING-001578',
  'COCOA ALKALIZED 100% · Cacao Barry Cocoa Powder',
  'chocolate_cocoa',
  {
    solids_percent: 100, fat_percent: 23, protein_percent: 18.9,
    carbohydrate_percent: 8.8, sugar_percent: 0.4, fiber_percent: 29,
    salt_percent: 0.04, kcal_per_100g: 384,
  },
  0.4,
  0.634,
);

const OAT = findVerifiedVeganFormulationCandidate('PI-ING-001565')!;
const ALMOND = findVerifiedVeganFormulationCandidate('PI-ING-001587')!;
const PEA = findVerifiedVeganFormulationCandidate('PI-ING-000451')!;
const RICE_PROTEIN = findVerifiedVeganFormulationCandidate('PI-ING-000452')!;

const line = (
  id: string,
  ingredient: EngineIngredient,
  grams: number,
  lockType: 'unlocked' | 'main' | 'grams' = 'unlocked',
) => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type: lockType,
});

const recipe = (items: ReturnType<typeof line>[], temperature = -13): RecipeInput => ({
  mode: 'classic',
  category: 'vegan_gelato',
  target_temperature_c: temperature,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  items,
});

const NO = { byLineId: {} };
const round = (value: number | null, digits = 3): number | null =>
  value === null ? null : Number(value.toFixed(digits));

const proof = (input: RecipeInput) => {
  const result = calculateRecipe(input);
  return {
    ingredients: input.items.map((item) => ({
      id: item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
      name: item.ingredient.name,
      grams: round(item.planned_grams, 3),
      main: item.lock_type === 'main',
    })),
    batch: round(result.total_batch_g, 3),
    pod: round(result.pod_points),
    pac: round(result.pac_points),
    npac: round(result.npac_points),
    ice: round(result.ice_fraction_percent),
    water: round(result.percentages.water_percent),
    solids: round(result.percentages.solids_percent),
    fat: round(result.percentages.fat_percent),
    protein: round(result.percentages.protein_percent),
    fiber: round(result.percentages.fiber_percent),
    sugars: round(
      result.percentages.sucrose_percent +
        result.percentages.dextrose_percent +
        result.percentages.glucose_percent +
        result.percentages.fructose_percent +
        result.percentages.lactose_percent,
    ),
    score: recipeTechnicalFit(result).score,
    violations: detectViolations(result).map((violation) => violation.metric),
  };
};

const formulate = (source: RecipeInput) => {
  const outcome = buildOptimizePreview(source, NO, '2026-08-08T00:00:00.000Z');
  if (!outcome.ok) throw new Error(`Vegan fixture failed: ${outcome.code} ${JSON.stringify(outcome)}`);
  return outcome.preview;
};

const canonicalIds = (input: RecipeInput): string[] =>
  input.items.map((item) => item.ingredient.canonical_ingredient_id ?? item.ingredient.id);
const WATER = DEFAULT_CORRECTION_CANDIDATES.find((candidate) => candidate.id === 'water')!.ingredient;

describe('Vegan Gelato Engine — real Mapper formulation matrix', () => {
  const cases = [
    ['neutral', [line('oat', OAT, 0)], 'neutral'],
    ['strawberry', [line('strawberry', STRAWBERRY, 300, 'main')], 'fruit'],
    ['banana', [line('banana', BANANA, 300, 'main')], 'fruit'],
    ['pistachio', [line('pistachio', PISTACHIO, 120, 'main')], 'nut'],
    ['cocoa', [line('cocoa', COCOA, 60, 'main')], 'cocoa'],
    ['almond', [line('almond', ALMOND, 0)], 'neutral'],
  ] as const;

  it.each(cases)('%s routes distinctly across −11/−12/−13', (name, items, strategy) => {
    const summaries: Array<ReturnType<typeof proof> & { temperature: number }> = [];
    for (const temperature of [-11, -12, -13]) {
      const preview = formulate(recipe([...items], temperature));
      expect(preview.formulation?.templateId).toContain(
        strategy === 'neutral' && temperature === -13 ? 'V02' : `vegan_${strategy}`,
      );
      expect(preview.formulation?.templateStatus).toBe('approved');
      expect(Math.abs(plannedSum(preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
      expect(veganRecipeEligibilityIssues(preview.proposedInput.items)).toEqual([]);
      expect(new Set(canonicalIds(preview.proposedInput)).size).toBe(preview.proposedInput.items.length);
      expect(preview.proposedInput.items.some((item) => item.ingredient.flags?.is_dairy)).toBe(false);
      if (name !== 'neutral' && name !== 'almond') {
        const main = preview.proposedInput.items.find((item) => item.lock_type === 'main');
        expect(main?.planned_grams).toBeGreaterThan(0);
        expect(main?.ingredient.id).toBe(items[0]!.ingredient.id);
      }
      summaries.push({ temperature, ...proof(preview.proposedInput) });
    }
    expect(summaries[0]!.npac!).toBeLessThan(summaries[1]!.npac!);
    expect(summaries[1]!.npac!).toBeLessThan(summaries[2]!.npac!);
    expect(summaries).toMatchSnapshot();
  });

  it('routes multi-Main by the complete role set and never treats heterogeneous roles as fruit', () => {
    const secondNut = {
      ...PISTACHIO,
      id: 'PI-NUT-SECOND',
      canonical_ingredient_id: 'PI-NUT-SECOND',
      name: 'Second verified nut paste',
    };
    const secondCocoa = {
      ...COCOA,
      id: 'PI-COCOA-SECOND',
      canonical_ingredient_id: 'PI-COCOA-SECOND',
      name: 'Second verified cocoa',
    };
    const fruitPair = recipe([
      line('strawberry', STRAWBERRY, 150, 'main'),
      line('banana', BANANA, 150, 'main'),
    ]);
    const nutPair = recipe([
      line('pistachio-a', PISTACHIO, 60, 'main'),
      line('pistachio-b', secondNut, 60, 'main'),
    ]);
    const cocoaPair = recipe([
      line('cocoa-a', COCOA, 30, 'main'),
      line('cocoa-b', secondCocoa, 30, 'main'),
    ]);
    const heterogeneous = recipe([
      line('strawberry', STRAWBERRY, 150, 'main'),
      line('cocoa', COCOA, 60, 'main'),
    ]);

    expect(veganFlavorStrategyForRecipe(fruitPair)).toBe('mixed_main');
    expect(veganFlavorStrategyForRecipe(nutPair)).toBe('nut');
    expect(veganFlavorStrategyForRecipe(cocoaPair)).toBe('cocoa');
    expect(veganFlavorStrategyForRecipe(heterogeneous)).toBe('unsupported_mixed_main');
    expect(selectFormulationTemplateForRecipe(heterogeneous).template).toBeNull();

    const nutPreview = buildOptimizePreview(nutPair, NO, '2026-08-08T00:00:00.000Z');
    expect(nutPreview.ok).toBe(true);
    if (nutPreview.ok) expect(nutPreview.preview.formulation?.templateId).toContain('vegan_nut');
  });

  it('checks the Vegan profile envelope before returning already_clean', () => {
    const clean = formulate(recipe([line('oat', OAT, 0)])).proposedInput;
    const tara = clean.items.find(
      (item) => (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === 'PI-ING-000492',
    )!;
    const water = clean.items.find(
      (item) => (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === 'PI-ING-001409',
    )!;
    clean.items = clean.items.filter((item) => item !== tara);
    water.planned_grams += tara.planned_grams;

    expect(detectViolations(calculateRecipe(clean))).toEqual([]);
    const result = buildOptimizePreview(clean, NO, '2026-08-08T00:00:00.000Z');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('vegan_profile_constraint');
      if (result.code === 'vegan_profile_constraint') {
        expect(result.issues.map((issue) => issue.code)).toContain('stabilizer_missing');
      }
    }
  });

  it.each([
    ['1:1', 150, 150, 1],
    ['2:1', 200, 100, 2],
  ] as const)('preserves the Strawberry/Banana %s Multi-Main contract', (_label, bananaG, strawberryG, ratio) => {
    const source = recipe([
      line('banana', BANANA, bananaG, 'main'),
      line('strawberry', STRAWBERRY, strawberryG, 'main'),
    ]);
    const preview = formulate(source);
    const banana = preview.proposedInput.items.find((item) => item.id === 'banana')!;
    const strawberry = preview.proposedInput.items.find((item) => item.id === 'strawberry')!;
    expect(banana.lock_type).toBe('main');
    expect(strawberry.lock_type).toBe('main');
    expect(banana.planned_grams / strawberry.planned_grams).toBeCloseTo(ratio, 6);
    expect(new Set(canonicalIds(preview.proposedInput)).size).toBe(preview.proposedInput.items.length);
    const apply = commitPreview(
      source,
      NO,
      preview,
      '2026-08-08T00:00:01.000Z',
      `vegan-multimain-${ratio}`,
    );
    expect(apply.ok).toBe(true);
    expect(proof(preview.proposedInput)).toMatchSnapshot();
  });

  it('calculates verified pea/rice proteins without any dairy gate', () => {
    const neutral = formulate(recipe([line('oat', OAT, 0)])).proposedInput;
    const water = neutral.items.find((item) => item.ingredient.id === 'water')!;
    const structural: RecipeInput = {
      ...neutral,
      items: [
        ...neutral.items.map((item) =>
          item.id === water.id ? { ...item, planned_grams: item.planned_grams - 20 } : item,
        ),
        line('pea-protein', PEA, 10),
        line('rice-protein', RICE_PROTEIN, 10),
      ],
    };
    const result = calculateRecipe(structural);
    expect(result.percentages.protein_percent).toBeGreaterThan(1);
    expect(result.percentages.lactose_percent).toBe(0);
    expect(detectViolations(result).some((violation) => violation.metric === 'lactose')).toBe(false);
    expect(
      detectViolations(result).some((violation) => violation.metric === 'protein_in_solids'),
    ).toBe(false);
    expect(result.indicators.find((indicator) => indicator.key === 'lactose')?.band).toBeNull();
    expect(veganRecipeEligibilityIssues(structural.items)).toEqual([]);
    expect(proof(structural)).toMatchSnapshot();
  });

  it('blocks non-vegan and unknown inputs before Preview and at trustless Apply', () => {
    const milk = findDemoIngredient('milk_3_5')!;
    const blocked = buildOptimizePreview(
      recipe([line('milk', milk, 100), line('strawberry', STRAWBERRY, 300, 'main')]),
      NO,
      '2026-08-08T00:00:00.000Z',
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe('vegan_ingredient_conflict');
      if (blocked.code === 'vegan_ingredient_conflict') {
        expect(blocked.issues.map((issue) => issue.ingredientName)).toContain(milk.name);
      }
    }

    const source = recipe([line('oat', OAT, 0)]);
    const validPreview = formulate(source);
    const forged = structuredClone(validPreview);
    const inulin = forged.proposedInput.items.find(
      (item) => (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === 'PI-ING-000456',
    )!;
    const water = forged.proposedInput.items.find(
      (item) => (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === 'PI-ING-001409',
    )!;
    inulin.planned_grams += 40;
    water.planned_grams -= 40;
    const forgedApply = commitPreview(
      source,
      NO,
      forged,
      '2026-08-08T00:00:02.000Z',
      'forged-vegan-envelope',
    );
    expect(forgedApply).toMatchObject({
      ok: false,
      code: 'vegan_profile_constraint_invalid',
    });
  });

  it('keeps the invalid coconut-milk high-water reference blocked and rescues a verified high-water alternative', () => {
    const invalidCoconutMilk = verifiedMain(
      'PI-ING-000148',
      'COCONUT MILK 22% · Coconut · Dry',
      'other',
      { water_percent: 69.94, solids_percent: 30.06, fat_percent: 21 },
      0,
      0,
    );
    invalidCoconutMilk.flags = {
      vegan_eligibility: 'VEGAN_FALSE',
      vegan_eligibility_reasons: ['mapper_vegan_false'],
    };
    const exactOwnerBoundary = recipe([
      line('water-boundary', WATER, 350),
      line('oat-boundary', OAT, 250),
      line('coconut-boundary', invalidCoconutMilk, 150),
      line('sucrose-boundary', findDemoIngredient('sucrose')!, 95),
      line('dextrose-boundary', findDemoIngredient('dextrose')!, 100),
      line('inulin-boundary', findDemoIngredient('inulin')!, 53.1),
      line('tara-boundary', findDemoIngredient('tara_gum')!, 1.9),
    ]);
    const blocked = buildOptimizePreview(exactOwnerBoundary, NO, '2026-08-08T00:00:00.000Z');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe('vegan_ingredient_conflict');

    const difficult = recipe([
      line('oat-boundary', OAT, 250),
      line('water-boundary', WATER, 550),
      line('oil-boundary', findVerifiedVeganFormulationCandidate('PI-ING-000163')!, 20),
      line('sucrose-boundary', findDemoIngredient('sucrose')!, 70),
      line('dextrose-boundary', findDemoIngredient('dextrose')!, 55),
      line('inulin-boundary', findDemoIngredient('inulin')!, 53),
      line('tara-boundary', findDemoIngredient('tara_gum')!, 2),
    ]);
    const before = proof(difficult);
    expect(before.score).toBeLessThan(10);
    const attempted = buildOptimizePreview(difficult, NO, '2026-08-08T00:00:00.000Z');
    expect(attempted.ok).toBe(false);
    if (attempted.ok || attempted.code !== 'vegan_profile_constraint') return;
    const inulinIssue = attempted.issues.find(
      (issue) => issue.code === 'inulin_above_calibration_envelope',
    );
    // Tara stays at its 2 g template-controlled dose; the body lever therefore
    // lands at the updated deterministic Inulin diagnostic value.
    expect(inulinIssue?.grams).toBeCloseTo(210.872673, 5);
    expect(inulinIssue?.maxGrams).toBeCloseTo(83.1, 6);
    const after = proof(attempted.diagnosticInput);
    expect(after.score).toBeGreaterThanOrEqual(before.score ?? 1);
    expect(after.violations).toEqual([]);
    expect(Math.abs(plannedSum(attempted.diagnosticInput) - 1000)).toBeLessThanOrEqual(0.1);
    expect({ before, rejectedAfter: after }).toMatchSnapshot();
  });

  it('save/reopen and immutable version restore reproduce the exact Vegan recipe and score', () => {
    const formulated = formulate(recipe([line('strawberry', STRAWBERRY, 300, 'main')])).proposedInput;
    const beforeScore = recipeTechnicalFit(calculateRecipe(formulated));
    const payload = buildSavePayload({
      name: 'Vegan Strawberry',
      recipeInput: formulated,
      intakeProductId: 'vegan',
      intakeServingId: null,
    });
    expect(payload.product_type).toBe('vegan');
    const reopened = savedToRecipeInput(JSON.parse(JSON.stringify(payload.recipe_input)));
    expect(reopened).toEqual(formulated);
    expect(reopened.category).toBe('vegan_gelato');
    expect(reopened.target_temperature_c).toBe(-13);
    expect(reopened.items.filter((item) => item.lock_type === 'main').map((item) => item.id)).toEqual([
      'strawberry',
    ]);
    expect(veganRecipeEligibilityIssues(reopened.items)).toEqual([]);
    expect(recipeTechnicalFit(calculateRecipe(reopened))).toEqual(beforeScore);

    const first = buildRecipeVersion(
      {
        recipeId: 'vegan-recipe', ownerUserId: 'owner', versionNumber: 1,
        recipeInput: formulated,
        trace: { engineVersion: ENGINE_VERSION, configVersion: CONFIG_VERSION, mapperDatasetVersion: 'v1.0' },
        source: 'optimizer_correction', createdBy: 'owner', createdAt: '2026-08-08T00:00:00.000Z',
        productProfile: 'vegan', temperatureC: -13,
      },
      'vegan-v1',
    );
    const changedInput = structuredClone(formulated);
    changedInput.items[0]!.planned_grams += 1;
    const second = buildRecipeVersion(
      {
        recipeId: 'vegan-recipe', ownerUserId: 'owner', versionNumber: 2,
        recipeInput: changedInput,
        trace: { engineVersion: ENGINE_VERSION, configVersion: CONFIG_VERSION, mapperDatasetVersion: 'v1.0' },
        source: 'manual', createdBy: 'owner', createdAt: '2026-08-08T00:01:00.000Z',
        productProfile: 'vegan', temperatureC: -13,
      },
      'vegan-v2',
    );
    const restored = restoreVersion(
      [first, second],
      1,
      'owner',
      '2026-08-08T00:02:00.000Z',
      'vegan-v3',
    );
    expect(restored.versionNumber).toBe(3);
    expect(restored.restoredFromVersion).toBe(1);
    expect(restored.recipeInput).toEqual(formulated);
    expect(recipeTechnicalFit(calculateRecipe(restored.recipeInput))).toEqual(beforeScore);
  });

  it('uses a bounded verified pool rather than scanning the Mapper dataset', () => {
    expect(VEGAN_VERIFIED_CANONICAL_IDS.size).toBeLessThan(32);
  });
});
