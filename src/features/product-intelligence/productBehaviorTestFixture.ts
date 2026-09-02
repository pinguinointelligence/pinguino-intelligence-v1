import type { EngineIngredient, RecipeInput } from '@/engine';
import { isCatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import type {
  ProductBehaviorModule,
  ProductBehaviorSnapshot,
  ProductNutritionFactsPer100g,
} from './contracts';

const MODULES: readonly ProductBehaviorModule[] = [
  'SEARCH',
  'BASE_RECIPE',
  'MAIN',
  'OPTIMAL',
  'ECO',
  'TOPPING',
  'SUBSTITUTION',
  'COST',
  'MONITOR',
  'PRODUCTION',
  'LABEL',
  'NUTRITION',
  'ALLERGENS',
  'PROCESS',
  'SUMMARY',
  'BATCH_RESCUE',
  'MASTER_LABEL',
  'RECIPE_VERSION',
  'RESTORE',
  'EXPORT',
  'SAVE',
];

const finiteOrZero = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const finiteOrNull = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const nutritionForEngine = (ingredient: EngineIngredient): ProductNutritionFactsPer100g => ({
  basis: 'per_100g',
  energyKcal: finiteOrZero(ingredient.composition.kcal_per_100g),
  fat: finiteOrZero(ingredient.composition.fat_percent),
  saturatedFat: ingredient.composition.saturated_fat_percent ?? null,
  carbohydrate: finiteOrZero(ingredient.composition.carbohydrate_percent),
  sugars: finiteOrZero(ingredient.composition.sugar_percent),
  protein: finiteOrZero(ingredient.composition.protein_percent),
  salt: finiteOrZero(ingredient.composition.salt_percent),
  fibre: ingredient.composition.fiber_percent,
});

const technicalForEngine = (
  ingredient: EngineIngredient,
): Readonly<Record<string, number | null>> => ({
  water: finiteOrNull(ingredient.composition.water_percent),
  totalSolids: finiteOrNull(ingredient.composition.solids_percent),
  fat: finiteOrNull(ingredient.composition.fat_percent),
  saturatedFat: ingredient.composition.saturated_fat_percent ?? null,
  protein: finiteOrNull(ingredient.composition.protein_percent),
  carbohydrate: finiteOrNull(ingredient.composition.carbohydrate_percent),
  sugars: finiteOrNull(ingredient.composition.sugar_percent),
  sucrose: finiteOrNull(ingredient.composition.sucrose_percent),
  glucose: finiteOrNull(ingredient.composition.glucose_percent),
  dextrose: finiteOrNull(ingredient.composition.dextrose_percent),
  fructose: finiteOrNull(ingredient.composition.fructose_percent),
  lactose: finiteOrNull(ingredient.composition.lactose_percent),
  polyols: finiteOrNull(ingredient.composition.polyol_percent),
  fibre: finiteOrNull(ingredient.composition.fiber_percent),
  salt: finiteOrNull(ingredient.composition.salt_percent),
  alcohol: finiteOrNull(ingredient.composition.alcohol_percent),
  energyKcal: finiteOrNull(ingredient.composition.kcal_per_100g),
  podValue: finiteOrNull(ingredient.pod_value),
  pacValue: finiteOrNull(ingredient.pac_value),
  deValue: ingredient.de_value,
});

/** Complete immutable authority fixture for tests that exercise terminal or
 * read-only module boundaries. Production code must always use the server RPC. */
export function productBehaviorTestSnapshots(
  input: RecipeInput,
  toppings: readonly RecipeToppingItem[] = [],
): Record<string, ProductBehaviorSnapshot> {
  const rows = [
    ...input.items.map((item) => ({
      lineId: item.id,
      ingredient: item.ingredient,
      processScope: 'BASE_FORMULATION' as const,
    })),
    ...toppings.map((item) => ({
      lineId: item.id,
      ingredient: item.ingredient,
      processScope: 'POST_PROCESS_ADDON' as const,
    })),
  ];

  return Object.fromEntries(
    rows.map((row) => {
      const label = isCatalogLabelToppingIngredient(row.ingredient) ? row.ingredient : null;
      const engine = label ? null : (row.ingredient as EngineIngredient);
      const canonicalId = row.ingredient.canonical_ingredient_id ?? row.ingredient.id;
      const eligibility = Object.fromEntries(
        MODULES.map((module) => [
          module,
          row.processScope === 'POST_PROCESS_ADDON' && module !== 'SEARCH' && module !== 'COST'
            ? 'label_only'
            : 'eligible',
        ]),
      ) as ProductBehaviorSnapshot['moduleEligibility'];
      const snapshot: ProductBehaviorSnapshot = {
        schemaVersion: 1,
        resolutionState: 'RESOLVED',
        lineId: row.lineId,
        productId: `product:${canonicalId}`,
        productVersionId: `version:${canonicalId}`,
        source: row.processScope === 'BASE_FORMULATION' ? 'mapper' : 'catalog_import',
        factsFingerprint: `facts:${canonicalId}`,
        behaviorBindingId: `binding:${canonicalId}`,
        behaviorBindingVersion: 'test-v1',
        taxonomyVersion: 'test-taxonomy-v1',
        familyId: null,
        subfamilyId: null,
        formId: null,
        verificationState: 'verified',
        technicalAuthority: engine ? 'mapper_exact' : 'none',
        mapperIngredientId: engine ? canonicalId : null,
        mainClassification: 'STANDARD_ONLY',
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
        moduleEligibility: eligibility,
        processScope: row.processScope,
        resolutionContext: null,
        resolverVersion: 'test-resolver-v1',
        sharedFacts: {
          schemaVersion: 1,
          technicalComposition: engine ? technicalForEngine(engine) : null,
          nutritionPer100g:
            label?.label_nutrition_per_100g ?? (engine ? nutritionForEngine(engine) : null),
          allergens: {
            ingredientsText: label?.ingredients_text ?? row.ingredient.name,
            allergensText: label?.allergens_text ?? '',
            declared: [],
            mayContain: [],
            evidenceVersion: `allergen:${canonicalId}`,
          },
          processEvidence:
            row.processScope === 'BASE_FORMULATION'
              ? [
                  {
                    decision: 'cold_process_approved',
                    reasonType: 'process_requirement',
                    affectedIngredientIds: [canonicalId],
                    explanation: 'Complete test-only frozen process authority.',
                    source: {
                      id: `process:${canonicalId}`,
                      label: 'Test process authority',
                      reference: 'test-process-v1',
                      verificationStatus: 'verified',
                    },
                  },
                ]
              : [],
          profileEligibility: [input.category],
          veganEligibility: 'unknown',
          proteinBehavior: 'unknown',
          referencePrice: null,
        },
        warnings: [],
        blockReasons: [],
      };
      return [row.lineId, snapshot];
    }),
  );
}
