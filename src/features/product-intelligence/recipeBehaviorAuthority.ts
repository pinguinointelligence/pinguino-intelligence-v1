import type { RecipeInput } from '@/engine';
import type { RecipeProcessEvidence } from '@/features/education/processClassification';
import type {
  RecipeCompositionMetadata,
  RecipeToppingItem,
} from '@/features/recipe-composition/recipeCompositionPersistence';
import { isCatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import type {
  ProductBehaviorModule,
  ProductBehaviorSnapshot,
  PrivateProductBehaviorOverlay,
  ProductAllergenFacts,
  ProductNutritionFactsPer100g,
  SharedProductBehaviorFacts,
} from './contracts';
import {
  productBehaviorModuleGate,
  productBehaviorRequiredLineIds,
  type ProductBehaviorModuleGate,
} from './productBehaviorAccess';
import { productBehaviorSnapshotFingerprint } from './productBehaviorResolver';

export interface RecipeBehaviorAuthority {
  requiredLineIds: string[];
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  missingLineIds: string[];
  revalidationRequiredLineIds: string[];
  fingerprint: string;
}

export interface RecipeBehaviorAuthorityInput {
  items: RecipeInput['items'];
  toppings?: readonly RecipeToppingItem[];
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
}

export function buildRecipeBehaviorAuthority(
  input: RecipeBehaviorAuthorityInput,
): RecipeBehaviorAuthority {
  const requiredLineIds = productBehaviorRequiredLineIds({
    items: input.items,
    toppings: input.toppings,
  });
  return {
    requiredLineIds,
    snapshots: input.snapshots,
    missingLineIds: requiredLineIds.filter((lineId) => input.snapshots[lineId] === undefined),
    revalidationRequiredLineIds: requiredLineIds.filter(
      (lineId) => input.snapshots[lineId]?.resolutionState === 'REVALIDATION_REQUIRED',
    ),
    fingerprint: productBehaviorSnapshotFingerprint(input.snapshots),
  };
}

/** Read-only historical inspection is explicit. A fresh/partial draft with no
 * snapshots is not legacy merely because its authority is missing. */
export function recipeBehaviorLegacyInspection(
  authority: RecipeBehaviorAuthority,
  savedRecipeId: string | null,
): boolean {
  if (authority.requiredLineIds.length === 0) return false;
  if (
    authority.requiredLineIds.some(
      (lineId) => authority.snapshots[lineId]?.resolutionState === 'LEGACY_RECONSTRUCTED',
    )
  )
    return true;
  return (
    savedRecipeId !== null &&
    authority.requiredLineIds.every((lineId) => authority.snapshots[lineId] === undefined)
  );
}

type FactsRequirement = 'technical' | 'nutrition' | 'allergens' | 'process';

const FACT_REQUIREMENTS: Partial<Record<ProductBehaviorModule, readonly FactsRequirement[]>> = {
  MONITOR: ['technical'],
  SUMMARY: ['technical', 'nutrition'],
  NUTRITION: ['nutrition'],
  ALLERGENS: ['allergens'],
  PROCESS: ['process'],
  LABEL: ['nutrition', 'allergens'],
  MASTER_LABEL: ['nutrition', 'allergens'],
  EXPORT: ['nutrition', 'allergens'],
};

const REQUIRED_TECHNICAL_FACTS = [
  'water',
  'totalSolids',
  'fat',
  'protein',
  'carbohydrate',
  'sugars',
  'sucrose',
  'glucose',
  'dextrose',
  'fructose',
  'lactose',
  'polyols',
  'fibre',
  'salt',
  'alcohol',
  'energyKcal',
] as const;

const REQUIRED_NUTRITION_FACTS = ['energyKcal', 'fat', 'carbohydrate', 'protein', 'salt'] as const;

const hasFiniteRequiredFacts = (facts: object, keys: readonly string[]): boolean =>
  keys.every((key) => {
    const value = (facts as Readonly<Record<string, unknown>>)[key];
    return typeof value === 'number' && Number.isFinite(value);
  });

function missingFacts(
  facts: SharedProductBehaviorFacts | null | undefined,
  requirement: FactsRequirement,
): boolean {
  if (!facts) return true;
  switch (requirement) {
    case 'technical':
      return (
        facts.technicalComposition === null ||
        !hasFiniteRequiredFacts(facts.technicalComposition, REQUIRED_TECHNICAL_FACTS)
      );
    case 'nutrition':
      return (
        facts.nutritionPer100g === null ||
        !hasFiniteRequiredFacts(facts.nutritionPer100g, REQUIRED_NUTRITION_FACTS)
      );
    case 'allergens':
      return facts.allergens === null;
    case 'process':
      return facts.processEvidence.length === 0;
  }
}

/** Recipe-wide module boundary. Besides eligibility, modules that render
 * product facts require those facts to be frozen in the exact version snapshot.
 * Technical composition belongs only to BASE_FORMULATION. Label-only toppings
 * remain eligible for Summary/Nutrition without invented Engine composition. */
export function recipeBehaviorModuleGate(
  authority: RecipeBehaviorAuthority,
  module: ProductBehaviorModule,
): ProductBehaviorModuleGate {
  const eligibility = productBehaviorModuleGate(
    authority.snapshots,
    module,
    authority.requiredLineIds,
  );
  const requirements = FACT_REQUIREMENTS[module] ?? [];
  if (!eligibility.ready || requirements.length === 0) return eligibility;

  const missing = authority.requiredLineIds.filter((lineId) => {
    const snapshot = authority.snapshots[lineId];
    if (!snapshot) return true;
    return requirements.some((requirement) =>
      requirement === 'technical' && snapshot.processScope === 'POST_PROCESS_ADDON'
        ? false
        : missingFacts(snapshot.sharedFacts, requirement),
    );
  });
  return missing.length === 0
    ? eligibility
    : {
        ready: false,
        blockedLineIds: missing,
        reason: `Brak zamrożonych danych ${module} dla: ${missing.join(', ')}.`,
      };
}

export function frozenProcessEvidence(authority: RecipeBehaviorAuthority): {
  complete: boolean;
  evidence: RecipeProcessEvidence[];
} {
  const baseIds = authority.requiredLineIds.filter(
    (lineId) => authority.snapshots[lineId]?.processScope !== 'POST_PROCESS_ADDON',
  );
  const complete = baseIds.every((lineId) => {
    const facts = authority.snapshots[lineId]?.sharedFacts;
    return facts !== null && facts !== undefined && facts.processEvidence.length > 0;
  });
  return {
    complete,
    evidence: complete
      ? baseIds.flatMap((lineId) => authority.snapshots[lineId]?.sharedFacts?.processEvidence ?? [])
      : [],
  };
}

export function frozenTechnicalComposition(
  authority: RecipeBehaviorAuthority,
  lineId: string,
): Readonly<Record<string, number | null>> | null {
  return authority.snapshots[lineId]?.sharedFacts?.technicalComposition ?? null;
}

export function frozenNutritionFacts(
  authority: RecipeBehaviorAuthority,
  lineId: string,
): ProductNutritionFactsPer100g | null {
  return authority.snapshots[lineId]?.sharedFacts?.nutritionPer100g ?? null;
}

export function frozenAllergenFacts(
  authority: RecipeBehaviorAuthority,
  lineId: string,
): ProductAllergenFacts | null {
  return authority.snapshots[lineId]?.sharedFacts?.allergens ?? null;
}

const TECHNICAL_TO_INGREDIENT = {
  water: 'water_percent',
  totalSolids: 'solids_percent',
  fat: 'fat_percent',
  saturatedFat: 'saturated_fat_percent',
  protein: 'protein_percent',
  carbohydrate: 'carbohydrate_percent',
  sugars: 'sugar_percent',
  sucrose: 'sucrose_percent',
  glucose: 'glucose_percent',
  dextrose: 'dextrose_percent',
  fructose: 'fructose_percent',
  lactose: 'lactose_percent',
  polyols: 'polyol_percent',
  fibre: 'fiber_percent',
  salt: 'salt_percent',
  alcohol: 'alcohol_percent',
  energyKcal: 'kcal_per_100g',
} as const;

const projectCompositionValue = (
  composition: RecipeInput['items'][number]['ingredient']['composition'],
  key: keyof typeof composition,
  value: number | null | undefined,
): void => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    composition[key] = value;
  } else {
    Reflect.deleteProperty(composition, key);
  }
};

/** Rebuilds the module input from immutable shared facts. It changes no Engine
 * formula; it only prevents downstream views from re-reading mutable product
 * objects after the exact version was resolved. Missing/null frozen values
 * explicitly erase old mutable values instead of inheriting them. */
export function recipeInputFromFrozenBehavior(
  input: RecipeInput,
  authority: RecipeBehaviorAuthority,
  projection: 'technical' | 'nutrition',
): RecipeInput {
  return {
    ...input,
    items: input.items.map((item) => {
      const snapshot = authority.snapshots[item.id];
      if (!snapshot || snapshot.processScope !== 'BASE_FORMULATION') return item;
      const ingredient = structuredClone(item.ingredient);
      const technical = snapshot.sharedFacts?.technicalComposition;

      if (technical) {
        for (const [source, target] of Object.entries(TECHNICAL_TO_INGREDIENT)) {
          projectCompositionValue(
            ingredient.composition,
            target as keyof typeof ingredient.composition,
            technical[source],
          );
        }
        ingredient.pod_value =
          typeof technical.podValue === 'number' && Number.isFinite(technical.podValue)
            ? technical.podValue
            : null;
        ingredient.pac_value =
          typeof technical.pacValue === 'number' && Number.isFinite(technical.pacValue)
            ? technical.pacValue
            : null;
        ingredient.de_value =
          typeof technical.deValue === 'number' && Number.isFinite(technical.deValue)
            ? technical.deValue
            : null;
      }

      if (projection === 'nutrition') {
        const nutrition = snapshot.sharedFacts?.nutritionPer100g;
        const nutritionProjection = {
          kcal_per_100g: nutrition?.energyKcal,
          fat_percent: nutrition?.fat,
          saturated_fat_percent: nutrition?.saturatedFat,
          carbohydrate_percent: nutrition?.carbohydrate,
          sugar_percent: nutrition?.sugars,
          protein_percent: nutrition?.protein,
          salt_percent: nutrition?.salt,
          fiber_percent: nutrition?.fibre,
        } as const;
        for (const [target, value] of Object.entries(nutritionProjection)) {
          projectCompositionValue(
            ingredient.composition,
            target as keyof typeof ingredient.composition,
            value,
          );
        }
      }

      return { ...item, ingredient };
    }),
  };
}

/** Projects POST_PROCESS_ADDON rows from the same immutable version facts used
 * by Base consumers. This prevents Summary/Production/Master Label from
 * accepting a valid snapshot while calculating from a mutable topping object. */
export function recipeToppingsFromFrozenBehavior(
  toppings: readonly RecipeToppingItem[],
  authority: RecipeBehaviorAuthority,
  projection: 'technical' | 'nutrition',
): RecipeToppingItem[] {
  return toppings.map((item) => {
    const snapshot = authority.snapshots[item.id];
    if (!snapshot || snapshot.processScope !== 'POST_PROCESS_ADDON') return item;
    const ingredient = structuredClone(item.ingredient);

    if (isCatalogLabelToppingIngredient(ingredient)) {
      const nutrition = snapshot.sharedFacts?.nutritionPer100g;
      const allergens = snapshot.sharedFacts?.allergens;
      if (
        !nutrition ||
        !allergens ||
        nutrition.energyKcal === null ||
        nutrition.fat === null ||
        nutrition.carbohydrate === null ||
        nutrition.protein === null ||
        nutrition.salt === null
      ) {
        throw new Error(`Frozen label authority is incomplete for ${item.id}.`);
      }
      ingredient.label_nutrition_per_100g = {
        basis: 'per_100g',
        energyKcal: nutrition.energyKcal,
        fat: nutrition.fat,
        saturatedFat: nutrition.saturatedFat,
        carbohydrate: nutrition.carbohydrate,
        sugars: nutrition.sugars,
        protein: nutrition.protein,
        salt: nutrition.salt,
        fibre: nutrition.fibre,
      };
      ingredient.ingredients_text = allergens.ingredientsText ?? '';
      ingredient.allergens_text = allergens.allergensText ?? '';
      return { ...item, ingredient };
    }

    const technical = snapshot.sharedFacts?.technicalComposition;
    if (technical) {
      for (const [source, target] of Object.entries(TECHNICAL_TO_INGREDIENT)) {
        projectCompositionValue(
          ingredient.composition,
          target as keyof typeof ingredient.composition,
          technical[source],
        );
      }
      ingredient.pod_value = typeof technical.podValue === 'number' ? technical.podValue : null;
      ingredient.pac_value = typeof technical.pacValue === 'number' ? technical.pacValue : null;
      ingredient.de_value = typeof technical.deValue === 'number' ? technical.deValue : null;
    }
    if (projection === 'nutrition') {
      const nutrition = snapshot.sharedFacts?.nutritionPer100g;
      const nutritionProjection = {
        kcal_per_100g: nutrition?.energyKcal,
        fat_percent: nutrition?.fat,
        saturated_fat_percent: nutrition?.saturatedFat,
        carbohydrate_percent: nutrition?.carbohydrate,
        sugar_percent: nutrition?.sugars,
        protein_percent: nutrition?.protein,
        salt_percent: nutrition?.salt,
        fiber_percent: nutrition?.fibre,
      } as const;
      for (const [target, value] of Object.entries(nutritionProjection)) {
        projectCompositionValue(
          ingredient.composition,
          target as keyof typeof ingredient.composition,
          value,
        );
      }
    }
    return { ...item, ingredient };
  });
}

export type ProductCostProjection =
  | { state: 'known'; pricePerKg: number; currency: string; source: 'private' | 'reference' }
  | { state: 'missing'; pricePerKg: null; currency: null; source: 'missing' };

/** The private overlay wins without ever entering the immutable shared
 * snapshot. A missing price remains missing and is never treated as zero. */
export function resolveProductCostProjection(
  snapshot: ProductBehaviorSnapshot,
  overlay: PrivateProductBehaviorOverlay | null | undefined,
): ProductCostProjection {
  if (
    overlay?.privatePricePerKg !== null &&
    overlay?.privatePricePerKg !== undefined &&
    Number.isFinite(overlay.privatePricePerKg) &&
    overlay.privatePricePerKg >= 0 &&
    overlay.privatePriceCurrency
  ) {
    return {
      state: 'known',
      pricePerKg: overlay.privatePricePerKg,
      currency: overlay.privatePriceCurrency,
      source: 'private',
    };
  }
  const reference = snapshot.sharedFacts?.referencePrice;
  return reference
    ? {
        state: 'known',
        pricePerKg: reference.pricePerKg,
        currency: reference.currency,
        source: 'reference',
      }
    : { state: 'missing', pricePerKg: null, currency: null, source: 'missing' };
}

export function recipeVersionBehaviorGate(
  input: RecipeInput,
  composition: RecipeCompositionMetadata | null | undefined,
  module: 'RECIPE_VERSION' | 'RESTORE' | 'EXPORT',
): ProductBehaviorModuleGate {
  const authority = buildRecipeBehaviorAuthority({
    items: input.items,
    toppings: composition?.toppings ?? [],
    snapshots: composition?.behaviorSnapshots ?? {},
  });
  return recipeBehaviorModuleGate(authority, module);
}
