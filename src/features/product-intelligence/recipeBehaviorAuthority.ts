import type { RecipeInput } from '@/engine';
import type { RecipeProcessEvidence } from '@/features/education/processClassification';
import type {
  RecipeCompositionMetadata,
  RecipeToppingItem,
} from '@/features/recipe-composition/recipeCompositionPersistence';
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

function missingFacts(
  facts: SharedProductBehaviorFacts | null | undefined,
  requirement: FactsRequirement,
): boolean {
  if (!facts) return true;
  switch (requirement) {
    case 'technical': return facts.technicalComposition === null;
    case 'nutrition': return facts.nutritionPer100g === null;
    case 'allergens': return facts.allergens === null;
    case 'process': return facts.processEvidence.length === 0;
  }
}

/** Recipe-wide module boundary. Besides eligibility, modules that render
 * product facts require those facts to be frozen in the exact version snapshot.
 * Base technical Monitor intentionally ignores POST_PROCESS_ADDON snapshots. */
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
    if (module === 'MONITOR' && snapshot.processScope === 'POST_PROCESS_ADDON') return false;
    return requirements.some((requirement) => missingFacts(snapshot.sharedFacts, requirement));
  });
  return missing.length === 0
    ? eligibility
    : {
        ready: false,
        blockedLineIds: missing,
        reason: `Brak zamrożonych danych ${module} dla: ${missing.join(', ')}.`,
      };
}

export function frozenProcessEvidence(
  authority: RecipeBehaviorAuthority,
): { complete: boolean; evidence: RecipeProcessEvidence[] } {
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
      ? baseIds.flatMap(
          (lineId) => authority.snapshots[lineId]?.sharedFacts?.processEvidence ?? [],
        )
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
