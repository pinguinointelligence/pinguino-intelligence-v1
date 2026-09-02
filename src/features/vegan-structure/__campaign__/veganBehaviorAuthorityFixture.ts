/**
 * Campaign-only ProductBehavior authority for Vegan QA recipes.
 *
 * This does NOT bypass the ProductBehavior gate — it feeds it. Every snapshot is
 * produced by the real `snapshotServerResolvedProductBehavior` resolver, and every
 * fact it carries is read from the ingredient's actual Mapper row (vegan
 * eligibility, technical composition, reference price). Nothing about catalog
 * status, eligibility or Main policy is invented: a row that is VEGAN_CONFLICT in
 * the Mapper resolves to `conflict` here and stays blocked downstream.
 */
import type { EngineIngredient, RecipeInput } from '@/engine';
import {
  snapshotServerResolvedProductBehavior,
  type ProductBehaviorSnapshot,
  type ServerResolvedProductBehavior,
} from '@/features/product-intelligence';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';

const VEGAN_ELIGIBILITY: Record<string, ServerResolvedProductBehavior['veganEligibility']> = {
  VEGAN_VERIFIED: 'verified',
  VEGAN_FALSE: 'false',
  VEGAN_CONFLICT: 'conflict',
  VEGAN_UNKNOWN: 'unknown',
};

function resolutionFor(
  ingredient: EngineIngredient,
  temperatureC: number,
  mode: 'optimal' | 'eco',
): ServerResolvedProductBehavior {
  const entityId = ingredient.canonical_ingredient_id ?? ingredient.id;
  const c = ingredient.composition;
  const vegan =
    VEGAN_ELIGIBILITY[ingredient.flags?.vegan_eligibility ?? 'VEGAN_UNKNOWN'] ?? 'unknown';
  return {
    schemaVersion: 1,
    resolverVersion: 'vegan-campaign-resolver-v1',
    entityKind: 'mapper',
    productId: `product-${entityId}`,
    productVersionId: `version-${entityId}`,
    factsFingerprint: `facts-${entityId}`,
    catalogStatus: 'pi_base',
    provenance: 'mapper',
    behaviorBindingId: `binding-${entityId}`,
    behaviorBindingVersion: 'binding-v1',
    taxonomyVersion: 'taxonomy-v1',
    mapperIngredientId: entityId,
    familyId: 'standard',
    subfamilyId: null,
    formId: null,
    mainEligibility: 'NOT_MAIN',
    veganEligibility: vegan,
    proteinBehavior: 'neutral',
    processBehavior: { decision: 'HEAT_PROCESS' },
    approvedLiquidDairyCarrier: false,
    context: {
      accountId: 'user-1',
      productProfile: 'vegan_gelato',
      temperatureC,
      mode,
      processScope: 'BASE_FORMULATION',
      requestedRole: 'STANDARD',
      module: 'BASE_RECIPE',
    },
    module: 'BASE_RECIPE',
    state: 'eligible',
    // Every module in the union is declared explicitly — an omitted module reads
    // as "not approved" at the gate, which is the correct fail-closed default.
    moduleEligibility: {
      SEARCH: 'eligible',
      BASE_RECIPE: 'eligible',
      TOPPING: 'eligible',
      SAVE: 'eligible',
      PRODUCTION: 'eligible',
      NUTRITION: 'eligible',
      ALLERGENS: 'eligible',
      PROCESS: 'eligible',
      SUMMARY: 'eligible',
      MONITOR: 'eligible',
      COST: 'eligible',
      LABEL: 'eligible',
      MASTER_LABEL: 'eligible',
      SUBSTITUTION: 'eligible',
      BATCH_RESCUE: 'eligible',
      RECIPE_VERSION: 'eligible',
      RESTORE: 'eligible',
      EXPORT: 'eligible',
      MAIN: 'blocked',
      OPTIMAL: 'eligible',
      ECO: 'eligible',
    },
    mainPolicy: null,
    sharedFacts: {
      schemaVersion: 1,
      // Read straight off the Mapper row — never synthesised.
      // Frozen EXACTLY as the Engine ingredient reports it. `technicalFactsMatch`
      // compares every field to 1e-7 and treats a coerced null-to-zero as a real
      // fact mismatch, which is precisely the staleness signal it exists to give.
      technicalComposition: {
        water: c.water_percent,
        totalSolids: c.solids_percent,
        fat: c.fat_percent,
        saturatedFat: c.saturated_fat_percent,
        protein: c.protein_percent,
        carbohydrate: c.carbohydrate_percent,
        sugars: c.sugar_percent,
        sucrose: c.sucrose_percent,
        glucose: c.glucose_percent,
        dextrose: c.dextrose_percent,
        fructose: c.fructose_percent,
        lactose: c.lactose_percent,
        polyols: c.polyol_percent,
        fibre: c.fiber_percent,
        salt: c.salt_percent,
        alcohol: c.alcohol_percent,
        energyKcal: c.kcal_per_100g,
        podValue: ingredient.pod_value,
        pacValue: ingredient.pac_value,
        deValue: ingredient.de_value,
      },
      nutritionPer100g: {
        basis: 'per_100g',
        energyKcal: c.kcal_per_100g,
        fat: c.fat_percent,
        saturatedFat: c.saturated_fat_percent ?? 0,
        carbohydrate: c.carbohydrate_percent,
        sugars: c.sugar_percent,
        protein: c.protein_percent,
        salt: c.salt_percent,
        fibre: c.fiber_percent,
      },
      allergens: {
        ingredientsText: ingredient.name,
        allergensText: '',
        declared: [],
        mayContain: [],
        evidenceVersion: 'vegan-campaign-allergens-v1',
      },
      processEvidence: [
        {
          decision: 'heat_required_for_function',
          reasonType: 'process_requirement',
          affectedIngredientIds: [entityId],
          explanation: 'Vegan campaign base pasteurisation scope.',
          source: {
            id: `process-${entityId}`,
            label: 'Vegan campaign process scope',
            reference: `process-ref-${entityId}`,
            verificationStatus: 'verified',
          },
        },
      ],
      profileEligibility: ['vegan_gelato'],
      veganEligibility: vegan,
      proteinBehavior: 'neutral',
      referencePrice:
        ingredient.cost_per_kg === null
          ? null
          : {
              pricePerKg: ingredient.cost_per_kg,
              currency: ingredient.cost_currency ?? 'EUR',
              sourceVersion: 'mapper-v1',
            },
    },
    privateOverlay: null,
    warnings: [],
    blockReasons: [],
  } as ServerResolvedProductBehavior;
}

/** Behaviour snapshots for every line of a Vegan draft, keyed by line id. */
export function veganBehaviorSnapshots(
  input: RecipeInput,
): Record<string, ProductBehaviorSnapshot> {
  const mode = input.goals?.formulation_strategy === 'eco' ? 'eco' : 'optimal';
  return Object.fromEntries(
    input.items.map((item) => [
      item.id,
      snapshotServerResolvedProductBehavior({
        lineId: item.id,
        processScope: 'BASE_FORMULATION',
        resolved: resolutionFor(item.ingredient, input.target_temperature_c, mode),
      }),
    ]),
  );
}

/** A complete, schema-valid composition payload for a Vegan draft. The
 * persistence layer round-trips this through `readRecipeCompositionMetadata`,
 * which rejects anything that is not schemaVersion 1 / BASE_FORMULATION. */
export function veganComposition(input: RecipeInput): RecipeCompositionMetadata {
  return {
    schemaVersion: 1,
    baseScope: 'BASE_FORMULATION',
    baseOrder: input.items.map((item) => item.id),
    toppings: [],
    behaviorSnapshots: veganBehaviorSnapshots(input),
    migrationAmbiguities: [],
  };
}
