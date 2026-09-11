/**
 * Official Gellatti recipe → working PRO recipe.
 *
 * The official record is the immutable canonical formula. Using it builds a
 * NEW unsaved working draft from a detached copy:
 *
 *   official recipe line → canonical Mapper PI → current market routing
 *   → exact product (PR) when the country resolver returns one → product facts
 *   → current Engine → working recipe instance
 *
 * Nothing here is a second resolver. Market routing is the existing
 * `resolveCountryProductsForSlots` authority (user preference > country
 * default > safe fallback); product selection uses the same exported building
 * blocks, in the same order, as the ingredient picker (ProductPickerPopover):
 * an exact product with its own Engine profile keeps its own composition, an
 * exact product without one borrows the Mapper science while keeping its exact
 * identity, and no route keeps the canonical PI. A similar product is never
 * picked; a line with no confirmed identity (source BRAK) or a scaffold Main
 * blocks the use before anything is resolved, so the current draft survives.
 */
import {
  calculateRecipe,
  type EngineIngredient,
  type RecipeInput,
  type RecipeItem,
} from '@/engine';
import { copy } from '@/copy/en';
import { officialRecipeCopy } from '@/copy/officialRecipeLibrary';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import {
  officialRecipeLineId,
  officialRecipeUseState,
  officialRecipeWorkingCopy,
  officialRecipeWorkingProfile,
  type OfficialRecipe,
  type OfficialRecipeLine,
  type OfficialServingModeId,
} from '@/data/recipes/official/officialRecipeLibrary';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import { mappedCatalogIngredient } from '@/features/global-catalog/catalogIngredient';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import {
  catalogProductHasOwnEngineProfile,
  currentCatalogArticleId,
  engineIngredientForCatalogSelection,
  resolveCurrentMapperCatalogSelection,
} from '@/features/ingredient-builder/mapperOnlyCatalog';
import {
  snapshotServerResolvedProductBehavior,
  type ProductBehaviorSnapshot,
  type ServerResolvedProductBehavior,
} from '@/features/product-intelligence';
import { attachRecipeProfileMetadata } from '@/features/pro-workbench/recipeProfilePersistence';
import { DEFAULT_DIRECTION_TARGETS } from '@/features/pro-workbench/recipeProfileStore';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  gelatoInternalCategory,
  internalCategoryFor,
  visibleTypeOf,
} from '@/features/studio/productType';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { hasUnsavedProRecipeChanges } from '@/pages/destinations/startNewProRecipe';
import { effectiveIngredientCost } from '@/services/executableRecipeHandoff';
import {
  getCatalogMarketPreferences,
  resolveCountryProductsForSlots,
} from '@/services/globalCatalog';
import { getEngineApprovedIngredientById } from '@/services/ingredients';
import {
  resolveProductBehaviorForSelection,
  type ProductBehaviorEntity,
} from '@/services/productIntelligence';
import { useRecipeStore } from '@/stores/recipeStore';

export type OfficialRecipeHandoffFailureCode =
  | 'recipe_not_found'
  | 'unresolved_identity'
  | 'dynamic_main_required'
  | 'ingredient_unavailable'
  | 'behavior_unavailable'
  | 'behavior_blocked'
  | 'mass_mismatch'
  | 'unsaved_changes';

export class OfficialRecipeHandoffError extends Error {
  constructor(
    readonly code: OfficialRecipeHandoffFailureCode,
    message: string,
    readonly lineNumber: number | null = null,
  ) {
    super(message);
    this.name = 'OfficialRecipeHandoffError';
  }
}

type ResolvedCountryProduct = Awaited<ReturnType<typeof resolveCountryProductsForSlots>>[number];

export interface OfficialMaterializeDependencies {
  getIngredient: (mapperIngredientId: string) => Promise<IngredientRow | null>;
  resolveBehavior: (input: {
    entity: ProductBehaviorEntity;
    context: Parameters<typeof resolveProductBehaviorForSelection>[0]['context'];
  }) => Promise<ServerResolvedProductBehavior | null>;
  /** The customer's current product market (ISO-2) or null. */
  marketCountry: () => Promise<string | null>;
  resolveCountryProducts: (input: {
    mapperIngredientIds: readonly string[];
    productCountry: string | null;
    productProfile?: string | null;
  }) => Promise<readonly ResolvedCountryProduct[]>;
  /** The working serving mode when the source does not state a temperature. */
  currentServingModeId: () => string | null;
}

const runtimeDependencies: OfficialMaterializeDependencies = {
  getIngredient: getEngineApprovedIngredientById,
  resolveBehavior: resolveProductBehaviorForSelection,
  marketCountry: async () => (await getCatalogMarketPreferences()).primaryMarket,
  resolveCountryProducts: resolveCountryProductsForSlots,
  currentServingModeId: () => useRecipeStore.getState().servingModeId ?? null,
};

/** How one mapped line was bound to a product. */
export interface OfficialLineResolution {
  readonly lineNumber: number;
  readonly lineId: string;
  readonly mapperIngredientId: string;
  /** The exact market product used for this line, or null (canonical PI). */
  readonly marketProduct: {
    readonly productId: string;
    readonly productCode: string | null;
    readonly displayName: string;
    readonly brand: string | null;
    readonly source: ResolvedCountryProduct['source'];
    readonly country: string | null;
    readonly ownEngineProfile: boolean;
  } | null;
  /** Why a returned exact product was not used (the canonical PI stayed). */
  readonly marketProductRejected: 'mapping_mismatch' | 'not_selectable' | 'behavior_blocked' | null;
}

export interface MaterializedOfficialRecipe {
  /** Detached working copy of the source; the registry is untouched. */
  readonly recipe: OfficialRecipe;
  readonly input: RecipeInput;
  readonly composition: RecipeCompositionMetadata;
  readonly country: string | null;
  readonly countryResolution: 'resolved' | 'unavailable';
  readonly lines: readonly OfficialLineResolution[];
}

const PROFESSIONAL_SERVING_MODES: readonly OfficialServingModeId[] = [
  'temp_minus_11',
  'temp_minus_12',
  'temp_minus_13',
];

const servingModeFor = (stated: OfficialServingModeId | null, current: string | null) => {
  if (stated) return stated;
  return PROFESSIONAL_SERVING_MODES.includes(current as OfficialServingModeId)
    ? (current as OfficialServingModeId)
    : 'temp_minus_11';
};

async function resolveCanonicalLine(
  line: OfficialRecipeLine,
  pi: string,
  row: IngredientRow,
  lineId: string,
  context: Parameters<typeof resolveProductBehaviorForSelection>[0]['context'],
  dependencies: OfficialMaterializeDependencies,
): Promise<{ ingredient: EngineIngredient; snapshot: ProductBehaviorSnapshot }> {
  const resolved = await dependencies.resolveBehavior({
    entity: { entityKind: 'mapper', entityId: pi },
    context,
  });
  if (!resolved) {
    throw new OfficialRecipeHandoffError(
      'behavior_unavailable',
      officialRecipeCopy.errors.behaviorUnavailable(line.label),
      line.line,
    );
  }
  if (resolved.state === 'blocked' || resolved.moduleEligibility.BASE_RECIPE === 'blocked') {
    throw new OfficialRecipeHandoffError(
      'behavior_blocked',
      officialRecipeCopy.errors.ingredientUnavailable(line.label),
      line.line,
    );
  }
  return {
    ingredient: effectiveIngredientCost(ingredientRowToEngineIngredient(row), resolved),
    snapshot: snapshotServerResolvedProductBehavior({
      lineId,
      processScope: 'BASE_FORMULATION',
      resolved,
    }),
  };
}

/** The exact-product path, in the picker's order. Null means „keep the PI". */
async function resolveExactLine(
  exact: CatalogProductSearchHit,
  row: IngredientRow,
  lineId: string,
  context: Parameters<typeof resolveProductBehaviorForSelection>[0]['context'],
  dependencies: OfficialMaterializeDependencies,
): Promise<
  | {
      ok: true;
      ingredient: EngineIngredient;
      snapshot: ProductBehaviorSnapshot;
      ownProfile: boolean;
    }
  | { ok: false; reason: 'not_selectable' | 'behavior_blocked' }
> {
  const ownProfile =
    catalogProductHasOwnEngineProfile(exact) && currentCatalogArticleId(exact, 'BASE') !== null;
  let ingredient: EngineIngredient;
  if (ownProfile) {
    const selection = await resolveCurrentMapperCatalogSelection(
      exact,
      'BASE',
      dependencies.getIngredient,
    );
    if (!selection.ok) return { ok: false, reason: 'not_selectable' };
    const candidate = engineIngredientForCatalogSelection(exact, selection);
    // A label-only topping identity can never enter Base formulation.
    if (candidate === null || 'kind' in candidate) return { ok: false, reason: 'not_selectable' };
    ingredient = candidate;
  } else {
    ingredient = mappedCatalogIngredient(exact, row);
  }
  if (typeof exact.currentVersionId !== 'string' || exact.currentVersionId.trim() === '') {
    return { ok: false, reason: 'not_selectable' };
  }
  const resolved = await dependencies
    .resolveBehavior({
      entity: { entityKind: 'catalog_product_version', entityId: exact.currentVersionId },
      context,
    })
    .catch(() => null);
  if (
    !resolved ||
    resolved.state === 'blocked' ||
    resolved.moduleEligibility.BASE_RECIPE === 'blocked'
  ) {
    return { ok: false, reason: 'behavior_blocked' };
  }
  return {
    ok: true,
    ingredient,
    ownProfile,
    snapshot: snapshotServerResolvedProductBehavior({
      lineId,
      processScope: 'BASE_FORMULATION',
      resolved,
    }),
  };
}

/** Pure materialization: resolves everything first, mutates nothing. */
export async function materializeOfficialRecipe(
  recipeId: string,
  accountId: string,
  dependencies: OfficialMaterializeDependencies = runtimeDependencies,
): Promise<MaterializedOfficialRecipe> {
  const recipe = officialRecipeWorkingCopy(recipeId);
  if (!recipe) {
    throw new OfficialRecipeHandoffError(
      'recipe_not_found',
      officialRecipeCopy.errors.recipeNotFound,
    );
  }
  const useState = officialRecipeUseState(recipe);
  if (useState.kind === 'unresolved_identity') {
    throw new OfficialRecipeHandoffError(
      'unresolved_identity',
      officialRecipeCopy.useBlockedUnresolved(useState.lines.map((line) => line.label)),
      useState.lines[0]!.line,
    );
  }
  if (useState.kind === 'dynamic_main_required') {
    throw new OfficialRecipeHandoffError(
      'dynamic_main_required',
      officialRecipeCopy.useBlockedDynamicMain,
      useState.line.line,
    );
  }
  const mappedLines = recipe.lines.map((line) => {
    if (line.identity.kind !== 'mapped') throw new Error('unreachable: gated above');
    return { line, pi: line.identity.mapperIngredientId };
  });

  const profile = officialRecipeWorkingProfile(recipe);
  const servingModeId = servingModeFor(profile.servingModeId, dependencies.currentServingModeId());
  const temperatureC = temperatureForMode(servingModeId) ?? -11;

  const rows = new Map<string, IngredientRow>();
  for (const pi of new Set(mappedLines.map(({ pi }) => pi))) {
    const row = await dependencies.getIngredient(pi).catch(() => null);
    if (!row) {
      const line = mappedLines.find((entry) => entry.pi === pi)!.line;
      throw new OfficialRecipeHandoffError(
        'ingredient_unavailable',
        officialRecipeCopy.errors.ingredientUnavailable(line.label),
        line.line,
      );
    }
    rows.set(pi, row);
  }

  // The Engine category comes from the existing product-type authority. A
  // Heritage „Gelato / Sorbet" record is classified by the same Gelato
  // derivation the workbench uses (fruit without dairy is a Sorbet).
  const probeItems: RecipeItem[] = mappedLines.map(({ line, pi }) => ({
    id: officialRecipeLineId(recipe, line),
    ingredient: ingredientRowToEngineIngredient(rows.get(pi)!),
    planned_grams: line.grams,
    actual_grams: null,
    lock_type: 'unlocked',
  }));
  const category =
    profile.visibleProductType === null
      ? gelatoInternalCategory(probeItems)
      : internalCategoryFor(profile.visibleProductType, probeItems, 'milk_gelato');
  const visibleProductType = profile.visibleProductType ?? visibleTypeOf(category);

  const country = await dependencies.marketCountry().catch(() => null);
  let countryResolution: MaterializedOfficialRecipe['countryResolution'] = 'resolved';
  let routed: readonly ResolvedCountryProduct[] = [];
  try {
    routed = await dependencies.resolveCountryProducts({
      mapperIngredientIds: [...rows.keys()],
      productCountry: country,
      productProfile: category,
    });
  } catch {
    countryResolution = 'unavailable';
  }
  const routeByPi = new Map(routed.map((entry) => [entry.mapperIngredientId, entry]));

  const context = (lineScope: 'BASE_FORMULATION') => ({
    accountId,
    productProfile: category,
    temperatureC,
    mode: 'optimal' as const,
    processScope: lineScope,
    requestedRole: 'STANDARD' as const,
    module: 'BASE_RECIPE' as const,
  });

  const items: RecipeItem[] = [];
  const snapshots: Record<string, ProductBehaviorSnapshot> = {};
  const resolutions: OfficialLineResolution[] = [];
  for (const { line, pi } of mappedLines) {
    const lineId = officialRecipeLineId(recipe, line);
    const row = rows.get(pi)!;
    const route = routeByPi.get(pi) ?? null;
    let bound: { ingredient: EngineIngredient; snapshot: ProductBehaviorSnapshot } | null = null;
    let marketProduct: OfficialLineResolution['marketProduct'] = null;
    let rejected: OfficialLineResolution['marketProductRejected'] = null;
    if (route) {
      if (route.product.mappedIngredientId !== pi) {
        rejected = 'mapping_mismatch';
      } else {
        const exact = await resolveExactLine(
          route.product,
          row,
          lineId,
          context('BASE_FORMULATION'),
          dependencies,
        );
        if (exact.ok) {
          bound = exact;
          marketProduct = {
            productId: route.product.id,
            productCode: route.product.productCode ?? null,
            displayName: route.product.displayName,
            brand: route.product.brand ?? null,
            source: route.source,
            country: route.country,
            ownEngineProfile: exact.ownProfile,
          };
        } else {
          rejected = exact.reason;
        }
      }
    }
    bound ??= await resolveCanonicalLine(
      line,
      pi,
      row,
      lineId,
      context('BASE_FORMULATION'),
      dependencies,
    );
    snapshots[lineId] = bound.snapshot;
    resolutions.push({
      lineNumber: line.line,
      lineId,
      mapperIngredientId: pi,
      marketProduct,
      marketProductRejected: rejected,
    });
    items.push({
      id: lineId,
      ingredient: bound.ingredient,
      planned_grams: line.grams,
      actual_grams: null,
      lock_type: 'unlocked',
      // Adopting a library recipe is the user's intent at these amounts (the
      // same user-intent baseline the executable library handoff records).
      user_intent_anchor_grams: line.grams,
      notes: line.label,
    });
  }

  const rawInput: RecipeInput = {
    mode: 'classic',
    category,
    target_temperature_c: temperatureC,
    target_batch_grams: recipe.sourceTotalGrams,
    machine_capacity_grams: null,
    goals: {
      formulation_strategy: 'optimal',
      direction_targets: { ...DEFAULT_DIRECTION_TARGETS },
      direction_targets_active: false,
    },
    items,
  };
  const input = attachRecipeProfileMetadata(rawInput, {
    visibleProductType,
    mode: 'classic',
    formulationStrategy: 'optimal',
    targetBatchGrams: recipe.sourceTotalGrams,
    machineKind: 'professional',
    machineId: null,
    machineLabel: copy.proMachine.professionalLabel,
    servingModeId,
    targetTemperatureC: temperatureC,
    machineCapacityGrams: null,
    directionTargets: { ...DEFAULT_DIRECTION_TARGETS },
  });
  // The working instance must carry exactly the source mass. Engine checks
  // and any recalculation belong to the workbench, never to the source.
  if (Math.abs(calculateRecipe(input).total_batch_g - recipe.sourceTotalGrams) > 1e-9) {
    throw new OfficialRecipeHandoffError('mass_mismatch', officialRecipeCopy.errors.massMismatch);
  }
  return {
    recipe,
    input,
    composition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: items.map((item) => item.id),
      toppings: [],
      behaviorSnapshots: snapshots,
      migrationAmbiguities: [],
    },
    country,
    countryResolution,
    lines: resolutions,
  };
}

export interface OpenOfficialRecipeDependencies {
  hasUnsavedChanges: () => boolean;
}

/** The only mutating seam. All checks and resolution finish before the store changes. */
export async function openOfficialRecipe(
  recipeId: string,
  accountId: string,
  openDependencies: OpenOfficialRecipeDependencies = {
    hasUnsavedChanges: hasUnsavedProRecipeChanges,
  },
  dependencies: OfficialMaterializeDependencies = runtimeDependencies,
): Promise<MaterializedOfficialRecipe> {
  if (openDependencies.hasUnsavedChanges()) {
    throw new OfficialRecipeHandoffError(
      'unsaved_changes',
      officialRecipeCopy.errors.unsavedChanges,
    );
  }
  const materialized = await materializeOfficialRecipe(recipeId, accountId, dependencies);
  useRecipeStore.getState().loadRecipeInput(materialized.input, {
    savedId: null,
    savedName: materialized.recipe.name,
    versionNumber: null,
    versionDate: null,
    composition: materialized.composition,
  });
  useConstraintStudioStore.getState().resetDraftSession();
  useConstraintStudioStore.setState({ proCoreRecipeId: null, lastSavedVersion: null });
  useProductionSessionStore.getState().clear();
  return materialized;
}
