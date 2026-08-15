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
import {
  attachRecipeProfileMetadata,
} from '@/features/pro-workbench/recipeProfilePersistence';
import { DEFAULT_DIRECTION_TARGETS } from '@/features/pro-workbench/recipeProfileStore';
import type {
  RecipeCompositionMetadata,
  RecipeToppingItem,
} from '@/features/recipe-composition/recipeCompositionPersistence';
import { getEngineApprovedIngredientById } from '@/services/ingredients';
import {
  resolveProductBehaviorForSelection,
  type ProductBehaviorEntity,
} from '@/services/productIntelligence';
import { useRecipeStore } from '@/stores/recipeStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { useMasterLabelStore } from '@/features/master-label/masterLabelStore';

export type ExecutableRecipeHandoffFailureCode =
  | 'template_not_found'
  | 'template_blocked'
  | 'ingredient_unavailable'
  | 'behavior_unavailable'
  | 'behavior_blocked'
  | 'engine_gate_failed';

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
}

export interface MaterializeDependencies {
  getIngredient: (mapperIngredientId: string) => Promise<IngredientRow | null>;
  resolveBehavior: (input: {
    entity: ProductBehaviorEntity;
    context: Parameters<typeof resolveProductBehaviorForSelection>[0]['context'];
  }) => Promise<ServerResolvedProductBehavior | null>;
}

const runtimeDependencies: MaterializeDependencies = {
  getIngredient: getEngineApprovedIngredientById,
  resolveBehavior: resolveProductBehaviorForSelection,
};

const effectiveIngredientCost = (
  ingredient: EngineIngredient,
  resolved: ServerResolvedProductBehavior,
): EngineIngredient => {
  const privatePrice = resolved.privateOverlay?.privatePricePerKg;
  const privateCurrency = resolved.privateOverlay?.privatePriceCurrency?.trim() || null;
  if (
    typeof privatePrice === 'number' && Number.isFinite(privatePrice) && privatePrice >= 0 &&
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
      `Brak aktualnego zatwierdzonego produktu ${line.mapperIngredientId}.`,
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
      requestedRole: line.role === 'main' ? 'MAIN' : 'STANDARD',
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
  if (resolved.state !== 'eligible') {
    throw new ExecutableRecipeHandoffError(
      'behavior_blocked',
      resolved.blockReasons.join(', ') || `Produkt ${line.mapperIngredientId} jest zablokowany.`,
      line.lineId,
    );
  }
  const snapshot = snapshotServerResolvedProductBehavior({
    lineId: line.lineId,
    processScope: line.processScope,
    resolved,
  });
  if (line.role === 'main' && snapshot.moduleEligibility.MAIN !== 'eligible') {
    throw new ExecutableRecipeHandoffError(
      'behavior_blocked',
      `Brak aktualnej polityki Main dla ${line.mapperIngredientId}.`,
      line.lineId,
    );
  }
  const sharedFacts = snapshot.sharedFacts;
  const requiredFactModules = ['NUTRITION', 'ALLERGENS', 'PROCESS', 'SAVE', 'PRODUCTION'] as const;
  const missingFactModules = requiredFactModules.filter(
    (module) => snapshot.moduleEligibility[module] !== 'eligible',
  );
  const hasExactProcessEvidence = sharedFacts?.processEvidence.some((evidence) => (
    evidence.source.verificationStatus === 'verified' &&
    evidence.source.reference.trim().length > 0 &&
    evidence.affectedIngredientIds.includes(line.mapperIngredientId!)
  )) ?? false;
  if (
    missingFactModules.length > 0 ||
    sharedFacts?.nutritionPer100g == null ||
    sharedFacts.allergens == null ||
    !hasExactProcessEvidence
  ) {
    throw new ExecutableRecipeHandoffError(
      'behavior_blocked',
      `Niepełna wersjonowana authority produktu ${line.mapperIngredientId}: ` +
        `moduły ${missingFactModules.join(', ') || 'OK'}, ` +
        `żywienie ${sharedFacts?.nutritionPer100g ? 'OK' : 'brak'}, ` +
        `alergeny ${sharedFacts?.allergens ? 'OK' : 'brak'}, ` +
        `proces ${hasExactProcessEvidence ? 'OK' : 'brak'}.`,
      line.lineId,
    );
  }
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
  if (template.status !== 'EXECUTABLE_OWNER_REVIEW') {
    throw new ExecutableRecipeHandoffError(
      'template_blocked',
      template.blockers.join(' '),
    );
  }
  if (template.processId?.trim() === '') {
    throw new ExecutableRecipeHandoffError(
      'template_blocked',
      'Szablon nie ma dokładnego wersjonowanego procesu.',
    );
  }
  if (template.processId === null) {
    throw new ExecutableRecipeHandoffError(
      'template_blocked',
      'Szablon nie ma dokładnego wersjonowanego procesu.',
    );
  }
  const allLines = [...template.base, ...template.toppings];
  const resolvedEntries = await Promise.all(
    allLines.map(async (line) => [line.lineId, await resolveLine(template, line, accountId, dependencies)] as const),
  );
  const resolvedByLine = new Map(resolvedEntries);
  const baseItems = template.base.map((line) => {
    const resolved = resolvedByLine.get(line.lineId)!;
    return {
      id: line.lineId,
      ingredient: resolved.ingredient,
      planned_grams: line.grams,
      actual_grams: null,
      lock_type: line.role === 'main' ? 'main' as const : 'unlocked' as const,
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
  const toppings: RecipeToppingItem[] = template.toppings.map((line, index) => ({
    id: line.lineId,
    ingredient: resolvedByLine.get(line.lineId)!.ingredient,
    planned_grams: line.grams,
    actual_grams: null,
    process_scope: 'POST_PROCESS_ADDON',
    addon_sort_order: index,
    notes: line.note,
  }));
  const behaviorSnapshots = Object.fromEntries(
    resolvedEntries.map(([lineId, value]) => [lineId, value.snapshot]),
  );
  return {
    template,
    input,
    composition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: template.base.map((line) => line.lineId),
      toppings,
      behaviorSnapshots,
      migrationAmbiguities: [],
    },
  };
}

/** The only mutating library-open seam. Materialization and all fail-closed
 * checks complete first, so a blocked template never destroys the current draft. */
export async function openExecutableRecipeTemplate(
  templateId: string,
  accountId: string,
): Promise<MaterializedExecutableRecipe> {
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
  useMasterLabelStore.getState().clear();
  return materialized;
}
