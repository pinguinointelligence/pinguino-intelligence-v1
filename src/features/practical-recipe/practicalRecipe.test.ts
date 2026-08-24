import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import {
  OWNER_MAPPER_INGREDIENTS,
  ownerSameInputRecipe,
} from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { findOptimizationPreviewFixture } from '@/features/optimization/optimizationPreviewFixtures';
import { BRANCH_RECALCULATION_SCENARIOS } from '@/features/optimization/branchRecalculationFixtures';
import { GOLDEN_RECIPES } from '@/engine/__fixtures__/goldenRecipes';
import { findDemoIngredient } from '@/data/demoIngredients';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import {
  attachPracticalRecipeAudit,
  practicalRecipeAuditMatchesInput,
  practicalizeRecipeCandidate,
  readPracticalRecipeAudit,
} from './practicalRecipe';

const NONE: ConstraintSet = { byLineId: {} };

const gramsByCanonicalId = (input: RecipeInput): Record<string, number> =>
  Object.fromEntries(
    input.items.map((item) => [
      item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
      item.planned_grams,
    ]),
  );

const expectWholeGramAudit = (result: ReturnType<typeof practicalizeRecipeCandidate>) => {
  expect(result.ok, result.ok ? '' : `${result.code}: ${result.messagePl}`).toBe(true);
  if (!result.ok) throw new Error(result.messagePl);
  expect(
    result.audit.executableInput.items.every((item) => Number.isInteger(item.planned_grams)),
  ).toBe(true);
  expect(result.audit.executableTotalGrams).toBe(result.audit.targetBatchGrams);
  expect(
    result.audit.executableHardMetrics.filter(
      (metric) => !result.audit.exactHardMetrics.includes(metric),
    ),
  ).toEqual([]);
  return result.audit;
};

describe('Pro practical whole-gram recipe', () => {
  it('turns the accepted G17 Owner vector into the actual whole-gram recipe and re-runs Engine', () => {
    const exact = ownerSameInputRecipe();
    const result = practicalizeRecipeCandidate(exact, NONE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(gramsByCanonicalId(result.audit.executableInput)).toEqual({
      [OWNER_MAPPER_INGREDIENTS.milk_3_5.id]: 600,
      [OWNER_MAPPER_INGREDIENTS.cream_30.id]: 135,
      [OWNER_MAPPER_INGREDIENTS.smp.id]: 43,
      [OWNER_MAPPER_INGREDIENTS.sucrose.id]: 86,
      [OWNER_MAPPER_INGREDIENTS.dextrose.id]: 80,
      [OWNER_MAPPER_INGREDIENTS.inulin.id]: 54,
      [OWNER_MAPPER_INGREDIENTS.tara_gum.id]: 2,
    });
    expect(result.audit.exactTotalGrams).toBe(1000);
    expect(result.audit.executableTotalGrams).toBe(1000);
    expect(result.audit.hardGatePassed).toBe(true);
    expect(result.audit.executableHardMetrics).toEqual([]);
    expect(result.audit.executableResult).not.toBe(result.audit.exactResult);
    expect(result.audit.exactResult.pod_points).toBeCloseTo(15.5712, 8);
    expect(result.audit.executableResult.pod_points).toBeCloseTo(15.5704, 8);
    expect(result.audit.exactResult.npac_points).toBeCloseTo(46.1814908672, 8);
    expect(result.audit.executableResult.npac_points).toBeCloseTo(46.1797495658, 8);
    expect(result.audit.exactResult.ice_fraction_percent).toBeCloseTo(50.3399875761, 8);
    expect(result.audit.executableResult.ice_fraction_percent).toBeCloseTo(50.340002087, 8);
    expect(result.audit.executableResult.scores).toEqual(result.audit.exactResult.scores);
    expect(result.audit.lines.find((line) => line.lineId === 'owner:tara_gum')).toMatchObject({
      exactGrams: 1.9,
      practicalGrams: 2,
      residualAdjusted: false,
      protection: 'stabilizer',
    });
  });

  it('reconciles one gram deterministically without using Tara as the residual sink', () => {
    const exact = structuredClone(ownerSameInputRecipe());
    exact.items.find((item) => item.id === 'owner:milk_3_5')!.planned_grams = 600.4;
    exact.items.find((item) => item.id === 'owner:cream_30')!.planned_grams = 134.4;
    exact.items.find((item) => item.id === 'owner:inulin')!.planned_grams = 54.3;
    exact.items.find((item) => item.id === 'owner:tara_gum')!.planned_grams = 1.9;

    const result = practicalizeRecipeCandidate(exact, NONE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audit.residualBeforeReconciliationGrams).toBe(1);
    expect(result.audit.residualAfterReconciliationGrams).toBe(0);
    expect(
      result.audit.executableInput.items.find((item) => item.id === 'owner:tara_gum')
        ?.planned_grams,
    ).toBe(2);
    expect(
      result.audit.lines.find((line) => line.lineId === 'owner:tara_gum')?.residualAdjusted,
    ).toBe(false);
    expect(result.audit.lines.filter((line) => line.residualAdjusted)).toHaveLength(1);
  });

  it('does not round an unregistered stabilizer without an approved dose contract', () => {
    const exact = ownerSameInputRecipe();
    const tara = exact.items.find((item) => item.id === 'owner:tara_gum')!;
    tara.ingredient = {
      ...tara.ingredient,
      id: 'UNAPPROVED-STABILIZER',
      canonical_ingredient_id: 'UNAPPROVED-STABILIZER',
    };
    const result = practicalizeRecipeCandidate(exact, NONE);
    expect(result).toMatchObject({
      ok: false,
      code: 'stabilizer_contract_changed',
      lineIds: ['owner:tara_gum'],
    });
  });

  it('blocks a fractional exact gram lock instead of weakening it', () => {
    const exact = ownerSameInputRecipe();
    const set: ConstraintSet = {
      byLineId: { 'owner:inulin': { mode: 'locked', grams: 54.1 } },
    };
    const result = practicalizeRecipeCandidate(exact, set);
    expect(result).toMatchObject({
      ok: false,
      code: 'exact_gram_lock_not_whole_gram',
      lineIds: ['owner:inulin'],
    });
  });

  it('blocks a fractional Engine-native Required line instead of silently rounding it', () => {
    const exact = ownerSameInputRecipe();
    const inulin = exact.items.find((item) => item.id === 'owner:inulin')!;
    inulin.lock_type = 'required';
    const result = practicalizeRecipeCandidate(exact, NONE);
    expect(result).toMatchObject({
      ok: false,
      code: 'exact_gram_lock_not_whole_gram',
      lineIds: ['owner:inulin'],
    });
  });

  it('keeps an exactly representable percent lock and blocks a fractional one', () => {
    const exact = ownerSameInputRecipe();
    const valid = practicalizeRecipeCandidate(exact, {
      byLineId: { 'owner:milk_3_5': { mode: 'percent', percent: 60 } },
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.audit.executableInput.items[0]?.planned_grams).toBe(600);
    }

    const blocked = practicalizeRecipeCandidate(exact, {
      byLineId: { 'owner:milk_3_5': { mode: 'percent', percent: 60.05 } },
    });
    expect(blocked).toMatchObject({
      ok: false,
      code: 'percent_lock_not_whole_gram',
      lineIds: ['owner:milk_3_5'],
    });
  });

  it('keeps an explicit 2:1 Multi-Main ratio within the one-gram whole-mass allocation', () => {
    const exact = structuredClone(ownerSameInputRecipe());
    const milk = exact.items.find((item) => item.id === 'owner:milk_3_5')!;
    const cream = exact.items.find((item) => item.id === 'owner:cream_30')!;
    const inulin = exact.items.find((item) => item.id === 'owner:inulin')!;
    milk.lock_type = 'main';
    cream.lock_type = 'main';
    milk.main_ratio_weight = 2;
    cream.main_ratio_weight = 1;
    milk.planned_grams = 333.4;
    cream.planned_grams = 166.7;
    inulin.planned_grams = 54.1;
    exact.items.find((item) => item.id === 'owner:smp')!.planned_grams = 277.9;

    const result = practicalizeRecipeCandidate(exact, NONE);
    expect(result.ok, result.ok ? '' : `${result.code}: ${result.messagePl}`).toBe(true);
    if (!result.ok) return;
    const practicalMilk = result.audit.executableInput.items.find(
      (item) => item.id === 'owner:milk_3_5',
    )!.planned_grams;
    const practicalCream = result.audit.executableInput.items.find(
      (item) => item.id === 'owner:cream_30',
    )!.planned_grams;
    expect(Math.abs(practicalMilk - practicalCream * 2)).toBeLessThanOrEqual(1);
    expect(result.audit.executableTotalGrams).toBe(1000);
  });

  it('blocks a Multi-Main ratio that has no adjacent whole-gram representation', () => {
    const exact = structuredClone(ownerSameInputRecipe());
    const milk = exact.items.find((item) => item.id === 'owner:milk_3_5')!;
    const cream = exact.items.find((item) => item.id === 'owner:cream_30')!;
    const inulin = exact.items.find((item) => item.id === 'owner:inulin')!;
    milk.lock_type = 'main';
    cream.lock_type = 'main';
    milk.planned_grams = 100.2;
    cream.planned_grams = 141.7;
    inulin.planned_grams = 547.1;

    const result = practicalizeRecipeCandidate(exact, NONE);
    expect(result).toMatchObject({
      ok: false,
      code: 'main_ratio_not_whole_gram_representable',
    });
  });

  it('never rewrites fractional physical material', () => {
    const exact = ownerSameInputRecipe();
    const milk = exact.items.find((item) => item.id === 'owner:milk_3_5')!;
    milk.actual_grams = 100.5;
    milk.planned_grams = 600.5;
    const result = practicalizeRecipeCandidate(exact, NONE);
    expect(result).toMatchObject({
      ok: false,
      code: 'physical_mass_not_whole_gram',
      lineIds: ['owner:milk_3_5'],
    });
  });

  it('does not change inputs and is deterministic across OPTIMAL and ECO orchestration', () => {
    for (const strategy of ['optimal', 'eco'] as const) {
      const exact = ownerSameInputRecipe();
      exact.goals = { ...exact.goals, formulation_strategy: strategy };
      const before = structuredClone(exact);
      const first = practicalizeRecipeCandidate(exact, NONE);
      const second = practicalizeRecipeCandidate(exact, NONE);
      expect(first).toEqual(second);
      expect(exact).toEqual(before);
    }
  });

  it('rechecks an approved-identity Sorbet candidate as a whole-gram recipe', () => {
    const exact = structuredClone(findOptimizationPreviewFixture('sorbet-ready')!.recipe);
    const tara = exact.items.find((item) => item.id === 'tara')!;
    const water = exact.items.find((item) => item.id === 'water')!;
    tara.ingredient = OWNER_MAPPER_INGREDIENTS.tara_gum;
    tara.planned_grams = 2;
    water.planned_grams -= 1.2;
    const audit = expectWholeGramAudit(practicalizeRecipeCandidate(exact, NONE));
    expect(audit.executableInput.category).toBe('sorbet');
    expect(audit.lines.find((line) => line.lineId === 'tara')).toMatchObject({
      practicalGrams: 2,
      protection: 'stabilizer',
    });
  });

  it('rechecks Vegan, high-water and alcohol fixtures with their required stabilizer present', () => {
    const veganScenario = BRANCH_RECALCULATION_SCENARIOS.find(
      (scenario) => scenario.id === 'rescue-vegan-too-soft',
    );
    if (!veganScenario || veganScenario.kind !== 'batch_rescue') {
      throw new Error('Missing Vegan production fixture.');
    }
    const vegan = structuredClone(veganScenario.actualRecipe);
    vegan.items[0]!.planned_grams += 0.4;
    vegan.items[1]!.planned_grams -= 0.4;

    const highWater = structuredClone(
      GOLDEN_RECIPES.find((recipe) => recipe.id === 'high-fruit-water')!.input,
    );
    highWater.items[0]!.planned_grams += 0.4;
    highWater.items[1]!.planned_grams -= 0.4;

    const alcohol = structuredClone(
      GOLDEN_RECIPES.find((recipe) => recipe.id === 'jim-beam-alcohol')!.input,
    );
    alcohol.items[0]!.planned_grams += 0.4;
    alcohol.items[1]!.planned_grams -= 0.4;

    for (const exact of [vegan, highWater, alcohol]) {
      const hasStabilizer = exact.items.some(
        (item) =>
          (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
          OWNER_MAPPER_INGREDIENTS.tara_gum.id,
      );
      if (!hasStabilizer) {
        exact.items[0]!.planned_grams -= 3;
        exact.items.push({
          id: `${exact.category}-authority-tara`,
          ingredient: structuredClone(OWNER_MAPPER_INGREDIENTS.tara_gum),
          planned_grams: 3,
          actual_grams: null,
          lock_type: 'unlocked',
        });
      }
      const audit = expectWholeGramAudit(practicalizeRecipeCandidate(exact, NONE));
      expect(audit.executableResult).not.toBe(audit.exactResult);
    }
  });

  it('keeps the Protein product target in the same Preview practicalization gate', () => {
    const proteinDraft: RecipeInput = {
      items: [
        {
          id: 'main-raspberry',
          ingredient: findDemoIngredient('raspberry')!,
          planned_grams: 100,
          actual_grams: null,
          lock_type: 'main',
        },
      ],
      mode: 'signature',
      category: 'protein_gelato',
      target_temperature_c: -12,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
      goals: {
        flavor_intensity: 'balanced',
        cost_priority: 'balanced',
        target_protein_percent: 20,
      },
    };
    const built = buildOptimizePreview(proteinDraft, NONE, '2026-08-11T12:00:00.000Z');
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    expect(built.preview.practicalization?.status).toBe('ready');
    if (built.preview.practicalization?.status !== 'ready') return;
    expect(
      built.preview.proposedInput.items.every((item) => Number.isInteger(item.planned_grams)),
    ).toBe(true);
    expect(built.preview.practicalization.audit.executableResult).not.toBe(
      built.preview.practicalization.audit.exactResult,
    );
  });

  it('round-trips an audit distinction without replacing the executable canonical grams', () => {
    const exact = ownerSameInputRecipe();
    const result = practicalizeRecipeCandidate(exact, NONE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const saved = attachPracticalRecipeAudit(
      result.audit.executableInput,
      result.audit.exactInput,
      '2026-08-11T12:00:00.000Z',
    );
    expect(saved.items.find((item) => item.id === 'owner:tara_gum')?.planned_grams).toBe(2);
    const persisted = readPracticalRecipeAudit(saved);
    expect(persisted).toMatchObject({
      appliedAt: '2026-08-11T12:00:00.000Z',
      exactGramsByLineId: { 'owner:tara_gum': 1.9 },
      executableGramsByLineId: { 'owner:tara_gum': 2 },
    });
    expect(practicalRecipeAuditMatchesInput(saved, persisted)).toBe(true);
    const edited = structuredClone(saved);
    edited.items[0]!.planned_grams += 1;
    expect(practicalRecipeAuditMatchesInput(edited, persisted)).toBe(false);
  });

  it('selects the nearest admissible whole gram inside a range instead of rounding outside it', () => {
    const exact = ownerSameInputRecipe();
    const inulin = exact.items.find((item) => item.id === 'owner:inulin')!;
    const milk = exact.items.find((item) => item.id === 'owner:milk_3_5')!;
    const delta = inulin.planned_grams - 20.49;
    inulin.planned_grams = 20.49;
    milk.planned_grams += delta;
    inulin.range_constraint = { min_grams: 20.49, max_grams: 21.2 };
    inulin.lock_type = 'grams';
    const result = practicalizeRecipeCandidate(exact, {
      byLineId: {
        [inulin.id]: { mode: 'range', minGrams: 20.49, maxGrams: 21.2 },
      },
    });
    expect(result.ok, result.ok ? '' : JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(
      result.audit.executableInput.items.find((item) => item.id === inulin.id)?.planned_grams,
    ).toBe(21);
  });
});
