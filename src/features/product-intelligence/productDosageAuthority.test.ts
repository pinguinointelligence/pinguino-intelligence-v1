/**
 * MANUFACTURER DOSAGE IS INFORMATIONAL ONLY (owner decision, 2026-08-23).
 *
 * These are the regression proofs for the removal of dosage as runtime
 * authority. The Mapper still carries `recommended_dosage_percent_min/max`, and
 * a product may still state something like `100–250 g/L` — we show it and stop
 * there. What must never happen again: a missing, ambiguous or exceeded dosage
 * withholding a product, a Preview, an Apply, a Save or a Production start.
 *
 * PINGÜINO's OWN stabilizer system is a different thing and is deliberately
 * still enforced here: it is Gellatti's science about its own recipe, not a
 * manufacturer's instruction about their product.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProductBehaviorSnapshot } from './contracts';
import { ownerSameInputRecipe } from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import {
  bindProductBehaviorToPreview,
  buildBatchRescalePreview,
  buildOptimizePreview,
  commitPreview,
} from '@/features/constraint-studio/applyPipeline';
import { assessOwnerStabilizerSystem } from '@/features/recipe-constraints';
import { useRecipeStore } from '@/stores/recipeStore';
import { productRecommendedDosageInfo, productRecommendedDosagePl } from './productDosageAuthority';

const snapshot = (
  lineId: string,
  mapperIngredientId: string,
  recommendedDose: {
    minPercent: number | null;
    preferredPercent?: number | null;
    maxPercent: number | null;
    sourceVersion: string;
    rawValue?: string | null;
    presenceSemantics?: 'optional_zero_or_range';
    provenance?: string;
    policyId?: string;
    policyVersion?: number;
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
      profileEligibility: ['milk_gelato'],
      veganEligibility: 'unknown',
      proteinBehavior: 'neutral',
      referencePrice: null,
      recommendedDose,
    },
    warnings: [],
    blockReasons: [],
  }) as ProductBehaviorSnapshot;

describe('product dosage is informational only', () => {
  it('preserves the raw Mapper dosage columns exactly as they were', () => {
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
    expect([row('PI-ING-000475')[minIndex], row('PI-ING-000475')[maxIndex]]).toEqual(['0.2', '1']);
    expect([row('PI-ING-000490')[minIndex], row('PI-ING-000490')[maxIndex]]).toEqual(['0.2', '1']);
    expect([row('PI-ING-000456')[minIndex], row('PI-ING-000456')[maxIndex]]).toEqual(['', '']);
  });

  it('clamps a newly added gum against the existing Gelato aggregate and preserves legal 1 g components', () => {
    const before = useRecipeStore.getState();
    const input = ownerSameInputRecipe();
    const tara = input.items.find((item) => item.id === 'owner:tara_gum')!;
    const guar = {
      ...tara.ingredient,
      id: 'PI-ING-TEST-GUAR',
      canonical_ingredient_id: 'PI-ING-TEST-GUAR',
      name: 'Guar Gum',
    };
    try {
      useRecipeStore.setState({
        category: input.category,
        items: input.items.map((item) =>
          item.id === tara.id ? { ...item, planned_grams: 4 } : item,
        ),
        target_batch_grams: input.target_batch_grams,
        productBehaviorSnapshots: {},
      });
      const added = useRecipeStore.getState().addIngredient(guar, 10);
      expect(added.status).toBe('added');
      expect(
        useRecipeStore.getState().items.find((item) => item.id === added.lineId),
      ).toMatchObject({
        planned_grams: 1,
        user_intent_anchor_grams: 1,
      });
    } finally {
      useRecipeStore.setState(before, true);
    }
  });

  it('keeps manual grams and bulk grams closed without required ProductBehavior', () => {
    const before = useRecipeStore.getState();
    const input = ownerSameInputRecipe();
    const managedPeer = input.items.find((item) => item.id !== 'owner:tara_gum')!;
    try {
      useRecipeStore.setState({
        items: input.items,
        target_batch_grams: input.target_batch_grams,
        // A managed recipe context exists, but Tara's exact snapshot is
        // absent. Completely snapshot-free local starter drafts retain their
        // accepted offline edit path; partial authority must fail closed.
        productBehaviorSnapshots: {
          [managedPeer.id]: snapshot(
            managedPeer.id,
            managedPeer.ingredient.canonical_ingredient_id ?? managedPeer.ingredient.id,
            null,
          ),
        },
      });
      const originalTara = input.items.find((item) => item.id === 'owner:tara_gum')!.planned_grams;
      useRecipeStore.getState().setPlannedGrams('owner:tara_gum', 5);
      expect(
        useRecipeStore.getState().items.find((item) => item.id === 'owner:tara_gum')?.planned_grams,
      ).toBe(originalTara);

      useRecipeStore.getState().setPlannedGramsVector({ 'owner:tara_gum': 5 });
      expect(
        useRecipeStore.getState().items.find((item) => item.id === 'owner:tara_gum')?.planned_grams,
      ).toBe(originalTara);
    } finally {
      useRecipeStore.setState(before, true);
    }
  });

  it('blocks an excessive Sorbet aggregate before Preview and at forged Apply', () => {
    const input = ownerSameInputRecipe();
    input.category = 'sorbet';
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
    expect(bound).toMatchObject({
      ok: false,
      code: 'product_behavior_invalid',
      violations: expect.arrayContaining([
        expect.objectContaining({
          code: 'product_behavior_missing',
          lineIds: ['owner:tara_gum'],
        }),
      ]),
    });

    const applied = commitPreview(
      input,
      { byLineId: {} },
      built.preview,
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
      code: 'practicalization_invalid',
      reason: 'profile_stabilizer_invalid',
    });
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
  it('exposes a recommended dosage as product information, and nothing more', () => {
    const tara = snapshot('tara', 'PI-ING-000492', {
      minPercent: 0.2,
      maxPercent: 1,
      sourceVersion: 'mapper-v1.0:PI-ING-000492',
    });
    expect(productRecommendedDosageInfo(tara)).toEqual({
      minPercent: 0.2,
      preferredPercent: null,
      maxPercent: 1,
      rawValue: null,
      sourceVersion: 'mapper-v1.0:PI-ING-000492',
    });
    // Shown as declared. No grams for this batch, no re-based percentage.
    expect(productRecommendedDosagePl(tara)).toBe('0.2%–1%');
    expect(productRecommendedDosagePl(snapshot('x', 'PI-ING-000456', null))).toBe(
      'Brak informacji',
    );
  });

  it('preserves an ambiguous manufacturer string verbatim and never interprets it', () => {
    const paste = snapshot('paste', 'PI-ING-000490', {
      minPercent: null,
      maxPercent: null,
      rawValue: '100–250 g/L',
      sourceVersion: 'supplier-technical-sheet',
    });
    const info = productRecommendedDosageInfo(paste)!;
    // Not converted to a percentage, not re-based onto the mix, not turned
    // into grams per 1000 g. We do not know the litre of what, and we do not
    // guess.
    expect(info.rawValue).toBe('100–250 g/L');
    expect(info.minPercent).toBeNull();
    expect(info.maxPercent).toBeNull();
    expect(productRecommendedDosagePl(paste)).toBe('100–250 g/L');
  });

  it('lets the user enter any amount of a dosage-controlled product', () => {
    const before = useRecipeStore.getState();
    const input = ownerSameInputRecipe();
    // A NON-stabilizer product carrying a narrow manufacturer window. (Our own
    // stabilizer system is separate and still applies to stabilizer lines.)
    const declared = snapshot('owner:milk_3_5', 'PI-ING-000200', {
      minPercent: 0.2,
      maxPercent: 1,
      sourceVersion: 'supplier-technical-sheet',
    });
    try {
      useRecipeStore.setState({
        category: input.category,
        items: input.items,
        target_batch_grams: input.target_batch_grams,
        productBehaviorSnapshots: { 'owner:milk_3_5': declared },
      });
      // 555 g is far outside the declared 0.2–1 % window. It is accepted: the
      // professional decides how much of their own product to use.
      useRecipeStore.getState().setPlannedGrams('owner:milk_3_5', 555);
      expect(
        useRecipeStore.getState().items.find((item) => item.id === 'owner:milk_3_5'),
      ).toMatchObject({ planned_grams: 555, user_target_grams: 555 });
    } finally {
      useRecipeStore.setState(before, true);
    }
  });

  it('accepts a product that declares no dosage at all', () => {
    const before = useRecipeStore.getState();
    const input = ownerSameInputRecipe();
    try {
      useRecipeStore.setState({
        category: 'sorbet',
        items: input.items,
        target_batch_grams: input.target_batch_grams,
        productBehaviorSnapshots: Object.fromEntries(
          input.items.map((item) => [
            item.id,
            snapshot(item.id, item.ingredient.canonical_ingredient_id ?? item.ingredient.id, null),
          ]),
        ),
      });
      const line = input.items.find((item) => item.id !== 'owner:tara_gum')!;
      useRecipeStore.getState().setPlannedGrams(line.id, line.planned_grams + 7);
      expect(
        useRecipeStore.getState().items.find((item) => item.id === line.id)?.planned_grams,
      ).toBe(line.planned_grams + 7);
    } finally {
      useRecipeStore.setState(before, true);
    }
  });

  it('never derives an automatic dose from a recommended dosage', () => {
    const before = useRecipeStore.getState();
    const input = ownerSameInputRecipe();
    const tara = input.items.find((item) => item.id === 'owner:tara_gum')!;
    const fresh = {
      ...tara.ingredient,
      id: 'PI-ING-TEST-FRESH',
      canonical_ingredient_id: 'PI-ING-TEST-FRESH',
      name: 'Fresh technical product',
    };
    try {
      useRecipeStore.setState({
        category: input.category,
        items: input.items,
        target_batch_grams: input.target_batch_grams,
        productBehaviorSnapshots: {},
      });
      const added = useRecipeStore.getState().addIngredient(fresh, 0);
      expect(added.status).toBe('added');
      expect(
        useRecipeStore.getState().items.find((item) => item.id === added.lineId)?.planned_grams,
      ).toBe(0);
    } finally {
      useRecipeStore.setState(before, true);
    }
  });

  it('keeps PINGÜINO\u2019s own stabilizer system enforced — it is our science, not a supplier note', () => {
    const input = ownerSameInputRecipe();
    input.category = 'sorbet';
    input.items = input.items.map((item) =>
      item.id === 'owner:tara_gum'
        ? { ...item, planned_grams: 55 }
        : item.id === 'owner:milk_3_5'
          ? { ...item, planned_grams: item.planned_grams - 53.1 }
          : item,
    );
    expect(assessOwnerStabilizerSystem(input).issues.length).toBeGreaterThan(0);
  });
});
