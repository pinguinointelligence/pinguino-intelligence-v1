import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import type { ProductBehaviorSnapshot } from './contracts';
import { ownerSameInputRecipe } from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import {
  bindProductBehaviorToPreview,
  buildBatchRescalePreview,
  buildOptimizePreview,
  commitPreview,
} from '@/features/constraint-studio/applyPipeline';
import { useRecipeStore } from '@/stores/recipeStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import {
  assessProductDosages,
  clampProductDosageGrams,
  productDosageAuthority,
} from './productDosageAuthority';

const snapshot = (
  lineId: string,
  mapperIngredientId: string,
  recommendedDose: {
    minPercent: number | null;
    maxPercent: number | null;
    sourceVersion: string;
  } | null,
): ProductBehaviorSnapshot =>
  ({
    schemaVersion: 1,
    resolutionState: 'RESOLVED',
    lineId,
    productId: mapperIngredientId,
    productVersionId: `${mapperIngredientId}:v1`,
    source: 'mapper',
    factsFingerprint: `${mapperIngredientId}:facts`,
    behaviorBindingId: `${mapperIngredientId}:binding`,
    behaviorBindingVersion: '1',
    taxonomyVersion: '1',
    familyId: null,
    subfamilyId: null,
    formId: null,
    verificationState: 'verified',
    technicalAuthority: 'mapper_exact',
    mapperIngredientId,
    mainClassification: 'STANDARD_ONLY',
    mainPolicyId: null,
    mainPolicyVersion: null,
    ecoFloorPercent: null,
    optimalCeilingPercent: null,
    hardLimitPercent: null,
    multiMainHardLimitPercent: null,
    mainEquivalentFactor: null,
    mainBasis: null,
    requiresLiquidDairyCarrier: false,
    liquidDairyCarrierFloorPercent: null,
    approvedLiquidDairyCarrier: false,
    approvedMixedFamilyIds: [],
    moduleEligibility: { BASE_RECIPE: 'eligible', OPTIMAL: 'eligible', ECO: 'eligible' },
    processScope: 'BASE_FORMULATION',
    resolutionContext: {
      accountId: 'owner',
      productProfile: 'milk_gelato',
      temperatureC: -12,
      mode: 'optimal',
      processScope: 'BASE_FORMULATION',
      requestedRole: 'STANDARD',
      module: 'BASE_RECIPE',
    },
    resolverVersion: 'resolver-v1',
    sharedFacts: {
      schemaVersion: 1,
      technicalComposition: null,
      nutritionPer100g: null,
      allergens: null,
      processEvidence: [],
      profileEligibility: [],
      veganEligibility: 'unknown',
      proteinBehavior: 'neutral',
      referencePrice: null,
      recommendedDose,
    },
    warnings: [],
    blockReasons: [],
  }) as ProductBehaviorSnapshot;

const recipe = (lineId: string, mapperIngredientId: string, grams: number): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  items: [
    {
      id: lineId,
      ingredient: {
        id: mapperIngredientId,
        canonical_ingredient_id: mapperIngredientId,
        identity_provenance: 'mapper',
        name: mapperIngredientId,
        category: 'stabilizer',
        composition: {
          water_percent: 0,
          solids_percent: 100,
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
          fiber_percent: 100,
          salt_percent: 0,
          alcohol_percent: 0,
          kcal_per_100g: 0,
        },
        pod_value: 0,
        pac_value: 0,
        de_value: null,
        cost_per_kg: null,
        confidence_score: 100,
        source_type: 'verified_db',
        is_verified: true,
      },
      planned_grams: grams,
      actual_grams: null,
      lock_type: 'unlocked',
    },
  ],
});

describe('ProductBehavior dosage authority', () => {
  it('reads Tara and another stabilizer range from the immutable Mapper evidence', () => {
    const csv = readFileSync(
      resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
      'utf8',
    );
    const [header, ...rows] = csv.split(/\r?\n/);
    const columns = header!.split(',');
    const minIndex = columns.indexOf('recommended_dosage_percent_min');
    const maxIndex = columns.indexOf('recommended_dosage_percent_max');
    const row = (id: string) => rows.find((entry) => entry.startsWith(`${id},`))!.split(',');

    expect([row('PI-ING-000492')[minIndex], row('PI-ING-000492')[maxIndex]]).toEqual(['0.2', '1']);
    expect([row('PI-ING-000472')[minIndex], row('PI-ING-000472')[maxIndex]]).toEqual(['0.2', '1']);
    expect([row('PI-ING-000456')[minIndex], row('PI-ING-000456')[maxIndex]]).toEqual(['', '']);
  });

  it('accepts a normal Tara amount and rejects 55 g with the exact approved range', () => {
    const authority = snapshot('tara', 'PI-ING-000492', {
      minPercent: 0.2,
      maxPercent: 1,
      sourceVersion: 'mapper-v1.0:PI-ING-000492',
    });
    expect(assessProductDosages(recipe('tara', 'PI-ING-000492', 5), { tara: authority })).toEqual(
      [],
    );

    expect(assessProductDosages(recipe('tara', 'PI-ING-000492', 55), { tara: authority })).toEqual([
      expect.objectContaining({
        code: 'above_maximum',
        lineId: 'tara',
        enteredGrams: 55,
        enteredPercent: 5.5,
        minPercent: 0.2,
        maxPercent: 1,
        minGrams: 2,
        maxGrams: 10,
        sourceVersion: 'mapper-v1.0:PI-ING-000492',
      }),
    ]);
  });

  it('enforces the same exact range for another dosage-controlled stabilizer', () => {
    const guar = snapshot('guar', 'PI-ING-000472', {
      minPercent: 0.2,
      maxPercent: 1,
      sourceVersion: 'mapper-v1.0:PI-ING-000472',
    });
    expect(assessProductDosages(recipe('guar', 'PI-ING-000472', 25), { guar })).toEqual([
      expect.objectContaining({ code: 'above_maximum', enteredGrams: 25, maxGrams: 10 }),
    ]);
  });

  it('clamps a manual excessive amount to the nearest approved boundary', () => {
    const authority = snapshot('tara', 'PI-ING-000492', {
      minPercent: 0.2,
      maxPercent: 1,
      sourceVersion: 'mapper-v1.0:PI-ING-000492',
    });
    expect(clampProductDosageGrams(55, 1_000, authority)).toMatchObject({
      ok: true,
      grams: 10,
      clamped: true,
    });
    expect(clampProductDosageGrams(5, 1_000, authority)).toMatchObject({
      ok: true,
      grams: 5,
      clamped: false,
    });
  });

  it('does not invent an Inulin limit when its Mapper dosage evidence is blank', () => {
    const inulin = snapshot('inulin', 'PI-ING-000456', null);
    expect(productDosageAuthority(inulin, 1_000)).toEqual({ status: 'not_defined' });
    expect(assessProductDosages(recipe('inulin', 'PI-ING-000456', 555), { inulin })).toEqual([]);
    expect(clampProductDosageGrams(555, 1_000, inulin)).toEqual({
      ok: true,
      grams: 555,
      clamped: false,
      authority: null,
    });
  });

  it('fails closed for malformed or contradictory dosage evidence', () => {
    const malformed = snapshot('tara', 'PI-ING-000492', {
      minPercent: 2,
      maxPercent: 1,
      sourceVersion: 'mapper-v1.0:PI-ING-000492',
    });
    expect(productDosageAuthority(malformed, 1_000)).toMatchObject({
      status: 'invalid_evidence',
    });
    expect(assessProductDosages(recipe('tara', 'PI-ING-000492', 5), { tara: malformed })).toEqual([
      expect.objectContaining({ code: 'invalid_evidence', lineId: 'tara' }),
    ]);
    expect(clampProductDosageGrams(55, 1_000, malformed)).toMatchObject({
      ok: false,
      code: 'invalid_evidence',
    });
  });

  it('clamps a direct manual grams edit before it reaches PI', () => {
    const before = useRecipeStore.getState();
    const input = ownerSameInputRecipe();
    const tara = snapshot('owner:tara_gum', 'PI-ING-000492', {
      minPercent: 0.2,
      maxPercent: 1,
      sourceVersion: 'mapper-v1.0:PI-ING-000492',
    });
    try {
      useRecipeStore.setState({
        items: input.items,
        target_batch_grams: input.target_batch_grams,
        productBehaviorSnapshots: { 'owner:tara_gum': tara },
      });
      useRecipeStore.getState().setPlannedGrams('owner:tara_gum', 55);
      expect(
        useRecipeStore.getState().items.find((item) => item.id === 'owner:tara_gum'),
      ).toMatchObject({ planned_grams: 10, user_target_grams: 10 });
    } finally {
      useRecipeStore.setState(before, true);
    }
  });

  it('marks an excessive generated candidate diagnostic and blocks forged Apply trustlessly', () => {
    const input = ownerSameInputRecipe();
    input.items = input.items.map((item) =>
      item.id === 'owner:tara_gum'
        ? { ...item, planned_grams: 55 }
        : item.id === 'owner:milk_3_5'
          ? { ...item, planned_grams: item.planned_grams - 53.1 }
          : item,
    );
    const snapshots = Object.fromEntries(
      input.items.map((item) => [
        item.id,
        snapshot(
          item.id,
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
          item.id === 'owner:tara_gum'
            ? {
                minPercent: 0.2,
                maxPercent: 1,
                sourceVersion: 'mapper-v1.0:PI-ING-000492',
              }
            : null,
        ),
      ]),
    );
    const built = buildBatchRescalePreview(input, { byLineId: {} }, 2_000, 'now');
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const bound = bindProductBehaviorToPreview(built, snapshots);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    expect(bound.preview).toMatchObject({
      diagnosticOnly: true,
      diagnosticReason: 'product_dosage',
      productDosageDiagnostics: [
        expect.objectContaining({
          code: 'above_maximum',
          ingredientName: 'TARA GUM · Stabilizer',
          enteredGrams: 110,
          maxGrams: 20,
        }),
      ],
    });

    const applied = commitPreview(
      input,
      { byLineId: {} },
      bound.preview,
      'now',
      'dosage-apply',
      [],
      undefined,
      null,
      null,
      null,
      null,
      snapshots,
    );
    expect(applied).toMatchObject({
      ok: false,
      code: 'product_behavior_invalid',
      violations: [
        expect.objectContaining({
          code: 'product_dosage_violation',
          lineIds: ['owner:tara_gum'],
        }),
      ],
    });
  });

  it('does not misreport an already-clean PI state when the current draft violates dosage', () => {
    const beforeRecipe = useRecipeStore.getState();
    const beforeStudio = useConstraintStudioStore.getState();
    const input = ownerSameInputRecipe();
    input.items = input.items.map((item) =>
      item.id === 'owner:tara_gum'
        ? { ...item, planned_grams: 55 }
        : item.id === 'owner:milk_3_5'
          ? { ...item, planned_grams: item.planned_grams - 53.1 }
          : item,
    );
    const tara = snapshot('owner:tara_gum', 'PI-ING-000492', {
      minPercent: 0.2,
      maxPercent: 1,
      sourceVersion: 'mapper-v1.0:PI-ING-000492',
    });
    try {
      useRecipeStore.setState({
        items: input.items,
        target_batch_grams: input.target_batch_grams,
        productBehaviorSnapshots: { 'owner:tara_gum': tara },
      });
      useConstraintStudioStore.getState().createOptimizePreview();
      expect(useConstraintStudioStore.getState()).toMatchObject({
        preview: null,
        previewIssue: {
          ok: false,
          code: 'product_behavior_invalid',
          violations: [expect.objectContaining({ code: 'product_dosage_violation' })],
        },
        recalculationTerminal: {
          state: 'BLOCKED_WITH_EXACT_ACTION',
          code: 'product_behavior_invalid',
        },
      });
    } finally {
      useRecipeStore.setState(beforeRecipe, true);
      useConstraintStudioStore.setState(beforeStudio, true);
    }
  });

  it('keeps the guarded recipe write closed even if a caller bypasses Preview', () => {
    const before = useRecipeStore.getState();
    const input = ownerSameInputRecipe();
    input.items = input.items.map((item) =>
      item.id === 'owner:tara_gum'
        ? { ...item, planned_grams: 55 }
        : item.id === 'owner:milk_3_5'
          ? { ...item, planned_grams: item.planned_grams - 53.1 }
          : item,
    );
    const tara = snapshot('owner:tara_gum', 'PI-ING-000492', {
      minPercent: 0.2,
      maxPercent: 1,
      sourceVersion: 'mapper-v1.0:PI-ING-000492',
    });
    try {
      const written = useRecipeStore
        .getState()
        .applyVerifiedRecipeInput(input, { 'owner:tara_gum': tara });
      expect(written).toMatchObject({
        ok: false,
        code: 'product_dosage_violation',
        violations: [expect.objectContaining({ lineId: 'owner:tara_gum', enteredGrams: 55 })],
      });
      expect(useRecipeStore.getState().items).toBe(before.items);
    } finally {
      useRecipeStore.setState(before, true);
    }
  });

  it('does not let 555 g Inulin silently survive the real PI flow as an applicable success', () => {
    const input = ownerSameInputRecipe();
    input.items = input.items.map((item) =>
      item.id === 'owner:inulin'
        ? { ...item, planned_grams: 555 }
        : item.id === 'owner:milk_3_5'
          ? { ...item, planned_grams: item.planned_grams - 500.9 }
          : item,
    );
    const snapshots = Object.fromEntries(
      input.items.map((item) => [
        item.id,
        snapshot(
          item.id,
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
          item.id === 'owner:tara_gum'
            ? {
                minPercent: 0.2,
                maxPercent: 1,
                sourceVersion: 'mapper-v1.0:PI-ING-000492',
              }
            : null,
        ),
      ]),
    );
    const built = buildOptimizePreview(input, { byLineId: {} }, 'now', {
      productBehaviorSnapshots: snapshots,
    });
    if (!built.ok) {
      expect(built.code).not.toBe('already_clean');
      return;
    }
    const bound = bindProductBehaviorToPreview(built, snapshots);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const proposedInulin = bound.preview.proposedInput.items.find(
      (item) => item.id === 'owner:inulin',
    )!.planned_grams;
    expect(
      proposedInulin < 555 ||
        bound.preview.diagnosticOnly === true ||
        (bound.preview.hardResidualMetrics?.length ?? 0) > 0,
    ).toBe(true);
  });
});
