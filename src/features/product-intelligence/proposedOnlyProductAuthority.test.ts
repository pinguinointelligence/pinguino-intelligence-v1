import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type EngineIngredient,
  type RecipeInput,
} from '@/engine';
import type { ProductBehaviorSnapshot } from './contracts';
import { materializeProposedOnlyRecipeInput } from './recipeBehaviorAuthority';
import { productBehaviorSnapshotFingerprint } from './productBehaviorResolver';
import {
  classifyPreviewOutcome,
  commitPreview,
  rebuildPreviewWithAuthoritativeProposedInput,
  workingStateFingerprint,
  type BuildPreviewResult,
} from '@/features/constraint-studio/applyPipeline';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';

const currentFacts = {
  water: 9.1,
  totalSolids: 90.9,
  fat: 0,
  saturatedFat: 0,
  protein: 0,
  carbohydrate: 90.9,
  sugars: 90.9,
  sucrose: 0,
  glucose: 0,
  dextrose: 90.9,
  fructose: 0,
  lactose: 0,
  polyols: 0,
  fibre: 0,
  salt: 0,
  alcohol: 0,
  energyKcal: 364,
  podValue: 72.7,
  pacValue: 172.7,
  deValue: null,
} as const;

const ingredient = (
  mapperIngredientId: string,
  name: string,
  overrides: Partial<EngineIngredient['composition']> = {},
): EngineIngredient => ({
  id: mapperIngredientId === 'PI-ING-000494' ? 'dextrose' : mapperIngredientId,
  canonical_ingredient_id: mapperIngredientId,
  name,
  category: 'other',
  composition: {
    water_percent: 0,
    solids_percent: 100,
    fat_percent: 0,
    saturated_fat_percent: 0,
    protein_percent: 0,
    carbohydrate_percent: 100,
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
    ...overrides,
  },
  pod_value: null,
  pac_value: null,
  de_value: null,
  cost_per_kg: null,
  confidence_score: 98,
  source_type: 'verified_db',
  is_verified: true,
});

const line = (id: string, value: EngineIngredient, grams: number) => ({
  id,
  ingredient: value,
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked' as const,
});

const recipe = (items: RecipeInput['items']): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  items,
});

const visibleRecipe = (): RecipeInput =>
  recipe([
    line('egg-yolk-line', ingredient('PI-ING-001646', 'EGG YOLK'), 70),
    line('sucrose-line', ingredient('PI-ING-000514', 'SUCROSE SUGAR'), 140),
    line('cream-line', ingredient('PI-ING-001390', 'CREAM 36%'), 150),
    line('milk-line', ingredient('PI-ING-000201', 'MILK 3.2%'), 600),
    line('coffee-line', ingredient('PI-ING-000167', 'COFFEE INSTANT'), 35),
    line('salt-line', ingredient('PI-ING-000458', 'SALT'), 5),
  ]);

const dextroseSnapshot = (
  lineId: string,
  factsFingerprint = 'facts-current',
): ProductBehaviorSnapshot => ({
  schemaVersion: 1,
  resolutionState: 'RESOLVED',
  lineId,
  productId: 'mapper:PI-ING-000494',
  productVersionId: 'mapper:PI-ING-000494:version:current',
  source: 'mapper',
  factsFingerprint,
  behaviorBindingId: 'binding:PI-ING-000494',
  behaviorBindingVersion: '1',
  taxonomyVersion: 'test-v1',
  familyId: 'sweetener',
  subfamilyId: null,
  formId: 'dry',
  verificationState: 'verified',
  technicalAuthority: 'mapper_exact',
  mapperIngredientId: 'PI-ING-000494',
  mainClassification: 'NOT_MAIN',
  mainPolicyId: null,
  mainPolicyVersion: null,
  ecoFloorPercent: null,
  optimalCeilingPercent: null,
  hardLimitPercent: null,
  mainEquivalentFactor: null,
  mainBasis: null,
  requiresLiquidDairyCarrier: false,
  liquidDairyCarrierFloorPercent: null,
  approvedLiquidDairyCarrier: false,
  approvedMixedFamilyIds: [],
  moduleEligibility: { BASE_RECIPE: 'eligible', OPTIMAL: 'eligible', SAVE: 'eligible' },
  processScope: 'BASE_FORMULATION',
  resolverVersion: 'test-v1',
  sharedFacts: {
    schemaVersion: 1,
    technicalComposition: { ...currentFacts },
    nutritionPer100g: null,
    allergens: null,
    processEvidence: [],
    profileEligibility: ['milk_gelato', 'custom'],
    veganEligibility: 'verified',
    proteinBehavior: 'neutral',
    referencePrice: null,
  },
  warnings: [],
  blockReasons: [],
});

const snapshotForCurrentLine = (item: RecipeInput['items'][number]): ProductBehaviorSnapshot => {
  const mapperId = item.ingredient.canonical_ingredient_id ?? item.ingredient.id;
  const composition = item.ingredient.composition;
  return {
    ...dextroseSnapshot(item.id, `facts:${mapperId}`),
    productId: `mapper:${mapperId}`,
    productVersionId: `mapper:${mapperId}:version:current`,
    mapperIngredientId: mapperId,
    behaviorBindingId: `binding:${mapperId}`,
    sharedFacts: {
      ...dextroseSnapshot(item.id).sharedFacts!,
      technicalComposition: {
        water: composition.water_percent ?? 0,
        totalSolids: composition.solids_percent ?? 0,
        fat: composition.fat_percent ?? 0,
        saturatedFat: composition.saturated_fat_percent ?? 0,
        protein: composition.protein_percent ?? 0,
        carbohydrate: composition.carbohydrate_percent ?? 0,
        sugars: composition.sugar_percent ?? 0,
        sucrose: composition.sucrose_percent ?? 0,
        glucose: composition.glucose_percent ?? 0,
        dextrose: composition.dextrose_percent ?? 0,
        fructose: composition.fructose_percent ?? 0,
        lactose: composition.lactose_percent ?? 0,
        polyols: composition.polyol_percent ?? 0,
        fibre: composition.fiber_percent ?? 0,
        salt: composition.salt_percent ?? 0,
        alcohol: composition.alcohol_percent ?? 0,
        energyKcal: composition.kcal_per_100g ?? 0,
        podValue: item.ingredient.pod_value,
        pacValue: item.ingredient.pac_value,
        deValue: item.ingredient.de_value,
      },
    },
  };
};

const staleDextrose = (name = 'DEXTROSE · Sweetener · Dry'): EngineIngredient => ({
  ...ingredient('PI-ING-000494', name, {
    water_percent: 8,
    solids_percent: 92,
    carbohydrate_percent: 92,
    sugar_percent: 92,
    dextrose_percent: 92,
    kcal_per_100g: 368,
  }),
  category: 'sugar',
  pod_value: 70.84,
  pac_value: 174.8,
});

describe('proposed-only product authority', () => {
  it('refreshes the solver-added Dextrose by stable Mapper ID without touching the visible recipe', () => {
    const current = visibleRecipe();
    const currentBefore = structuredClone(current);
    const proposed = recipe([...current.items, line('formulation-dextrose', staleDextrose(), 45)]);

    const refreshed = materializeProposedOnlyRecipeInput({
      currentRecipe: current,
      proposedRecipe: proposed,
      snapshots: { 'formulation-dextrose': dextroseSnapshot('formulation-dextrose') },
    });

    expect(current).toEqual(currentBefore);
    expect(
      current.items.some((item) => item.ingredient.canonical_ingredient_id === 'PI-ING-000494'),
    ).toBe(false);
    expect(refreshed.refreshedLineIds).toEqual(['formulation-dextrose']);
    const dextrose = refreshed.recipe.items.find((item) => item.id === 'formulation-dextrose')!;
    expect(dextrose.ingredient.canonical_ingredient_id).toBe('PI-ING-000494');
    expect(dextrose.ingredient.composition).toMatchObject({
      water_percent: 9.1,
      solids_percent: 90.9,
      sugar_percent: 90.9,
      dextrose_percent: 90.9,
      kcal_per_100g: 364,
    });
    expect(dextrose.ingredient.pod_value).toBe(72.7);
    expect(dextrose.ingredient.pac_value).toBe(172.7);
  });

  it('is idempotent and identifies occurrences by recipe line id, never name or order', () => {
    const current = visibleRecipe();
    const proposed = recipe([
      line('proposal-occurrence-b', staleDextrose('RENAMED PRODUCT'), 20),
      ...[...current.items].reverse(),
      line('proposal-occurrence-a', staleDextrose('ANOTHER DISPLAY NAME'), 25),
    ]);
    const snapshots = {
      'proposal-occurrence-a': dextroseSnapshot('proposal-occurrence-a'),
      'proposal-occurrence-b': dextroseSnapshot('proposal-occurrence-b'),
    };

    const once = materializeProposedOnlyRecipeInput({
      currentRecipe: current,
      proposedRecipe: proposed,
      snapshots,
    });
    const twice = materializeProposedOnlyRecipeInput({
      currentRecipe: current,
      proposedRecipe: once.recipe,
      snapshots,
    });

    expect(once.refreshedLineIds).toEqual(['proposal-occurrence-a', 'proposal-occurrence-b']);
    expect(twice.refreshedLineIds).toEqual([]);
    expect(twice.recipe).toEqual(once.recipe);
    expect(
      once.recipe.items
        .filter((item) => item.ingredient.canonical_ingredient_id === 'PI-ING-000494')
        .map((item) => item.id)
        .sort(),
    ).toEqual(['proposal-occurrence-a', 'proposal-occurrence-b']);
    expect(
      once.recipe.items.find((item) => item.id === 'proposal-occurrence-b')!.ingredient.name,
    ).toBe('RENAMED PRODUCT');
  });

  it('keeps product identity stable while a facts change requires a new fingerprint', () => {
    const oldVersion = dextroseSnapshot('formulation-dextrose', 'facts-old');
    const newVersion = dextroseSnapshot('formulation-dextrose', 'facts-new');

    expect(newVersion.mapperIngredientId).toBe(oldVersion.mapperIngredientId);
    expect(newVersion.productId).toBe(oldVersion.productId);
    expect(newVersion.factsFingerprint).not.toBe(oldVersion.factsFingerprint);
  });

  it('rebuilds Preview and Apply from current facts while leaving the current recipe untouched before Apply', () => {
    const balanced = starterMilkBase();
    const current = {
      ...balanced,
      items: balanced.items
        .filter((item) => item.id !== 'milk-base:dextrose')
        .map((item) =>
          item.id === 'milk-base:milk_3_5'
            ? { ...item, planned_grams: item.planned_grams + 30 }
            : item,
        ),
    };
    const currentBefore = structuredClone(current);
    const staleProposed = {
      ...current,
      items: [
        ...current.items.map((item) =>
          item.id === 'milk-base:milk_3_5'
            ? { ...item, planned_grams: item.planned_grams - 30 }
            : item,
        ),
        line('formulation-dextrose', staleDextrose(), 30),
      ],
    };
    const none = { byLineId: {} };
    const createdAt = '2026-09-08T12:00:00.000Z';
    const seed = {
      ok: true,
      preview: {
        kind: 'optimize',
        titlePl: 'Przeliczona receptura',
        outcomeClassification: classifyPreviewOutcome(current, staleProposed),
        baseFingerprint: workingStateFingerprint(current, none),
        proposedInput: staleProposed,
        nextConstraints: none,
        lines: [],
        violationsBefore: detectViolations(calculateRecipe(current)).length,
        violationsAfter: 0,
        explanation: [],
        engineVersion: calculateRecipe(current).engine_version,
        configVersion: calculateRecipe(current).config_version,
        createdAt,
      },
    } satisfies BuildPreviewResult;
    const raw = rebuildPreviewWithAuthoritativeProposedInput(
      seed,
      current,
      none,
      staleProposed,
      {},
    );
    expect(raw.ok).toBe(true);
    if (!raw.ok) return;
    expect(
      raw.preview.proposedInput.items.find((item) => item.id === 'formulation-dextrose')!.ingredient
        .composition.water_percent,
    ).toBe(8);

    const snapshot = dextroseSnapshot('formulation-dextrose');
    const baseSnapshots = Object.fromEntries(
      current.items.map((item) => [item.id, snapshotForCurrentLine(item)]),
    );
    const materialized = materializeProposedOnlyRecipeInput({
      currentRecipe: current,
      proposedRecipe: raw.preview.proposedInput,
      snapshots: { 'formulation-dextrose': snapshot },
    });
    const rebuilt = rebuildPreviewWithAuthoritativeProposedInput(
      raw,
      current,
      none,
      materialized.recipe,
      { 'formulation-dextrose': snapshot },
    );
    expect(rebuilt.ok).toBe(true);
    if (!rebuilt.ok) return;

    const proposalSnapshots = { ...baseSnapshots, 'formulation-dextrose': snapshot };
    const proposalFingerprint = productBehaviorSnapshotFingerprint(proposalSnapshots);
    rebuilt.preview.productBehaviorFingerprint = proposalFingerprint;
    rebuilt.preview.baseProductBehaviorFingerprint =
      productBehaviorSnapshotFingerprint(baseSnapshots);
    const authorization = {
      baseFingerprint: rebuilt.preview.baseFingerprint,
      proposedFingerprint: workingStateFingerprint(
        rebuilt.preview.proposedInput,
        rebuilt.preview.nextConstraints,
      ),
      baseProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(baseSnapshots),
      proposedProductBehaviorFingerprint: proposalFingerprint,
      snapshots: proposalSnapshots,
    };

    expect(current).toEqual(currentBefore);
    expect(current.items).toHaveLength(5);
    expect(
      current.items.some((item) => item.ingredient.canonical_ingredient_id === 'PI-ING-000494'),
    ).toBe(false);
    const previewDextrose = rebuilt.preview.proposedInput.items.find(
      (item) => item.id === 'formulation-dextrose',
    )!;
    expect(previewDextrose.ingredient.composition.water_percent).toBe(9.1);
    expect(previewDextrose.ingredient.pod_value).toBe(72.7);
    expect(previewDextrose.ingredient.pac_value).toBe(172.7);

    const applied = commitPreview(
      current,
      none,
      rebuilt.preview,
      createdAt,
      'apply-authoritative-proposed-input',
      [],
      undefined,
      null,
      null,
      null,
      null,
      baseSnapshots,
      [],
      authorization,
      null,
      { prebuiltOptimizeRebuild: rebuilt },
    );
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    const appliedDextrose = applied.verified.input.items.find(
      (item) => item.id === 'formulation-dextrose',
    )!;
    expect(appliedDextrose.ingredient.canonical_ingredient_id).toBe('PI-ING-000494');
    expect(appliedDextrose.ingredient.composition.water_percent).toBe(9.1);
    expect(
      applied.verified.productBehaviorSnapshots['formulation-dextrose']?.factsFingerprint,
    ).toBe('facts-current');
  });
});
