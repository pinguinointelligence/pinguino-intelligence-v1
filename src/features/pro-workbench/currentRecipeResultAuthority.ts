import type { RecipeInput } from '@/engine';
import {
  buildRecipeBehaviorAuthority,
  productBehaviorSnapshotFingerprint,
  recipeBehaviorModuleGate,
  type ProductBehaviorModule,
  type ProductBehaviorModuleGate,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import { practicalRecipeInputFingerprint } from '@/features/practical-recipe/practicalRecipe';

export const CURRENT_RECIPE_RESULT_MODULES = [
  'MONITOR',
  'NUTRITION',
  'COST',
  'SUMMARY',
] as const satisfies readonly ProductBehaviorModule[];

type CurrentRecipeResultModule = (typeof CURRENT_RECIPE_RESULT_MODULES)[number];

export interface CurrentRecipeResultAuthorityInput {
  recipe: RecipeInput;
  toppings: readonly RecipeToppingItem[];
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  draftRevision: number;
  awaitingRecalculation: boolean;
  loading: boolean;
}

export interface CurrentRecipeResultAuthority {
  state: 'CURRENT' | 'STALE' | 'LOADING';
  ready: boolean;
  draftRevision: number;
  recipeFingerprint: string;
  behaviorFingerprint: string;
  resultReference: string;
  moduleGates: Record<CurrentRecipeResultModule, ProductBehaviorModuleGate>;
  blockedModules: CurrentRecipeResultModule[];
  blockedLineIds: string[];
}

/**
 * One derived publication boundary for every customer-visible value that is
 * called "current". It owns no recipe math and stores no copied result: all
 * consumers still calculate from the canonical Recipe input and its exact
 * frozen ProductBehavior set, but none may publish until this shared identity
 * is current for Monitor, Nutrition, Cost and Summary together.
 */
export function buildCurrentRecipeResultAuthority(
  input: CurrentRecipeResultAuthorityInput,
): CurrentRecipeResultAuthority {
  const authority = buildRecipeBehaviorAuthority({
    items: input.recipe.items,
    toppings: input.toppings,
    snapshots: input.snapshots,
  });
  const moduleGates = Object.fromEntries(
    CURRENT_RECIPE_RESULT_MODULES.map((module) => [
      module,
      recipeBehaviorModuleGate(authority, module),
    ]),
  ) as Record<CurrentRecipeResultModule, ProductBehaviorModuleGate>;
  const blockedModules = CURRENT_RECIPE_RESULT_MODULES.filter(
    (module) => !moduleGates[module].ready,
  );
  const blockedLineIds = [
    ...new Set(blockedModules.flatMap((module) => moduleGates[module].blockedLineIds)),
  ].sort();
  const recipeFingerprint = practicalRecipeInputFingerprint(input.recipe);
  const requiredLineIds = new Set(authority.requiredLineIds);
  const behaviorFingerprint = productBehaviorSnapshotFingerprint(
    Object.fromEntries(
      Object.entries(input.snapshots).filter(([lineId]) => requiredLineIds.has(lineId)),
    ),
  );
  const resultReference = JSON.stringify({
    draftRevision: input.draftRevision,
    recipeFingerprint,
    behaviorFingerprint,
  });
  const ready = !input.awaitingRecalculation && blockedModules.length === 0;
  return {
    state: ready ? 'CURRENT' : input.loading ? 'LOADING' : 'STALE',
    ready,
    draftRevision: input.draftRevision,
    recipeFingerprint,
    behaviorFingerprint,
    resultReference,
    moduleGates,
    blockedModules,
    blockedLineIds,
  };
}
