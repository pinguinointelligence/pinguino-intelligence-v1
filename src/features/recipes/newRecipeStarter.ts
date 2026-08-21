import {
  calculateRecipe,
  detectViolations,
  type ProductCategory,
  type RecipeInput,
  type RecipeItem,
  type RecipeResult,
} from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { approvedFormulationToolboxIngredients } from '@/features/formulation/formulate';
import {
  selectFormulationTemplate,
  type FormulationTemplate,
} from '@/features/formulation/templateRegistry';
import {
  resolveFunctionalRole,
  type FunctionalRole,
} from '@/features/formulation/ingredientRoles';
import {
  approvedStabilizerDosage,
  stabilizerDosageWindowGrams,
} from '@/features/formulation/stabilizerDosage';
import type { FormulationStrategy } from '@/features/formulation-strategy/strategy';
import {
  effectiveCostForIngredient,
  summarizeEffectiveRecipeCost,
  type CustomerPriceIndex,
} from '@/features/pro-core/effectiveRecipePricing';
import { practicalizeRecipeCandidate } from '@/features/practical-recipe/practicalRecipe';
import { projectGelatoStabilizerSystemToWholeGramPreferred } from '@/features/recipe-constraints/gelatoStabilizerSystemAuthority';
import { projectSorbetStabilizerSystemToWholeGramPreferred } from '@/features/recipe-constraints/sorbetStabilizerSystemAuthority';
import { recipeTechnicalFit } from '@/features/recipe-score/technicalFit';
import type { VisibleProductType } from '@/features/studio/productType';

export type NewRecipeServingModeId =
  | 'temp_minus_11'
  | 'temp_minus_12'
  | 'temp_minus_13'
  | 'fresh';

export const NEW_RECIPE_SERVING_MODES: readonly NewRecipeServingModeId[] = [
  'temp_minus_11',
  'temp_minus_12',
  'temp_minus_13',
  'fresh',
];

export const isNewRecipeServingModeId = (value: string | null | undefined): value is NewRecipeServingModeId =>
  value !== null && value !== undefined && NEW_RECIPE_SERVING_MODES.includes(value as NewRecipeServingModeId);

export const DEFAULT_NEW_RECIPE_PROFILE: VisibleProductType = 'gelato';
export const DEFAULT_NEW_RECIPE_SERVING_MODE: NewRecipeServingModeId = 'temp_minus_12';
export const DEFAULT_NEW_RECIPE_STRATEGY: FormulationStrategy = 'optimal';
export const DEFAULT_NEW_RECIPE_BATCH_G = 1_000;

const STARTER_TEMPERATURE_BY_MODE: Readonly<Record<NewRecipeServingModeId, -11 | -12 | -13>> = {
  temp_minus_11: -11,
  temp_minus_12: -12,
  temp_minus_13: -13,
  fresh: -11,
};

export const starterTemperatureForServingMode = (
  servingModeId: NewRecipeServingModeId,
): -11 | -12 | -13 => STARTER_TEMPERATURE_BY_MODE[servingModeId];

export const starterServingModeForTemperature = (
  temperatureC: number | null | undefined,
): NewRecipeServingModeId => {
  if (temperatureC == null) return DEFAULT_NEW_RECIPE_SERVING_MODE;
  if (temperatureC === -11) return 'temp_minus_11';
  if (temperatureC === -12) return 'temp_minus_12';
  if (temperatureC === -13) return 'temp_minus_13';
  throw new Error(`Unsupported new-recipe starter temperature: ${temperatureC}C.`);
};

const starterCategory = (visible: VisibleProductType): ProductCategory => {
  switch (visible) {
    case 'gelato':
      return 'milk_gelato';
    case 'sorbet':
      return 'sorbet';
    case 'vegan':
      return 'vegan_gelato';
    case 'protein':
      return 'protein_gelato';
  }
};

export interface NewRecipeStarterKey {
  visibleProductType: VisibleProductType;
  servingModeId: NewRecipeServingModeId;
  formulationStrategy: FormulationStrategy;
  targetBatchGrams: number;
}

export interface NewRecipeStarterLine {
  lineId: string;
  role: FunctionalRole;
  canonicalId: string;
  grams: number;
  percent: number;
  effectivePricePerKg: number | null;
  priceSource: 'customer_override' | 'mapper_reference' | 'missing';
  lineCost: number | null;
  wholeGram: boolean;
}

export interface NewRecipeStarterMetrics {
  pod: number | null;
  pac: number | null;
  npac: number | null;
  iceFractionPercent: number | null;
  waterPercent: number | null;
  totalSolidsPercent: number | null;
  fatPercent: number | null;
  proteinPercent: number | null;
  liquidDairyCarrierGrams: number;
  actualProteinPercent: number | null;
  technicalScore: number | null;
  validatedNative: boolean;
  provisional: boolean;
  nativeViolations: readonly {
    metric: string;
    direction: 'low' | 'high';
    value: number | null;
    min: number | null;
    max: number | null;
  }[];
  costPerKg: number | null;
  costComplete: boolean;
  actualBaseMassGrams: number;
  missingMainMassGrams: number;
}

export interface CanonicalNewRecipeStarter extends NewRecipeStarterKey {
  templateId: string;
  templateVersion: string;
  templateApprovalSource: string;
  category: ProductCategory;
  targetTemperatureC: -11 | -12 | -13;
  items: RecipeItem[];
  lines: NewRecipeStarterLine[];
  result: RecipeResult;
  metrics: NewRecipeStarterMetrics;
  wholeGramStatus: 'exact';
  validationStatus:
    | 'engine_validated_native'
    | 'blocked_missing_user_main'
    | 'blocked_engine_native_band_miss'
    | 'blocked_engine_provisional';
  strategyResolution: 'eco_equals_optimal_no_validated_alternative';
}

export interface BuildCanonicalNewRecipeStarterInput {
  visibleProductType: VisibleProductType;
  servingModeId?: NewRecipeServingModeId;
  formulationStrategy?: FormulationStrategy;
  targetBatchGrams?: number;
  /** Compatibility-only input for historical callers. New code supplies the
   * visible serving mode so `fresh` remains distinct while using −11 science. */
  targetTemperatureC?: number;
  priceOverrides?: CustomerPriceIndex;
}

const starterInput = (
  category: ProductCategory,
  temperatureC: -11 | -12 | -13,
  targetBatchGrams: number,
  strategy: FormulationStrategy,
  items: RecipeItem[],
): RecipeInput => ({
  items,
  mode: 'classic',
  category,
  target_temperature_c: temperatureC,
  target_batch_grams: targetBatchGrams,
  machine_capacity_grams: null,
  goals: { formulation_strategy: strategy },
});

const rawTemplateItems = (
  template: FormulationTemplate,
  targetBatchGrams: number,
): { items: RecipeItem[]; roleByLineId: Readonly<Record<string, FunctionalRole>> } => {
  const scale = targetBatchGrams / template.baseBatchG;
  const roleByLineId: Record<string, FunctionalRole> = {};
  const items = template.roles.flatMap((roleTarget, index): RecipeItem[] => {
    if (!roleTarget.toolboxId || roleTarget.grams <= 0) return [];
    const ingredient = approvedFormulationToolboxIngredients(roleTarget.toolboxId).at(-1);
    if (!ingredient) {
      throw new Error(
        `Approved starter ${template.templateId} is missing toolbox identity ${roleTarget.toolboxId}.`,
      );
    }
    const lineId = `new-recipe-${index}-${roleTarget.toolboxId}`;
    roleByLineId[lineId] = roleTarget.role;
    return [
      {
        id: lineId,
        ingredient: structuredClone(ingredient),
        planned_grams: roleTarget.grams * scale,
        actual_grams: null,
        lock_type: 'unlocked',
      },
    ];
  });
  return { items, roleByLineId };
};

const practicalizeStarter = (
  exactInput: RecipeInput,
): { input: RecipeInput; result: RecipeResult; complete: boolean } => {
  const rawMass = exactInput.items.reduce((sum, item) => sum + item.planned_grams, 0);
  const complete = Math.abs(rawMass - exactInput.target_batch_grams) <= 0.1;
  // A neutral Sorbet deliberately omits the user-selected fruit/Main. Run the
  // accepted practicalization pipeline against the technological scaffold's
  // own mass, then restore the requested target for truthful Engine reporting.
  // This never stretches 400 g of approved structure into a fake 1000 g base.
  const practicalizationInput = complete
    ? exactInput
    : { ...exactInput, target_batch_grams: Math.round(rawMass) };
  // The general practicalizer uses nearest-integer rounding. An approved
  // template may sit fractionally below/above a Mapper stabilizer window; in
  // that case nearest rounding can move it farther out and is correctly
  // rejected. Seed only that registered line at the closest executable gram
  // inside the existing approved window, then let the shared practicalizer
  // reconcile the batch residual and re-run every Engine gate.
  const productDosageSeed: RecipeInput = {
    ...practicalizationInput,
    items: practicalizationInput.items.map((item) => {
      const dosage = approvedStabilizerDosage(canonicalIngredientId(item.ingredient));
      if (!dosage || Number.isInteger(item.planned_grams)) return item;
      const window = stabilizerDosageWindowGrams(
        dosage,
        exactInput.target_batch_grams,
      );
      const minimumWhole = Math.ceil(window.minGrams);
      const maximumWhole = Math.floor(window.maxGrams);
      if (minimumWhole > maximumWhole) return item;
      return {
        ...item,
        planned_grams: Math.min(
          maximumWhole,
          Math.max(minimumWhole, Math.round(item.planned_grams)),
        ),
      };
    }),
  };
  const preferredStabilizerItems = projectSorbetStabilizerSystemToWholeGramPreferred({
    ...productDosageSeed,
    target_batch_grams: exactInput.target_batch_grams,
    items: projectGelatoStabilizerSystemToWholeGramPreferred({
      ...productDosageSeed,
      target_batch_grams: exactInput.target_batch_grams,
    }),
  });
  const massBeforePreference = productDosageSeed.items.reduce(
    (sum, item) => sum + item.planned_grams,
    0,
  );
  const massAfterPreference = preferredStabilizerItems.reduce(
    (sum, item) => sum + item.planned_grams,
    0,
  );
  const preferenceMassTransfer = massBeforePreference - massAfterPreference;
  const carrierIndex = preferredStabilizerItems.findIndex(
    (item) => {
      const role = resolveFunctionalRole(item.ingredient);
      return role === 'primary_liquid' || role === 'water';
    },
  );
  // A starter policy change reallocates mass; it must not silently shrink or
  // grow the requested batch. Keep the exact pre-policy mass by transferring
  // the difference to the existing primary liquid, then let the shared
  // practicalizer and Engine revalidate the complete vector.
  if (
    Math.abs(preferenceMassTransfer) > 1e-9 &&
    carrierIndex >= 0 &&
    preferredStabilizerItems[carrierIndex]!.planned_grams + preferenceMassTransfer >= 0
  ) {
    const carrier = preferredStabilizerItems[carrierIndex]!;
    preferredStabilizerItems[carrierIndex] = {
      ...carrier,
      planned_grams: carrier.planned_grams + preferenceMassTransfer,
    };
  }
  const executableSeed: RecipeInput = {
    ...productDosageSeed,
    items: preferredStabilizerItems,
  };
  const practical = practicalizeRecipeCandidate(executableSeed, { byLineId: {} });
  if (!practical.ok) {
    const affected = practical.lineIds
      .map((lineId) => {
        const exact = practical.exactInput.items.find((item) => item.id === lineId);
        const attempted = practical.attemptedInput?.items.find((item) => item.id === lineId);
        return `${lineId}:${exact?.planned_grams ?? '?'}->${attempted?.planned_grams ?? '?'}`;
      })
      .join(',');
    throw new Error(
      `Starter whole-gram practicalization failed: ${practical.code}${affected ? ` (${affected})` : ''}.`,
    );
  }
  const input = complete
    ? practical.audit.executableInput
    : { ...practical.audit.executableInput, target_batch_grams: exactInput.target_batch_grams };
  return {
    input,
    result: calculateRecipe(input),
    complete,
  };
};

/** Stable material fingerprint: server hydration may replace scientific facts
 * but cannot turn an edited gram/identity/lock/topping state back into an
 * untouched starter. */
export function newRecipeStarterMaterialFingerprint(input: {
  items: readonly RecipeItem[];
  toppings?: readonly { id: string; planned_grams: number }[];
  excludedIngredientIds?: readonly string[];
  unavailableMainIngredientIds?: readonly string[];
}): string {
  return JSON.stringify({
    items: input.items.map((item) => [
      item.id,
      canonicalIngredientId(item.ingredient),
      item.planned_grams,
      item.actual_grams,
      item.lock_type,
      item.percent_constraint ?? null,
      item.grams_constraint ?? null,
      item.range_constraint ?? null,
    ]),
    toppings: (input.toppings ?? []).map((item) => [item.id, item.planned_grams]),
    excluded: [...(input.excludedIngredientIds ?? [])].sort(),
    unavailableMain: [...(input.unavailableMainIngredientIds ?? [])].sort(),
  });
}

/**
 * Materializes one complete profile × serving-mode × strategy × mass key from
 * the existing approved template registry. ECO and OPTIMAL deliberately share
 * the vector until a validated alternative exists; price never invents a
 * product or mutates scientific composition.
 */
export function buildCanonicalNewRecipeStarter(
  input: BuildCanonicalNewRecipeStarterInput,
): CanonicalNewRecipeStarter {
  const category = starterCategory(input.visibleProductType);
  const servingModeId =
    input.servingModeId ?? starterServingModeForTemperature(input.targetTemperatureC);
  const targetTemperatureC = starterTemperatureForServingMode(servingModeId);
  const formulationStrategy = input.formulationStrategy ?? DEFAULT_NEW_RECIPE_STRATEGY;
  const targetBatchGrams =
    Number.isFinite(input.targetBatchGrams) && (input.targetBatchGrams ?? 0) > 0
      ? Math.max(1, Math.round(input.targetBatchGrams!))
      : DEFAULT_NEW_RECIPE_BATCH_G;
  const lookup = selectFormulationTemplate(category, targetTemperatureC);
  const template = lookup.template;
  if (!template) {
    throw new Error(
      `No approved new-recipe starter for ${category} at ${targetTemperatureC}C (${lookup.unsupportedReason}).`,
    );
  }

  const raw = rawTemplateItems(template, targetBatchGrams);
  const exactInput = starterInput(
    category,
    targetTemperatureC,
    targetBatchGrams,
    formulationStrategy,
    raw.items,
  );
  const practical = practicalizeStarter(exactInput);
  const priceOverrides = input.priceOverrides ?? {};
  const pricing = summarizeEffectiveRecipeCost(practical.input, priceOverrides);
  const technical = recipeTechnicalFit(practical.result);
  const nativeViolations = detectViolations(practical.result).map((violation) => ({
    metric: violation.metric,
    direction: violation.direction,
    value: violation.value,
    min: violation.band?.min ?? null,
    max: violation.band?.max ?? null,
  }));
  const lines = practical.input.items.map((item): NewRecipeStarterLine => {
    const effective = effectiveCostForIngredient(item.ingredient, priceOverrides);
    return {
      lineId: item.id,
      role: raw.roleByLineId[item.id] ?? 'primary_liquid',
      canonicalId: canonicalIngredientId(item.ingredient),
      grams: item.planned_grams,
      percent: (item.planned_grams / targetBatchGrams) * 100,
      effectivePricePerKg: effective.pricePerKg,
      priceSource: effective.source,
      lineCost:
        effective.pricePerKg === null
          ? null
          : (item.planned_grams / 1_000) * effective.pricePerKg,
      wholeGram: Number.isInteger(item.planned_grams),
    };
  });
  const liquidDairyCarrierGrams = lines
    .filter((line) => line.role === 'primary_liquid')
    .reduce((sum, line) => sum + line.grams, 0);
  const actualBaseMassGrams = practical.input.items.reduce(
    (sum, item) => sum + item.planned_grams,
    0,
  );

  return {
    templateId: template.templateId,
    templateVersion: `registry@${template.templateId}`,
    templateApprovalSource: template.approvalSource,
    visibleProductType: input.visibleProductType,
    servingModeId,
    formulationStrategy,
    category,
    targetTemperatureC,
    targetBatchGrams,
    items: practical.input.items,
    lines,
    result: practical.result,
    metrics: {
      pod: practical.result.pod_points,
      pac: practical.result.pac_points,
      npac: practical.result.npac_points,
      iceFractionPercent: practical.result.ice_fraction_percent,
      waterPercent: practical.result.percentages.water_percent,
      totalSolidsPercent: practical.result.percentages.solids_percent,
      fatPercent: practical.result.percentages.fat_percent,
      proteinPercent: practical.result.percentages.protein_percent,
      liquidDairyCarrierGrams,
      actualProteinPercent:
        input.visibleProductType === 'protein'
          ? practical.result.percentages.protein_percent
          : null,
      technicalScore: technical.score,
      validatedNative: technical.validatedNative,
      provisional: technical.provisional,
      nativeViolations,
      costPerKg: pricing.costPerKg,
      costComplete: pricing.complete,
      actualBaseMassGrams,
      missingMainMassGrams: Math.max(0, targetBatchGrams - actualBaseMassGrams),
    },
    wholeGramStatus: 'exact',
    validationStatus: !practical.complete
      ? 'blocked_missing_user_main'
      : technical.provisional
        ? 'blocked_engine_provisional'
        : technical.validatedNative
          ? 'engine_validated_native'
          : 'blocked_engine_native_band_miss',
    strategyResolution: 'eco_equals_optimal_no_validated_alternative',
  };
}
