/**
 * Intent → deterministic starter recipe draft (User-Flow layer).
 *
 * Converts an `AssistantIntentDraft` into a LOCAL, read-only starter recipe
 * preview using LOCKED base templates built from the production demo/reference
 * ingredient catalog (`@/data/demoIngredients`). Runs the real
 * `calculateRecipe` for a metrics preview.
 *
 * HARD SCOPE (test-pinned):
 *  - PURE + deterministic: no IO, no clock, no randomness, no persistence;
 *  - NO LLM, NO DB, NO Mapper product rows, NO PI-Calculated ingredients —
 *    the only ingredient source is the locked demo/reference catalog already
 *    used by the engine's built-in Studio recipes;
 *  - NO recipe mutation and NO save: this builds an in-memory snapshot only.
 *    Turning it into the Studio working recipe is a separate future action;
 *  - when no safe template exists for a profile the status is `not_supported`
 *    — a recipe is NEVER faked or its composition invented.
 */
import {
  calculateRecipe,
  detectViolations,
  type EngineIngredient,
  type ProductCategory,
  type ProductMode,
  type RecipeGoals,
  type RecipeInput,
  type RecipeItem,
} from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { FlavorGroup, NormalizedRecipeIntent, ProductProfile } from '@/spine';
import type { AssistantIntentDraft } from './conversationalAssistantFlow';

export type IntentRecipeDraftStatus =
  | 'ready'
  | 'needs_more_information'
  | 'not_supported'
  | 'blocked';

export interface IntentRecipeDraftIngredient {
  id: string;
  name: string;
  grams: number;
}

export interface IntentRecipeDraftWarning {
  code:
    | 'flavor_manual_mapping_required'
    | 'optimization_recommended'
    | 'unsupported_profile_needs_manual_start'
    | 'batch_size_required'
    | 'intent_incomplete';
  messageKey: string;
}

export interface IntentRecipeDraftEnginePreview {
  configVersion: string;
  engineVersion: string;
  podPoints: number | null;
  npacPoints: number | null;
  iceFractionPercent: number | null;
  /** No hard-gate violation in the starter base at this profile × temperature. */
  inBand: boolean;
  /** Honest: the base has out-of-band metrics — running the optimizer helps. */
  optimizationRecommended: boolean;
  violationReasons: string[];
}

export interface IntentRecipeDraftTrace {
  source: 'locked_starter_template';
  templateId: string | null;
  baseBatchG: number | null;
  scaleFactor: number | null;
  generatedFrom: 'AssistantIntentDraft';
}

export interface IntentRecipeDraft {
  status: IntentRecipeDraftStatus;
  productProfile: ProductProfile;
  category: ProductCategory | null;
  servingTemperatureC: number | null;
  batchSizeG: number | null;
  templateId: string | null;
  flavorText: string | null;
  flavorGroup: FlavorGroup;
  /** Display echo of the scaled base lines (empty unless `ready`). */
  ingredients: IntentRecipeDraftIngredient[];
  /** The engine snapshot — only present when `ready`. Never saved, never applied. */
  recipeInput: RecipeInput | null;
  enginePreview: IntentRecipeDraftEnginePreview | null;
  warnings: IntentRecipeDraftWarning[];
  missingFields: string[];
  trace: IntentRecipeDraftTrace;
}

/* ------------------------------------------------------------------------ *
 * Locked starter templates (verified reference ingredients; base 1000 g)    *
 * ------------------------------------------------------------------------ */

interface TemplateLine {
  ingredientId: string;
  grams: number;
}

interface StarterTemplate {
  id: string;
  category: ProductCategory;
  /** Flavor group already built into the base (chocolate); null = neutral base. */
  intrinsicFlavorGroup: FlavorGroup | null;
  baseBatchG: number;
  lines: readonly TemplateLine[];
}

/**
 * Only profiles with a SAFE, locked base template from the production catalog.
 * standard_gelato: the built-in milk base (= the `milk-base` Studio preset).
 * chocolate_gelato: the engine golden chocolate-classic proportions (all
 * ingredients present in the demo/reference catalog). sorbet / vegan_gelato
 * have NO safe template in the current catalog (no water / plant-milk lines)
 * → they resolve to `not_supported`, never invented.
 */
const STARTER_TEMPLATES: Partial<Record<ProductProfile, StarterTemplate>> = {
  standard_gelato: {
    id: 'milk_base_v1',
    category: 'milk_gelato',
    intrinsicFlavorGroup: null,
    baseBatchG: 1000,
    lines: [
      { ingredientId: 'milk_3_5', grams: 670 },
      { ingredientId: 'cream_30', grams: 130 },
      { ingredientId: 'smp', grams: 35 },
      { ingredientId: 'sucrose', grams: 130 },
      { ingredientId: 'dextrose', grams: 30 },
      { ingredientId: 'tara_gum', grams: 5 },
    ],
  },
  chocolate_gelato: {
    id: 'chocolate_base_v1',
    category: 'chocolate_gelato',
    intrinsicFlavorGroup: 'chocolate',
    baseBatchG: 1000,
    lines: [
      { ingredientId: 'milk_3_5', grams: 600 },
      { ingredientId: 'cream_30', grams: 90 },
      { ingredientId: 'smp', grams: 30 },
      { ingredientId: 'sucrose', grams: 150 },
      { ingredientId: 'dextrose', grams: 40 },
      { ingredientId: 'cocoa_2224', grams: 60 },
      { ingredientId: 'dark_chocolate_70', grams: 25 },
      { ingredientId: 'tara_gum', grams: 5 },
    ],
  },
};

const PROFILE_TO_CATEGORY: Readonly<Record<ProductProfile, ProductCategory>> = {
  standard_gelato: 'milk_gelato',
  chocolate_gelato: 'chocolate_gelato',
  sorbet: 'sorbet',
  vegan_gelato: 'vegan_gelato',
};

const SWEETNESS_TO_GOAL: Readonly<Record<string, NonNullable<RecipeGoals['sweetness']>>> = {
  low: 'low',
  balanced: 'normal',
  high: 'high',
};

const ingredientOrNull = (id: string): EngineIngredient | null => findDemoIngredient(id) ?? null;

const baseTrace = (
  templateId: string | null,
  baseBatchG: number | null,
  scaleFactor: number | null,
): IntentRecipeDraftTrace => ({
  source: 'locked_starter_template',
  templateId,
  baseBatchG,
  scaleFactor,
  generatedFrom: 'AssistantIntentDraft',
});

/**
 * Build a deterministic starter recipe draft from an assistant intent draft.
 * Pure — never mutates the input, never saves, never applies. Returns
 * `not_supported` (never a fake recipe) when no safe template exists.
 */
/**
 * Core: build the starter recipe draft directly from a normalized intent + batch —
 * the reusable engine bridge shared by the studio assistant AND the customer flow.
 * Same locked templates, same demo/reference catalog, same real `calculateRecipe`.
 */
export function buildStarterRecipeFromIntent(
  intent: NormalizedRecipeIntent,
  batchSizeG: number | null,
  opts: { complete: boolean; missingRequired: readonly string[] },
): IntentRecipeDraft {
  const profile = intent.productProfile;
  const flavorText = intent.flavorText ?? null;
  const flavorGroup = intent.flavorGroup;

  const shell: Omit<IntentRecipeDraft, 'status' | 'trace'> = {
    productProfile: profile,
    category: PROFILE_TO_CATEGORY[profile] ?? null,
    servingTemperatureC: intent.servingTemperatureC,
    batchSizeG,
    templateId: null,
    flavorText,
    flavorGroup,
    ingredients: [],
    recipeInput: null,
    enginePreview: null,
    warnings: [],
    missingFields: [],
  };

  // 1. the intent itself must be complete before a recipe can start.
  if (!opts.complete) {
    return {
      ...shell,
      status: 'blocked',
      missingFields: [...opts.missingRequired],
      warnings: [{ code: 'intent_incomplete', messageKey: 'assistant.starter.intent_incomplete' }],
      trace: baseTrace(null, null, null),
    };
  }

  // 2. a safe locked template must exist for this profile.
  const template = STARTER_TEMPLATES[profile];
  if (!template) {
    return {
      ...shell,
      status: 'not_supported',
      warnings: [
        {
          code: 'unsupported_profile_needs_manual_start',
          messageKey: 'assistant.starter.unsupported_profile',
        },
      ],
      trace: baseTrace(null, null, null),
    };
  }

  // 3. a concrete batch size is required to scale the base.
  if (batchSizeG === null || !Number.isFinite(batchSizeG) || batchSizeG <= 0) {
    return {
      ...shell,
      status: 'needs_more_information',
      templateId: template.id,
      missingFields: ['batch_size'],
      warnings: [{ code: 'batch_size_required', messageKey: 'assistant.starter.batch_size_required' }],
      trace: baseTrace(template.id, template.baseBatchG, null),
    };
  }

  // 4. build the scaled snapshot from verified reference ingredients only.
  const scaleFactor = batchSizeG / template.baseBatchG;
  const items: RecipeItem[] = [];
  const ingredients: IntentRecipeDraftIngredient[] = [];
  for (const line of template.lines) {
    const ingredient = ingredientOrNull(line.ingredientId);
    if (!ingredient) {
      // a template must only reference known catalog ids — defensive, never faked.
      return {
        ...shell,
        status: 'not_supported',
        templateId: template.id,
        warnings: [
          {
            code: 'unsupported_profile_needs_manual_start',
            messageKey: 'assistant.starter.unsupported_profile',
          },
        ],
        trace: baseTrace(template.id, template.baseBatchG, scaleFactor),
      };
    }
    const grams = line.grams * scaleFactor;
    items.push({
      id: `starter:${template.id}:${line.ingredientId}`,
      ingredient,
      planned_grams: grams,
      actual_grams: null,
      lock_type: 'unlocked',
    });
    ingredients.push({ id: line.ingredientId, name: ingredient.name, grams });
  }

  const mode: ProductMode = intent.qualityTier;
  const goals: RecipeGoals = {
    sweetness: SWEETNESS_TO_GOAL[intent.sweetnessPreference] ?? 'normal',
    cost_priority: intent.costPriority,
    flavor_intensity: 'balanced',
  };

  const recipeInput: RecipeInput = {
    items,
    mode,
    category: template.category,
    target_temperature_c: intent.servingTemperatureC,
    target_batch_grams: batchSizeG,
    machine_capacity_grams: null,
    goals,
  };

  // 5. engine preview (read-only) — real calculateRecipe + honest violations.
  const result = calculateRecipe(recipeInput);
  const violationReasons = detectViolations(result).map((v) => v.reason);
  const enginePreview: IntentRecipeDraftEnginePreview = {
    configVersion: result.config_version,
    engineVersion: result.engine_version,
    podPoints: result.pod_points,
    npacPoints: result.npac_points,
    iceFractionPercent: result.ice_fraction_percent,
    inBand: violationReasons.length === 0,
    optimizationRecommended: violationReasons.length > 0,
    violationReasons,
  };

  const warnings: IntentRecipeDraftWarning[] = [];
  const flavorHandled =
    template.intrinsicFlavorGroup !== null && template.intrinsicFlavorGroup === flavorGroup;
  const flavorIsSpecific = flavorText !== null && flavorGroup !== 'unknown' && flavorGroup !== 'neutral';
  if (flavorIsSpecific && !flavorHandled) {
    warnings.push({
      code: 'flavor_manual_mapping_required',
      messageKey: 'assistant.starter.flavor_manual_mapping',
    });
  }
  if (enginePreview.optimizationRecommended) {
    warnings.push({ code: 'optimization_recommended', messageKey: 'assistant.starter.optimization_recommended' });
  }

  return {
    ...shell,
    status: 'ready',
    templateId: template.id,
    ingredients,
    recipeInput,
    enginePreview,
    warnings,
    trace: baseTrace(template.id, template.baseBatchG, scaleFactor),
  };
}

/**
 * Build a deterministic starter recipe draft from an assistant intent draft.
 * Thin wrapper over `buildStarterRecipeFromIntent` (the shared engine bridge).
 */
export function buildStarterRecipeDraft(intentDraft: AssistantIntentDraft): IntentRecipeDraft {
  return buildStarterRecipeFromIntent(intentDraft.intent, intentDraft.batchSizeG, {
    complete: intentDraft.complete,
    missingRequired: intentDraft.missingRequired,
  });
}
