import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type EffectiveRecipeItem,
  type EngineIngredient,
  type RecipeDirectionTarget,
  type RecipeInput,
} from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { IngredientRow } from '@/features/ingredient-builder/IngredientRow';
import {
  bindProductBehaviorToPreview,
  buildBatchRescalePreview,
  buildOptimizePreview,
  buildSuggestedFixPreview,
  commitPreview,
  directionTargetFingerprint,
  findCanonicalDuplicateIngredients,
  isBatchReconciliation,
  plannedSum,
  workingStateFingerprint,
  type ConstraintPreview,
} from '@/features/constraint-studio/applyPipeline';
import {
  uncorrectableMultiMainAuthorityViolation,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import { ConstraintPreviewCard } from '@/features/constraint-studio/ui/ConstraintPreviewCard';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { verifyMainEnvelope } from '@/features/product-intelligence/mainEnvelope';
import { useRecipeStore } from '@/stores/recipeStore';
import { verifyMainIngredientIdentity } from './mainIngredientContract';

const STRAWBERRIES: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553',
  canonical_ingredient_id: 'PI-ING-001553',
  name: 'STRAWBERRIES · Fresh Fruit',
  category: 'fruit',
};

const BANANA: EngineIngredient = {
  id: 'PI-ING-000345',
  canonical_ingredient_id: 'PI-ING-000345',
  name: 'BANANA · Fresh Fruit',
  category: 'fruit',
  source_subcategory: 'fresh_fruit_profile',
  composition: {
    water_percent: 74.4,
    solids_percent: 25.6,
    fat_percent: 0.3,
    protein_percent: 0.1,
    carbohydrate_percent: 23.5,
    sugar_percent: 19.3,
    sucrose_percent: 11.1,
    glucose_percent: 4.49,
    dextrose_percent: 0,
    fructose_percent: 3.8,
    lactose_percent: 0,
    polyol_percent: 0,
    fiber_percent: 1.7,
    salt_percent: 0,
    alcohol_percent: 0,
    kcal_per_100g: 97,
  },
  pod_value: 20.948,
  pac_value: 26.68,
  de_value: null,
  cost_per_kg: 3.5,
  cost_currency: 'EUR',
  confidence_score: 92,
  source_type: 'manual',
  is_verified: false,
};

/** Exact verified Mapper row used by the served owner recipe. This must not be
 * replaced with a renamed berry fixture: Cranberry's 0.029 PAC is materially
 * different from Strawberry/Raspberry and is part of the regression. */
const CRANBERRY: EngineIngredient = {
  id: 'PI-ING-001556',
  canonical_ingredient_id: 'PI-ING-001556',
  name: 'CRANBERRY · Fresh Fruit',
  category: 'fruit',
  source_subcategory: 'fresh_fruit_profile',
  composition: {
    water_percent: 87.295,
    solids_percent: 12.705,
    fat_percent: 0.1,
    protein_percent: 0.4,
    carbohydrate_percent: 7.6,
    sugar_percent: 0,
    sucrose_percent: 0,
    glucose_percent: 0,
    dextrose_percent: 0,
    fructose_percent: 0,
    lactose_percent: 0,
    polyol_percent: 0,
    fiber_percent: 4.6,
    salt_percent: 0.005,
    alcohol_percent: 0,
    kcal_per_100g: 42,
  },
  pod_value: 0,
  pac_value: 0.029,
  de_value: null,
  cost_per_kg: null,
  cost_currency: 'EUR',
  confidence_score: 95,
  source_type: 'manual',
  is_verified: true,
};

const PISTACHIO: EngineIngredient = {
  ...findDemoIngredient('pistachio_paste')!,
  canonical_ingredient_id: 'pistachio_paste',
};

const line = (
  id: string,
  ingredient: EngineIngredient,
  grams: number,
  lock_type: RecipeInput['items'][number]['lock_type'] = 'main',
  mainRatioWeight?: number,
) => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type,
  ...(mainRatioWeight === undefined ? {} : { main_ratio_weight: mainRatioWeight }),
});

const structuralOwnerLines = (grams: number, targetBatchGrams: number): RecipeInput['items'] => {
  if (grams <= 0) return [];
  // Canonical Inulin stays at the published 2% minimum after proportional
  // rescale; the structural total remains 800 g.
  const shares = [495, 100, 30, 100, 50, 20, 5] as const;
  const definitions = [
    ['line-milk', 'milk_3_5'],
    ['line-cream', 'cream_30'],
    ['line-smp', 'smp'],
    ['line-sucrose', 'sucrose'],
    ['line-dextrose', 'dextrose'],
    ['line-inulin', 'inulin'],
    ['line-tara', 'tara_gum'],
  ] as const;
  const allocations = shares.map((share) => Math.floor((grams * share) / 800));
  const governedInulinGrams = Math.ceil(targetBatchGrams * 0.02 - 1e-9);
  allocations[0] = allocations[0]! - (governedInulinGrams - allocations[5]!);
  allocations[5] = governedInulinGrams;
  allocations[0] = allocations[0]! + grams - allocations.reduce((sum, value) => sum + value, 0);
  return definitions.map(([id, ingredientId], index) =>
    line(id, findDemoIngredient(ingredientId)!, allocations[index]!, 'unlocked'),
  );
};

const ownerInput = (
  bananaGrams = 100,
  strawberryGrams = 100,
  extra: RecipeInput['items'] = [],
  batch = 1000,
  explicitMainWeights?: readonly [number, number],
): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -13,
  target_batch_grams: batch,
  machine_capacity_grams: null,
  items: [
    line('line-banana', BANANA, bananaGrams, 'main', explicitMainWeights?.[0]),
    line('line-strawberry', STRAWBERRIES, strawberryGrams, 'main', explicitMainWeights?.[1]),
    ...extra,
    ...structuralOwnerLines(
      Math.max(
        0,
        batch -
          bananaGrams -
          strawberryGrams -
          extra.reduce((sum, item) => sum + item.planned_grams, 0),
      ),
      batch,
    ),
  ],
});

const NO = { byLineId: {} };

const assertMainRatio = (before: RecipeInput, after: RecipeInput, expectedRatio: number): void => {
  const banana = after.items.find((item) => item.id === 'line-banana')!;
  const secondMain = after.items.find((item) => item.id === 'line-strawberry')!;
  expect(banana.planned_grams).toBeGreaterThan(0);
  expect(secondMain.planned_grams).toBeGreaterThan(0);
  expect(banana.planned_grams / secondMain.planned_grams).toBeCloseTo(expectedRatio, 2);
  expect(verifyMainIngredientIdentity(before, after)).toMatchObject({ ok: true });
};

const offBatchOwnerInput = (
  bananaGrams: number,
  secondMainGrams: number,
  weights: readonly [number, number] | undefined,
  strategy: 'optimal' | 'eco',
  sweetness: RecipeDirectionTarget = 0,
  softness: RecipeDirectionTarget = 0,
  temperature = -13,
): RecipeInput => {
  const base = ownerInput(bananaGrams, secondMainGrams, [], 1_000, weights);
  return {
    ...base,
    target_temperature_c: temperature,
    items: base.items.map((item) =>
      item.id === 'line-milk' ? { ...item, planned_grams: item.planned_grams + 300 } : item,
    ),
    goals: {
      formulation_strategy: strategy,
      direction_targets: { sweetness, softness, creaminess: 0, flavor: 0 },
      direction_targets_active: sweetness !== 0 || softness !== 0,
    },
  };
};

const mainSnapshot = (lineId: string, mapperIngredientId: string): ProductBehaviorSnapshot => ({
  schemaVersion: 1,
  resolutionState: 'RESOLVED',
  lineId,
  productId: `product-${lineId}`,
  productVersionId: `version-${lineId}`,
  source: 'mapper',
  factsFingerprint: `facts-${lineId}`,
  behaviorBindingId: `binding-${lineId}`,
  behaviorBindingVersion: '1',
  taxonomyVersion: 'taxonomy-v1',
  familyId: 'fruit',
  subfamilyId: lineId.includes('banana') ? 'banana' : 'berry',
  formId: 'fresh',
  verificationState: 'verified',
  technicalAuthority: 'mapper_exact',
  mapperIngredientId,
  mainClassification: 'MAIN_PROFILE_SPECIFIC',
  mainPolicyId: 'main-fruit-dairy-v1',
  mainPolicyVersion: '1',
  ecoFloorPercent: 20,
  optimalCeilingPercent: 35,
  hardLimitPercent: 45,
  mainEquivalentFactor: 1,
  mainBasis: 'FRUIT_EQUIVALENT',
  requiresLiquidDairyCarrier: true,
  liquidDairyCarrierFloorPercent: 30,
  approvedLiquidDairyCarrier: false,
  approvedMixedFamilyIds: [],
  moduleEligibility: { BASE_RECIPE: 'eligible', MAIN: 'eligible' },
  processScope: 'BASE_FORMULATION',
  resolverVersion: 'unified-product-behavior-v1',
  warnings: [],
  blockReasons: [],
});

beforeEach(() => {
  useConstraintStudioStore.getState().resetForTests();
  useRecipeStore.setState({
    mode: 'classic',
    category: 'milk_gelato',
    visibleProductType: 'gelato',
    target_temperature_c: -13,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    machine_capacity_source: null,
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    items: [],
    excludedIngredientIds: [],
    unavailableMainIngredientIds: [],
  });
});

describe('multi-main role is a set in the canonical recipe draft', () => {
  it('marking a second line Main never demotes the first; demoting one changes only that line', () => {
    useRecipeStore.setState({
      items: [
        line('line-banana', BANANA, 100, 'unlocked'),
        line('line-strawberry', STRAWBERRIES, 100, 'unlocked'),
      ],
      productBehaviorSnapshots: {
        'line-banana': mainSnapshot('line-banana', BANANA.id),
        'line-strawberry': mainSnapshot('line-strawberry', STRAWBERRIES.id),
      },
    });

    useRecipeStore.getState().setMainIngredient('line-banana');
    useRecipeStore.getState().setMainIngredient('line-strawberry');
    expect(useRecipeStore.getState().items.map((item) => item.lock_type)).toEqual(['main', 'main']);

    useRecipeStore.getState().setLockType('line-banana', 'unlocked');
    expect(useRecipeStore.getState().items.map((item) => item.lock_type)).toEqual([
      'unlocked',
      'main',
    ]);
  });

  it('captures the current Crown gram relationship and refreshes it after direct Main gram edits', () => {
    const draft = offBatchOwnerInput(548, 152, undefined, 'optimal');
    useRecipeStore.setState({
      items: draft.items.map((item) => ({ ...item, lock_type: 'unlocked' })),
      target_batch_grams: draft.target_batch_grams,
      target_temperature_c: draft.target_temperature_c,
      category: draft.category,
      productBehaviorSnapshots: {
        'line-banana': mainSnapshot('line-banana', BANANA.id),
        'line-strawberry': mainSnapshot('line-strawberry', STRAWBERRIES.id),
      },
    });

    useRecipeStore.getState().setMainIngredient('line-banana');
    useRecipeStore.getState().setMainIngredient('line-strawberry');
    useRecipeStore.getState().setPlannedGrams('line-banana', 150);
    useRecipeStore.getState().setPlannedGrams('line-strawberry', 150);

    const input = buildRecipeInput(useRecipeStore.getState());
    const mains = input.items.filter((item) => item.lock_type === 'main');
    expect(mains.map((item) => item.main_ratio_weight)).toEqual([1, 1]);
    const result = buildOptimizePreview(input, NO, '2026-08-25T00:00:00.000Z');
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    assertMainRatio(input, result.preview.proposedInput, 1);
  });

  it('derives a 2:1 Crown contract from the user-entered Main grams', () => {
    const draft = ownerInput(200, 100);
    useRecipeStore.setState({
      items: draft.items.map((item) => ({ ...item, lock_type: 'unlocked' })),
      target_batch_grams: draft.target_batch_grams,
      target_temperature_c: draft.target_temperature_c,
      category: draft.category,
      productBehaviorSnapshots: {
        'line-banana': mainSnapshot('line-banana', BANANA.id),
        'line-strawberry': mainSnapshot('line-strawberry', STRAWBERRIES.id),
      },
    });

    useRecipeStore.getState().setMainIngredient('line-banana');
    useRecipeStore.getState().setMainIngredient('line-strawberry');

    const input = buildRecipeInput(useRecipeStore.getState());
    const mains = input.items.filter((item) => item.lock_type === 'main');
    expect(mains.map((item) => item.main_ratio_weight)).toEqual([2, 1]);
    const result = buildOptimizePreview(input, NO, '2026-08-25T00:00:00.000Z');
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    assertMainRatio(input, result.preview.proposedInput, 2);
  });

  it('renders the existing crown for every Main line without redesigning it', () => {
    const actions = {
      setPlannedGrams: () => undefined,
      setActualGrams: () => undefined,
      setLockType: () => undefined,
      setMainIngredient: () => undefined,
      removeItem: () => undefined,
    };
    const render = (item: RecipeInput['items'][number]) =>
      renderToStaticMarkup(
        <IngredientRow
          item={
            {
              ...item,
              effective_grams: item.planned_grams,
              difference: 0,
              is_actual: false,
            } as EffectiveRecipeItem
          }
          totalBatchG={200}
          actions={actions}
        />,
      );
    expect(render(line('line-banana', BANANA, 100))).toContain('Składnik główny');
    expect(render(line('line-strawberry', STRAWBERRIES, 100))).toContain('Składnik główny');
  });
});

describe('owner runtime fixtures — identity and ratio are hard formulation intent', () => {
  it('preserves the owner Banana/Cranberry 150:150 ratio while reconciling 1300 g to 1000 g', () => {
    const input: RecipeInput = {
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: -12,
      target_batch_grams: 1_000,
      machine_capacity_grams: null,
      goals: { formulation_strategy: 'optimal' },
      items: [
        line('line-banana', BANANA, 150, 'main', 1),
        line('line-cranberry', CRANBERRY, 150, 'main', 1),
        line('line-milk', findDemoIngredient('milk_3_5')!, 672, 'unlocked'),
        line('line-cream', findDemoIngredient('cream_30')!, 130, 'unlocked'),
        line('line-smp', findDemoIngredient('smp')!, 35, 'unlocked'),
        line('line-sucrose', findDemoIngredient('sucrose')!, 130, 'unlocked'),
        line('line-dextrose', findDemoIngredient('dextrose')!, 30, 'unlocked'),
        line('line-tara', findDemoIngredient('tara_gum')!, 3, 'unlocked'),
      ],
    };
    expect(plannedSum(input)).toBe(1_300);
    const proportionalCandidate: RecipeInput = {
      ...input,
      items: input.items.map((item) => ({
        ...item,
        planned_grams: (item.planned_grams * input.target_batch_grams) / plannedSum(input),
      })),
    };
    expect(isBatchReconciliation(input, proportionalCandidate)).toBe(true);

    // Engine-only formulation proof. ProductBehavior is asserted separately
    // below so this never disguises Cranberry as a different berry policy.
    const result = buildOptimizePreview(input, NO, '2026-08-25T00:00:00.000Z');

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const banana = result.preview.proposedInput.items.find((item) => item.id === 'line-banana')!;
    const cranberry = result.preview.proposedInput.items.find(
      (item) => item.id === 'line-cranberry',
    )!;
    expect(plannedSum(result.preview.proposedInput)).toBe(1_000);
    expect(banana.planned_grams).toBeGreaterThan(0);
    expect(cranberry.planned_grams).toBeGreaterThan(0);
    expect(Math.abs(banana.planned_grams - cranberry.planned_grams)).toBeLessThanOrEqual(1);
    expect(verifyMainIngredientIdentity(input, result.preview.proposedInput)).toMatchObject({
      ok: true,
    });
    const previewHtml = renderToStaticMarkup(
      <ConstraintPreviewCard
        preview={result.preview}
        onApply={() => undefined}
        onCancel={() => undefined}
        showTechnicalDetails
      />,
    );
    expect(previewHtml).toContain('Multi-Main: BANANA : CRANBERRY = 1 : 1 — zachowane');
  });

  it('Preview → Apply accepts exact Banana/Cranberry 150:150 from compatible individual authority', () => {
    const input: RecipeInput = {
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: -12,
      target_batch_grams: 1_000,
      machine_capacity_grams: null,
      goals: { formulation_strategy: 'optimal' },
      items: [
        line('line-banana', BANANA, 150, 'main', 1),
        line('line-cranberry', CRANBERRY, 150, 'main', 1),
        line('line-milk', findDemoIngredient('milk_3_5')!, 672, 'unlocked'),
        line('line-cream', findDemoIngredient('cream_30')!, 130, 'unlocked'),
        line('line-smp', findDemoIngredient('smp')!, 35, 'unlocked'),
        line('line-sucrose', findDemoIngredient('sucrose')!, 130, 'unlocked'),
        line('line-dextrose', findDemoIngredient('dextrose')!, 30, 'unlocked'),
        line('line-tara', findDemoIngredient('tara_gum')!, 3, 'unlocked'),
      ],
    };
    const snapshots = productBehaviorTestSnapshots(input);
    snapshots['line-banana'] = {
      ...snapshots['line-banana']!,
      familyId: 'fruit',
      subfamilyId: 'banana',
      formId: 'fresh',
      mainClassification: 'MAIN_PROFILE_SPECIFIC',
      mainPolicyId: 'main-banana-fresh-dairy',
      mainPolicyVersion: '2',
      ecoFloorPercent: 10,
      optimalCeilingPercent: 20,
      hardLimitPercent: 30,
      mainEquivalentFactor: 1,
      mainBasis: 'FRUIT_EQUIVALENT',
      requiresLiquidDairyCarrier: true,
      liquidDairyCarrierFloorPercent: 30,
      multiMainHardLimitPercent: null,
    };
    snapshots['line-cranberry'] = {
      ...snapshots['line-cranberry']!,
      familyId: 'fruit',
      subfamilyId: 'berry',
      formId: 'fresh',
      mainClassification: 'MAIN_PROFILE_SPECIFIC',
      mainPolicyId: 'main-berry-fresh-dairy',
      mainPolicyVersion: '2',
      ecoFloorPercent: 25,
      optimalCeilingPercent: 35,
      hardLimitPercent: 45,
      mainEquivalentFactor: 1,
      mainBasis: 'FRUIT_EQUIVALENT',
      requiresLiquidDairyCarrier: true,
      liquidDairyCarrierFloorPercent: 30,
      multiMainHardLimitPercent: null,
    };
    snapshots['line-milk'] = {
      ...snapshots['line-milk']!,
      approvedLiquidDairyCarrier: true,
    };
    for (const lineId of [
      'line-milk',
      'line-cream',
      'line-smp',
      'line-sucrose',
      'line-dextrose',
      'line-tara',
    ]) {
      snapshots[lineId] = { ...snapshots[lineId]!, mapperIngredientId: null };
    }

    expect(verifyMainEnvelope({ recipe: input, snapshots, mode: 'optimal' })).toMatchObject({
      ok: true,
      equivalentPercent: 30,
      targetPercent: 30,
      hardLimitPercent: 30,
      policyId: null,
    });
    expect(uncorrectableMultiMainAuthorityViolation(input, snapshots)).toBeNull();

    const built = bindProductBehaviorToPreview(
      buildOptimizePreview(input, NO, '2026-08-25T00:00:00.000Z', {
        productBehaviorSnapshots: snapshots,
      }),
      snapshots,
    );
    expect(built.ok, JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    const expectCranberryRatioPreserved = (after: RecipeInput) => {
      const banana = after.items.find((item) => item.id === 'line-banana');
      const cranberry = after.items.find((item) => item.id === 'line-cranberry');
      expect(banana?.planned_grams).toBeGreaterThan(0);
      expect(cranberry?.planned_grams).toBeGreaterThan(0);
      expect(banana!.planned_grams / cranberry!.planned_grams).toBeCloseTo(1, 8);
      expect(verifyMainIngredientIdentity(input, after)).toMatchObject({ ok: true });
    };
    expect(plannedSum(built.preview.proposedInput)).toBe(1_000);
    expectCranberryRatioPreserved(built.preview.proposedInput);
    expect(
      ['line-banana', 'line-cranberry'].map(
        (lineId) =>
          built.preview.proposedInput.items.find((item) => item.id === lineId)?.planned_grams,
      ),
    ).toEqual([150, 150]);
    expect(
      verifyMainEnvelope({
        recipe: built.preview.proposedInput,
        snapshots,
        mode: 'optimal',
      }),
    ).toMatchObject({
      ok: true,
      equivalentPercent: 30,
    });

    const applied = commitPreview(
      input,
      NO,
      built.preview,
      '2026-08-25T00:01:00.000Z',
      'banana-cranberry-generic-multi-main',
      [],
      undefined,
      null,
      null,
      null,
      null,
      snapshots,
    );
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(plannedSum(applied.verified.input)).toBe(1_000);
    expectCranberryRatioPreserved(applied.verified.input);
    expect(
      ['line-banana', 'line-cranberry'].map(
        (lineId) => applied.verified.input.items.find((item) => item.id === lineId)?.planned_grams,
      ),
    ).toEqual([150, 150]);

    const untouchedSource = JSON.stringify(input);
    useRecipeStore.getState().loadRecipeInput(structuredClone(applied.verified.input), {
      savedId: 'banana-cranberry-generic-multi-main',
      savedName: 'Banana + Cranberry',
      versionNumber: 1,
    });
    const reopened = buildRecipeInput(useRecipeStore.getState());
    expect(
      reopened.items
        .filter((item) => item.lock_type === 'main')
        .map((item) => [item.id, item.planned_grams, item.main_ratio_weight]),
    ).toEqual([
      ['line-banana', 150, 1],
      ['line-cranberry', 150, 1],
    ]);
    expect(JSON.stringify(input)).toBe(untouchedSource);
  });

  it.each([
    ['OPTIMAL', 'optimal', 0, 0, -13],
    ['ECO', 'eco', 0, 0, -13],
    ['Sweetness target', 'optimal', 2, 0, -13],
    ['Hardness target', 'optimal', 0, 2, -13],
    ['temperature change', 'optimal', 0, 0, -11],
  ] as const)(
    'preserves 2:1 Multi-Main through %s recalculation',
    (_label, strategy, sweetness, softness, temperature) => {
      const input = offBatchOwnerInput(
        200,
        100,
        [2, 1],
        strategy,
        sweetness,
        softness,
        temperature,
      );
      const result = buildOptimizePreview(input, NO, '2026-08-25T00:00:00.000Z');
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;
      assertMainRatio(input, result.preview.proposedInput, 2);
    },
  );

  it('preserves 1:2 Multi-Main while increasing the target batch from 1000 g to 1500 g', () => {
    const input = ownerInput(100, 200, [], 1_000, [1, 2]);
    const result = buildBatchRescalePreview(input, NO, 1_500, '2026-08-25T00:00:00.000Z');
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(plannedSum(result.preview.proposedInput)).toBe(1_500);
    assertMainRatio(input, result.preview.proposedInput, 0.5);
  });

  it('rejects a forged 49/51 split and changed ratio metadata for a 50/50 group', () => {
    const input = ownerInput(50, 50, [], 100);
    const split = {
      ...input,
      items: input.items.map((item, index) => ({
        ...item,
        planned_grams: index === 0 ? 49 : 51,
      })),
    };
    expect(verifyMainIngredientIdentity(input, split)).toMatchObject({ ok: false });

    const metadata = {
      ...input,
      items: input.items.map((item, index) =>
        index === 0 ? { ...item, main_ratio_weight: 2 } : item,
      ),
    };
    expect(verifyMainIngredientIdentity(input, metadata)).toMatchObject({ ok: false });
  });
  it('permanently forbids the observed 100/100 → 0/0 and 0/positive applicable proposal', () => {
    const before = ownerInput();
    const runtime = buildBatchRescalePreview(before, NO, 1200, '2026-08-08T00:00:00.000Z');
    expect(runtime.ok, JSON.stringify(runtime)).toBe(true);
    const after = runtime.ok ? runtime.preview.proposedInput : null;
    if (after === null) return; // an honest infeasible stop is allowed

    const banana = after.items.find((item) => item.id === 'line-banana');
    const strawberry = after.items.find((item) => item.id === 'line-strawberry');
    expect(banana).toBeDefined();
    expect(strawberry).toBeDefined();
    expect(banana!.lock_type).toBe('main');
    expect(strawberry!.lock_type).toBe('main');
    expect(banana!.planned_grams).toBeGreaterThan(0);
    expect(strawberry!.planned_grams).toBeGreaterThan(0);
    expect(banana!.planned_grams / strawberry!.planned_grams).toBeCloseTo(1, 8);
    expect(findCanonicalDuplicateIngredients(after)).toEqual([]);
    expect(Math.abs(plannedSum(after) - 1200)).toBeLessThanOrEqual(0.1);
  });

  it('preserves a 2:1 Main ratio or stops honestly', () => {
    const runtime = buildBatchRescalePreview(
      ownerInput(200, 100, [], 1000, [2, 1]),
      NO,
      1200,
      '2026-08-08T00:00:00.000Z',
    );
    expect(runtime.ok, JSON.stringify(runtime)).toBe(true);
    const after = runtime.ok ? runtime.preview.proposedInput : null;
    if (after === null) return;
    const banana = after.items.find((item) => item.id === 'line-banana')!;
    const strawberry = after.items.find((item) => item.id === 'line-strawberry')!;
    expect(banana.planned_grams).toBeGreaterThan(0);
    expect(strawberry.planned_grams).toBeGreaterThan(0);
    expect(Math.abs(banana.planned_grams - strawberry.planned_grams * 2)).toBeLessThanOrEqual(1);
  });

  it('preserves three positive Main identities and their 1:1:1 ratio', () => {
    const result = buildBatchRescalePreview(
      ownerInput(100, 100, [line('line-pistachio', PISTACHIO, 100)], 1100),
      NO,
      1200,
      '2026-08-08T00:00:00.000Z',
    );
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const after = result.preview.proposedInput;
    const mains = ['line-banana', 'line-strawberry', 'line-pistachio'].map(
      (id) => after.items.find((item) => item.id === id)!,
    );
    expect(mains.every((item) => item && item.lock_type === 'main' && item.planned_grams > 0)).toBe(
      true,
    );
    expect(
      Math.max(...mains.map((item) => item!.planned_grams)) -
        Math.min(...mains.map((item) => item!.planned_grams)),
    ).toBeLessThanOrEqual(1);
  });

  it('returns an explicit conflict for a Main-ratio + exact-lock batch impossibility', () => {
    const input = ownerInput(500, 500, [], 800);
    const result = buildOptimizePreview(
      input,
      { byLineId: { 'line-banana': { mode: 'locked', grams: 500 } } },
      '2026-08-08T00:00:00.000Z',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((result as { code: string }).code).toBe('main_ratio_conflict');
  });

  it('honors a compatible Main range without drifting the group ratio', () => {
    const result = buildOptimizePreview(
      ownerInput(100, 100),
      { byLineId: { 'line-banana': { mode: 'range', minGrams: 100, maxGrams: 250 } } },
      '2026-08-08T00:00:00.000Z',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const banana = result.preview.proposedInput.items.find((item) => item.id === 'line-banana')!;
    const strawberry = result.preview.proposedInput.items.find(
      (item) => item.id === 'line-strawberry',
    )!;
    expect(banana.planned_grams).toBeGreaterThanOrEqual(100);
    expect(banana.planned_grams).toBeLessThanOrEqual(250);
    expect(Math.abs(banana.planned_grams - strawberry.planned_grams)).toBeLessThanOrEqual(1);
  });

  it('combines Direction with 2:1 Multi-Main and a range constraint', () => {
    const input: RecipeInput = {
      ...ownerInput(200, 100, [], 1000, [2, 1]),
      goals: {
        direction_targets: {
          sweetness: 2,
          softness: -2,
          creaminess: 0,
          flavor: 0,
        },
        direction_targets_active: true,
      },
    };
    const constraints = {
      byLineId: {
        'line-banana': { mode: 'range' as const, minGrams: 160, maxGrams: 300 },
      },
    };
    const result = buildOptimizePreview(input, constraints, '2026-08-10T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = result.preview.proposedInput;
    const banana = after.items.find((item) => item.id === 'line-banana')!;
    const strawberry = after.items.find((item) => item.id === 'line-strawberry')!;

    const remainingViolations = detectViolations(calculateRecipe(after));
    if (result.preview.diagnosticOnly) {
      expect(remainingViolations.length).toBeGreaterThan(0);
    } else {
      expect(remainingViolations).toEqual([]);
    }
    const mainTotal = banana.planned_grams + strawberry.planned_grams;
    expect(Math.abs(banana.planned_grams - (mainTotal * 2) / 3)).toBeLessThanOrEqual(1);
    expect(Math.abs(strawberry.planned_grams - mainTotal / 3)).toBeLessThanOrEqual(1);
    expect(banana.planned_grams).toBeGreaterThanOrEqual(160);
    expect(banana.planned_grams).toBeLessThanOrEqual(300);

    const assessment = result.preview.directionAssessment;
    const consent =
      assessment?.reached === false
        ? {
            baseFingerprint: result.preview.baseFingerprint,
            targetFingerprint: directionTargetFingerprint(input),
            candidateFingerprint: workingStateFingerprint(
              result.preview.proposedInput,
              result.preview.nextConstraints,
            ),
          }
        : null;
    const committed = commitPreview(
      input,
      constraints,
      result.preview,
      '2026-08-10T00:01:00.000Z',
      'direction-multi-main-locks',
      [],
      undefined,
      null,
      null,
      consent,
    );
    if (result.preview.diagnosticOnly) {
      expect(committed.ok).toBe(false);
    } else {
      expect(committed.ok).toBe(true);
    }
  });

  it('batch reconciliation preserves a free Main ratio and rejects an exact-lock drift', () => {
    const free = buildBatchRescalePreview(ownerInput(100, 100, [], 200), NO, 400, 'now');
    expect(free.ok).toBe(true);
    if (free.ok) {
      const [banana, strawberry] = free.preview.proposedInput.items;
      expect(banana!.planned_grams / strawberry!.planned_grams).toBeCloseTo(1, 8);
    }

    const conflict = buildBatchRescalePreview(
      ownerInput(100, 100, [], 200),
      { byLineId: { 'line-banana': { mode: 'locked', grams: 100 } } },
      300,
      'now',
    );
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.code).toBe('main_ratio_conflict');
  });

  it('suggested fixes cannot silently rewrite a positive Main ratio', () => {
    const result = buildSuggestedFixPreview(
      ownerInput(100, 100, [], 200),
      NO,
      { type: 'set_min', lineId: 'line-banana', grams: 150 },
      'now',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('main_ratio_conflict');
  });

  it('production actuals remain authoritative and never make a Main line adjustable', () => {
    const input = ownerInput();
    input.items[0] = { ...input.items[0]!, actual_grams: 100 };
    const result = buildOptimizePreview(input, NO, '2026-08-08T00:00:00.000Z');
    if (!result.ok) {
      expect(['already_clean', 'no_proposal', 'unsafe_proposal', 'best_safe_result']).toContain(
        result.code,
      );
      return; // an honest no-proposal/diagnostic stop is allowed
    }
    const banana = result.preview.proposedInput.items.find((item) => item.id === 'line-banana')!;
    expect(banana.actual_grams).toBe(100);
    expect(banana.planned_grams).toBe(100);
    expect(banana.lock_type).toBe('main');
  });
});

describe('persistence, Apply and Undo boundaries', () => {
  it('save, reopen and version restore preserve roles, stable lines and canonical ids', () => {
    const saved = JSON.parse(JSON.stringify(ownerInput())) as RecipeInput;
    useRecipeStore.getState().loadRecipeInput(saved, {
      savedId: 'multi-main-owner',
      savedName: 'Banana + Strawberry',
      versionNumber: 3,
    });
    const reopened = buildRecipeInput(useRecipeStore.getState());
    expect(
      reopened.items
        .filter((item) => item.lock_type === 'main')
        .map((item) => [item.id, item.ingredient.canonical_ingredient_id, item.lock_type]),
    ).toEqual([
      ['line-banana', 'PI-ING-000345', 'main'],
      ['line-strawberry', 'PI-ING-001553', 'main'],
    ]);
    expect(useRecipeStore.getState().currentVersionNumber).toBe(3);
  });

  it('real Preview → Apply → Undo preserves and then restores the exact Main set', () => {
    useRecipeStore.getState().loadRecipeInput(ownerInput());
    useConstraintStudioStore.getState().createBatchRescalePreview(1200);
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();

    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    const appliedMains = useRecipeStore
      .getState()
      .items.filter((item) => item.lock_type === 'main');
    expect(appliedMains.map((item) => item.id)).toEqual(['line-banana', 'line-strawberry']);
    expect(appliedMains[0]!.planned_grams / appliedMains[1]!.planned_grams).toBeCloseTo(1, 8);

    useConstraintStudioStore.getState().undoLastApply();
    const restored = useRecipeStore.getState().items;
    expect(
      restored
        .filter((item) => item.lock_type === 'main')
        .map((item) => [item.id, item.planned_grams, item.lock_type]),
    ).toEqual([
      ['line-banana', 100, 'main'],
      ['line-strawberry', 100, 'main'],
    ]);
  });

  it('Main + unavailable stops explicitly until that canonical ingredient is re-added', () => {
    useRecipeStore.getState().loadRecipeInput(ownerInput());
    useRecipeStore.getState().markIngredientUnavailable('line-banana');
    expect(useRecipeStore.getState().items.some((item) => item.id === 'line-banana')).toBe(false);
    expect(useRecipeStore.getState().items.some((item) => item.id === 'line-strawberry')).toBe(
      true,
    );
    expect(useRecipeStore.getState().unavailableMainIngredientIds).toEqual([
      BANANA.canonical_ingredient_id,
    ]);

    useConstraintStudioStore.getState().createOptimizePreview();
    const stopped = useConstraintStudioStore.getState().previewIssue;
    expect(stopped?.code).toBe('main_ingredient_unavailable');
    expect(useConstraintStudioStore.getState().preview).toBeNull();

    useRecipeStore.getState().addIngredient(BANANA, 100);
    expect(useRecipeStore.getState().unavailableMainIngredientIds).toEqual([]);
    expect(
      useRecipeStore.getState().items.find((item) => item.ingredient.id === BANANA.id)?.lock_type,
    ).toBe('main');
  });

  it('the trustless Apply door rejects a forged proposal that removes Main identity', () => {
    const current = ownerInput();
    const forgedInput: RecipeInput = {
      ...current,
      items: current.items.map((item, index) =>
        index === 0 ? { ...item, planned_grams: 0, lock_type: 'unlocked' } : item,
      ),
    };
    const forged: ConstraintPreview = {
      kind: 'batch_rescale',
      titlePl: 'forged',
      baseFingerprint: workingStateFingerprint(current, NO),
      proposedInput: forgedInput,
      nextConstraints: NO,
      lines: [],
      violationsBefore: 0,
      violationsAfter: 0,
      explanation: [],
      engineVersion: '0.4.0',
      configVersion: '0.7.0',
      createdAt: 'now',
      outcomeClassification: {
        outcome: 'no_verified_change',
        batchReconciled: false,
        compositionUnchanged: false,
        engineImproved: false,
        beforeGrams: 200,
        afterGrams: 100,
        targetBatchGrams: 1000,
        violationsBefore: 0,
        violationsAfter: 0,
      },
    };
    const result = commitPreview(current, NO, forged, 'now', 'change-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The universal line-contract gate now rejects the forged lock transition
    // before the later Main-specific identity gate can run.
    expect((result as { code: string }).code).toBe('physical_actual_violated');
  });
});
