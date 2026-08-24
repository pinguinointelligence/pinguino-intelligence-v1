import {
  calculateRecipe,
  detectViolations,
  type EngineIngredient,
  type RecipeInput,
} from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import {
  executableRecipeTemplateById,
  type ExecutableRecipeLineSeed,
  type ExecutableRecipeTemplate,
} from '@/data/recipes/executableRecipeLibrary';
import {
  snapshotServerResolvedProductBehavior,
  type ProductBehaviorSnapshot,
  type ServerResolvedProductBehavior,
} from '@/features/product-intelligence';
import { attachRecipeProfileMetadata } from '@/features/pro-workbench/recipeProfilePersistence';
import { DEFAULT_DIRECTION_TARGETS } from '@/features/pro-workbench/recipeProfileStore';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { getEngineApprovedIngredientById } from '@/services/ingredients';
import {
  productBehaviorBlockedMessage,
  resolveProductBehaviorForSelection,
  type ProductBehaviorEntity,
} from '@/services/productIntelligence';
import { useRecipeStore } from '@/stores/recipeStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { currentUserHasOwnerReviewAccess } from '@/services/ownerReviewAccess';
import { hasUnsavedProRecipeChanges } from '@/pages/destinations/startNewProRecipe';

export type ExecutableRecipeHandoffFailureCode =
  | 'template_not_found'
  | 'template_blocked'
  | 'ingredient_unavailable'
  | 'behavior_unavailable'
  | 'behavior_blocked'
  | 'engine_gate_failed'
  | 'owner_review_forbidden'
  | 'unsaved_changes';

export class ExecutableRecipeHandoffError extends Error {
  constructor(
    readonly code: ExecutableRecipeHandoffFailureCode,
    message: string,
    readonly lineId: string | null = null,
  ) {
    super(message);
    this.name = 'ExecutableRecipeHandoffError';
  }
}

export interface MaterializedExecutableRecipe {
  template: ExecutableRecipeTemplate;
  input: RecipeInput;
  composition: RecipeCompositionMetadata;
  /** Toppings are intentionally outside editable Base review until the
   * production and label gates are complete. */
  omittedOwnerReviewToppingLineIds: readonly string[];
}

export interface MaterializeDependencies {
  getIngredient: (mapperIngredientId: string) => Promise<IngredientRow | null>;
  resolveBehavior: (input: {
    entity: ProductBehaviorEntity;
    context: Parameters<typeof resolveProductBehaviorForSelection>[0]['context'];
  }) => Promise<ServerResolvedProductBehavior | null>;
}

export interface OpenExecutableRecipeDependencies {
  authorizeOwnerReview: (accountId: string) => Promise<boolean>;
  hasUnsavedChanges: () => boolean;
}

const runtimeOpenDependencies: OpenExecutableRecipeDependencies = {
  authorizeOwnerReview: currentUserHasOwnerReviewAccess,
  hasUnsavedChanges: hasUnsavedProRecipeChanges,
};

const runtimeDependencies: MaterializeDependencies = {
  getIngredient: getEngineApprovedIngredientById,
  resolveBehavior: resolveProductBehaviorForSelection,
};

const REQUIRED_OWNER_REVIEW_COMPOSITION_FIELDS = [
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'salt_percent',
  'pod_value',
  'pac_value',
] as const satisfies readonly (keyof IngredientRow)[];

const ownerReviewCompositionMissing = (row: IngredientRow): string[] =>
  REQUIRED_OWNER_REVIEW_COMPOSITION_FIELDS.filter((field) => {
    const value = row[field];
    return typeof value !== 'number' || !Number.isFinite(value);
  });

const effectiveIngredientCost = (
  ingredient: EngineIngredient,
  resolved: ServerResolvedProductBehavior,
): EngineIngredient => {
  const privatePrice = resolved.privateOverlay?.privatePricePerKg;
  const privateCurrency = resolved.privateOverlay?.privatePriceCurrency?.trim() || null;
  if (
    typeof privatePrice === 'number' &&
    Number.isFinite(privatePrice) &&
    privatePrice >= 0 &&
    privateCurrency !== null
  ) {
    return {
      ...ingredient,
      cost_per_kg: privatePrice,
      cost_currency: privateCurrency,
      cost_source: 'private',
    };
  }
  const reference = resolved.sharedFacts?.referencePrice;
  if (reference && Number.isFinite(reference.pricePerKg) && reference.pricePerKg >= 0) {
    return {
      ...ingredient,
      cost_per_kg: reference.pricePerKg,
      cost_currency: reference.currency,
      cost_source: 'reference',
    };
  }
  return {
    ...ingredient,
    cost_source: ingredient.cost_per_kg === null ? null : 'reference',
  };
};

async function resolveLine(
  template: ExecutableRecipeTemplate,
  line: ExecutableRecipeLineSeed,
  accountId: string,
  dependencies: MaterializeDependencies,
): Promise<{ ingredient: EngineIngredient; snapshot: ProductBehaviorSnapshot }> {
  if (line.mapperIngredientId === null) {
    throw new ExecutableRecipeHandoffError(
      'ingredient_unavailable',
      `Brak dokładnego produktu: ${line.requiredProductForm ?? line.note}.`,
      line.lineId,
    );
  }
  const row = await dependencies.getIngredient(line.mapperIngredientId);
  if (!row) {
    throw new ExecutableRecipeHandoffError(
      'ingredient_unavailable',
      `Brak aktualnego produktu ${line.mapperIngredientId}.`,
      line.lineId,
    );
  }
  const missingComposition = ownerReviewCompositionMissing(row);
  if (!row.approved_for_base || !row.approved_for_engines || missingComposition.length > 0) {
    throw new ExecutableRecipeHandoffError(
      'behavior_blocked',
      `Niepełna kompozycja techniczna Base ${line.mapperIngredientId}: ` +
        `${
          missingComposition.join(', ') ||
          (!row.approved_for_base ? 'approved_for_base=false' : 'approved_for_engines=false')
        }.`,
      line.lineId,
    );
  }
  const resolved = await dependencies.resolveBehavior({
    entity: { entityKind: 'mapper', entityId: line.mapperIngredientId },
    context: {
      accountId,
      productProfile: template.profile,
      temperatureC: template.targetTemperatureC,
      mode: template.formulationStrategy,
      processScope: line.processScope,
      // Owner Review preserves the visible Main lock but checks only the fixed
      // technical Base vector. Automatic Main authority remains unavailable
      // until an exact policy is published.
      requestedRole: 'STANDARD',
      module: line.processScope === 'BASE_FORMULATION' ? 'BASE_RECIPE' : 'TOPPING',
    },
  });
  if (!resolved) {
    throw new ExecutableRecipeHandoffError(
      'behavior_unavailable',
      `Resolver nie zwrócił wersji produktu ${line.mapperIngredientId}.`,
      line.lineId,
    );
  }
  const requiredModule = line.processScope === 'BASE_FORMULATION' ? 'BASE_RECIPE' : 'TOPPING';
  if (resolved.state === 'blocked' || resolved.moduleEligibility[requiredModule] === 'blocked') {
    throw new ExecutableRecipeHandoffError(
      'behavior_blocked',
      `ProductBehavior zablokował ${line.mapperIngredientId} w module ${requiredModule}: ` +
        productBehaviorBlockedMessage(resolved),
      line.lineId,
    );
  }
  const resolvedSnapshot = snapshotServerResolvedProductBehavior({
    lineId: line.lineId,
    processScope: line.processScope,
    resolved,
  });
  // Owner Review never elevates resolver eligibility. It adds a restrictive
  // overlay for the downstream modules that require the omitted Toppings,
  // final process and legal facts; Base/PI eligibility remains exactly as the
  // server resolved it.
  const snapshot: ProductBehaviorSnapshot = {
    ...resolvedSnapshot,
    moduleEligibility: {
      ...resolvedSnapshot.moduleEligibility,
      PRODUCTION: 'blocked',
      PROCESS: 'blocked',
      LABEL: 'blocked',
      MASTER_LABEL: 'blocked',
      EXPORT: 'blocked',
    },
    warnings: [...resolvedSnapshot.warnings, 'owner_review_only'],
    blockReasons: [...resolvedSnapshot.blockReasons, 'owner_review_production_label_gate'],
  };
  return {
    ingredient: effectiveIngredientCost(ingredientRowToEngineIngredient(row), resolved),
    snapshot,
  };
}

export async function materializeExecutableRecipeTemplate(
  templateId: string,
  accountId: string,
  dependencies: MaterializeDependencies = runtimeDependencies,
): Promise<MaterializedExecutableRecipe> {
  const template = executableRecipeTemplateById(templateId);
  if (!template) {
    throw new ExecutableRecipeHandoffError('template_not_found', 'Nie znaleziono wersji szablonu.');
  }
  return materializeExecutableRecipeDefinition(template, accountId, dependencies);
}

/** Pure definition seam used by the registry handoff and its synthetic
 * success-path contract test. Live callers still resolve only registered IDs. */
export async function materializeExecutableRecipeDefinition(
  template: ExecutableRecipeTemplate,
  accountId: string,
  dependencies: MaterializeDependencies = runtimeDependencies,
): Promise<MaterializedExecutableRecipe> {
  if (template.status !== 'OWNER_REVIEW_EDITABLE') {
    throw new ExecutableRecipeHandoffError('template_blocked', template.blockers.join(' '));
  }
  if (template.base.some((line) => line.mapperIngredientId === null || line.grams === null)) {
    throw new ExecutableRecipeHandoffError(
      'template_blocked',
      'Szablon nie ma kompletnego dokładnego wektora Base.',
    );
  }
  const exactBase = template.base as readonly (ExecutableRecipeLineSeed & {
    mapperIngredientId: string;
    grams: number;
  })[];
  const resolvedEntries = await Promise.all(
    exactBase.map(
      async (line) =>
        [line.lineId, await resolveLine(template, line, accountId, dependencies)] as const,
    ),
  );
  const resolvedByLine = new Map(resolvedEntries);
  const baseItems = exactBase.map((line) => {
    const resolved = resolvedByLine.get(line.lineId)!;
    return {
      id: line.lineId,
      ingredient: resolved.ingredient,
      planned_grams: line.grams,
      actual_grams: null,
      lock_type: line.role === 'main' ? ('main' as const) : ('unlocked' as const),
      ...(line.mainRatioWeight === null ? {} : { main_ratio_weight: line.mainRatioWeight }),
      // USER-INTENT BASELINE ON IMPORT (owner GLOBAL SOFT-HOLD §1/§26).
      //
      // Adopting a library recipe is the user saying „this is my recipe at
      // these amounts" — exactly like typing the grams in by hand. Without
      // this the imported lines carry no baseline at all, so the solver would
      // treat every one of them as a disposable PI-added support line and
      // could reduce a defining ingredient to a trace amount.
      //
      // Main lines are deliberately included as ordinary items here: the Main
      // contract owns them and the soft-hold authority excludes them anyway
      // (§20), so the sidecar is inert on those rows.
      ...(line.grams > 0 ? { user_intent_anchor_grams: line.grams } : {}),
      notes: line.note,
    };
  });
  const rawInput: RecipeInput = {
    mode: 'classic',
    category: template.profile,
    target_temperature_c: template.targetTemperatureC,
    target_batch_grams: template.baseTargetGrams,
    machine_capacity_grams: null,
    goals: {
      formulation_strategy: template.formulationStrategy,
      direction_targets: { ...DEFAULT_DIRECTION_TARGETS },
      direction_targets_active: false,
    },
    items: baseItems,
  };
  const input = attachRecipeProfileMetadata(rawInput, {
    visibleProductType: 'gelato',
    mode: 'classic',
    formulationStrategy: template.formulationStrategy,
    targetBatchGrams: template.baseTargetGrams,
    machineKind: 'professional',
    machineId: null,
    machineLabel: 'Profesjonalna',
    servingModeId: template.servingModeId,
    targetTemperatureC: template.targetTemperatureC,
    machineCapacityGrams: null,
    directionTargets: { ...DEFAULT_DIRECTION_TARGETS },
  });
  const result = calculateRecipe(input);
  const violations = detectViolations(result);
  if (result.total_batch_g !== template.baseTargetGrams || violations.length > 0) {
    throw new ExecutableRecipeHandoffError(
      'engine_gate_failed',
      `Szablon nie przeszedł Engine: ${violations.map((violation) => violation.reason).join(', ') || 'masa Base'}.`,
    );
  }
  const behaviorSnapshots = Object.fromEntries(
    resolvedEntries.map(([lineId, value]) => [lineId, value.snapshot]),
  );
  return {
    template,
    input,
    composition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: exactBase.map((line) => line.lineId),
      toppings: [],
      behaviorSnapshots,
      ownerReviewGate: {
        status: 'OWNER_REVIEW_EDITABLE',
        productionStatus: 'PRODUCTION_BLOCKED',
        labelStatus: 'LABEL_BLOCKED',
        authorityId: template.id,
        authorityVersion: template.version,
        omittedToppingLineIds: template.toppings.map((line) => line.lineId),
        technicalOnlyMainLineIds: template.base
          .filter((line) => line.role === 'main')
          .map((line) => line.lineId),
      },
      migrationAmbiguities: [],
    },
    omittedOwnerReviewToppingLineIds: template.toppings.map((line) => line.lineId),
  };
}

/** The only mutating library-open seam. Materialization and all fail-closed
 * checks complete first, so a blocked template never destroys the current draft. */
export async function openExecutableRecipeTemplate(
  templateId: string,
  accountId: string,
  openDependencies: OpenExecutableRecipeDependencies = runtimeOpenDependencies,
): Promise<MaterializedExecutableRecipe> {
  if (!(await openDependencies.authorizeOwnerReview(accountId))) {
    throw new ExecutableRecipeHandoffError(
      'owner_review_forbidden',
      'Owner Review wymaga aktywnego uprawnienia administratora.',
    );
  }
  if (openDependencies.hasUnsavedChanges()) {
    throw new ExecutableRecipeHandoffError(
      'unsaved_changes',
      'Bieżąca receptura ma niezapisane zmiany. Potwierdź ich odrzucenie przed otwarciem szablonu.',
    );
  }
  const materialized = await materializeExecutableRecipeTemplate(templateId, accountId);
  useRecipeStore.getState().loadRecipeInput(materialized.input, {
    savedId: null,
    savedName: materialized.template.displayName,
    versionNumber: null,
    versionDate: null,
    composition: materialized.composition,
  });
  useConstraintStudioStore.getState().resetDraftSession();
  useConstraintStudioStore.setState({ proCoreRecipeId: null, lastSavedVersion: null });
  useProductionSessionStore.getState().clear();
  return materialized;
}
