/**
 * DEV Optimization Preview runner (Spine Slice 9) — the NON-spine orchestration
 * that wires the pure `runOptimizationRerunPreview` seam to the REAL engine.
 *
 * Spine files may import only within src/spine, so they cannot call the engine;
 * this feature module (allowed to import the public `@/engine` barrel) supplies
 * the injected `rerunCorrection`: it proposes a correction with the real solver,
 * applies it hypothetically (immutably), and re-runs the real `calculateRecipe`.
 * The seam then adapts the result and re-verifies through the Temperature
 * Regulator. Pure preview: no external DB, no Mapper, no recipe save, no input
 * mutation (the engine's `calculateRecipe` and `applyAutoFix` never mutate).
 */
import {
  applyAutoFix,
  calculateRecipe,
  proposeAutoFix,
  type ProductCategory,
  type ProductMode,
  type RecipeInput,
} from '@/engine';
import {
  ACTIVE_PRODUCT_PROFILES,
  adaptBaseEngineResult,
  designRecipe,
  routeOptimizationFlow,
  routeRecipeIntegrationFlow,
  runOptimizationRerunPreview,
  SPINE_CONTRACT_VERSION,
  type AppliedAdjustment,
  type BaseEngineMetrics,
  type CorrectionGoal,
  type CorrectionPlan,
  type IntegrationFlowDecision,
  type NormalizedRecipeIntent,
  type OptimizationDecision,
  type OptimizationRerunState,
  type ProductProfile,
  type QualityTier,
  type RejectedCorrection,
  type RerunCorrectionFn,
  type RerunVerification,
  type ServingTemperatureC,
} from '@/spine';
import type { OptimizationPreviewFixture } from './optimizationPreviewFixtures';
import {
  deriveTemperatureAwareTarget,
  type TemperatureAwareTargetGuidance,
} from './temperatureAwareCorrectionTargets';
import {
  compareEngineVsShadowBands,
  type EngineVsShadowComparison,
} from './temperatureAwareTargetBands';

/** Fixture-intended decision, plus a `live` marker for the Studio recipe. */
export type OptimizationIntendedDecision = OptimizationPreviewFixture['intendedDecision'] | 'live';

/** The injected REAL solver + Base Engine rerun (proposed → applied → recalculated). */
export const realRerunCorrection: RerunCorrectionFn = (ctx) => {
  const draft = ctx.recipeDraft as RecipeInput;
  const proposed = proposeAutoFix({ input: draft, context: 'planning', exactCorrectionGrams: true });
  if (proposed.redacted) return { applied: false, reason: 'redacted' };
  const proposal = proposed.proposals.find((p) => 'actions' in p && p.actions.length > 0);
  if (!proposal) return { applied: false, reason: 'no_correction_proposal' };
  const applied = applyAutoFix({ input: draft, proposal, context: 'planning' });
  if (!applied.success) return { applied: false, reason: applied.reason };
  return {
    applied: true,
    correctedRecipe: applied.newInput,
    correctedResult: calculateRecipe(applied.newInput),
    appliedAdjustments: applied.actions.map((a) => ({ type: a.type, ingredient: a.ingredient_name, grams: a.grams })),
  };
};

export interface OptimizationPreviewView {
  id: string;
  label: string;
  intendedDecision: OptimizationIntendedDecision;
  productProfile: string;
  servingTemperatureC: number;

  beforeMetrics: BaseEngineMetrics;
  afterMetrics: BaseEngineMetrics | null;

  flowDecision: IntegrationFlowDecision;
  correctionGoals: readonly CorrectionGoal[];
  optimizerDecision: OptimizationDecision;
  proposedCorrections: readonly CorrectionPlan[];
  rejectedCorrections: readonly RejectedCorrection[];
  proposedAdjustments: readonly AppliedAdjustment[];

  finalDecision: OptimizationDecision;
  rerunState: OptimizationRerunState;
  rerun: RerunVerification | null;

  /** Temperature-aware target guidance: the regulator target + whether the solver aims at it. */
  targetGuidance: TemperatureAwareTargetGuidance;
  /** Shadow (non-live) engine-band-vs-regulator-band comparison (Slice 12 visibility). */
  bandComparison: EngineVsShadowComparison;

  warnings: readonly string[];
  hardBlockers: readonly string[];
}

const isSupportedProfile = (profile: string): boolean =>
  (ACTIVE_PRODUCT_PROFILES as readonly string[]).includes(profile);

export interface OptimizationPreviewInput {
  recipe: RecipeInput;
  intent: NormalizedRecipeIntent;
  id?: string;
  label?: string;
  intendedDecision?: OptimizationIntendedDecision;
}

/**
 * Run one recipe end-to-end: real Base Engine → Spine adapter → Integration Flow
 * → Optimizer routing → rerun preview (with the real solver injected). Pure and
 * deterministic; never mutates the recipe and never persists anything. Used for
 * both the DEV fixtures and the live Studio recipe.
 */
export function previewOptimization(args: OptimizationPreviewInput): OptimizationPreviewView {
  const { recipe, intent } = args;
  const beforeResult = calculateRecipe(recipe);
  const beforeMetrics = adaptBaseEngineResult(beforeResult).metrics;

  // The Designer only handles supported profiles; for an unsupported profile (blocked path) the
  // constraints are never consumed, so derive them from a supported stand-in to avoid a lookup throw.
  const constraintsIntent: NormalizedRecipeIntent = isSupportedProfile(intent.productProfile)
    ? intent
    : { ...intent, productProfile: 'standard_gelato' };
  const optimizerConstraints = designRecipe(constraintsIntent).optimizerConstraints;

  const flow = routeRecipeIntegrationFlow({ intent, baseEngineMetrics: beforeMetrics });
  const optimization = routeOptimizationFlow({ flow, intent, optimizerConstraints });
  const preview = runOptimizationRerunPreview({
    intent,
    beforeMetrics,
    recipeDraft: recipe,
    optimization,
    optimizerConstraints,
    rerunCorrection: realRerunCorrection,
  });

  const afterMetrics = preview.correctedBaseEngineResult
    ? adaptBaseEngineResult(preview.correctedBaseEngineResult).metrics
    : null;

  // Temperature-aware target guidance from the Base Engine's band-selection flags (honest:
  // reports when the solver is still on the −11 seeded fallback rather than the regulator target).
  const targetGuidance = deriveTemperatureAwareTarget(intent, beforeResult);
  // Shadow (non-live) comparison of the engine's selected band vs the regulator band.
  const bandComparison = compareEngineVsShadowBands(intent.productProfile, intent.servingTemperatureC);

  return {
    id: args.id ?? 'live',
    label: args.label ?? 'Live Studio recipe',
    intendedDecision: args.intendedDecision ?? 'live',
    productProfile: intent.productProfile,
    servingTemperatureC: intent.servingTemperatureC,
    beforeMetrics,
    afterMetrics,
    flowDecision: flow.decision,
    correctionGoals: flow.correctionGoals,
    optimizerDecision: optimization.decision,
    proposedCorrections: preview.proposedCorrections,
    rejectedCorrections: preview.rejectedCorrections,
    proposedAdjustments: preview.proposedAdjustments,
    finalDecision: preview.decision,
    rerunState: preview.rerunState,
    rerun: preview.rerun,
    targetGuidance,
    bandComparison,
    warnings: preview.warnings,
    hardBlockers: preview.hardBlockers,
  };
}

/** Run one DEV fixture (delegates to previewOptimization). */
export function runOptimizationPreview(fixture: OptimizationPreviewFixture): OptimizationPreviewView {
  return previewOptimization({
    recipe: fixture.recipe,
    intent: fixture.intent,
    id: fixture.id,
    label: fixture.label,
    intendedDecision: fixture.intendedDecision,
  });
}

/* ------------------------------------------------------------------------ *
 * Live Studio recipe → normalized intent (Slice 10)                          *
 * ------------------------------------------------------------------------ */

/** Engine product category → Spine product profile (Product_Profile.md §5). */
const CATEGORY_TO_PROFILE: Readonly<Record<ProductCategory, ProductProfile>> = {
  milk_gelato: 'standard_gelato',
  fruit_gelato: 'standard_gelato',
  nut_gelato: 'standard_gelato',
  chocolate_gelato: 'chocolate_gelato',
  alcohol_gelato: 'standard_gelato',
  sorbet: 'sorbet',
  vegan_gelato: 'vegan_gelato',
  custom: 'standard_gelato',
};

const MODE_TO_TIER: Readonly<Record<ProductMode, QualityTier>> = {
  eco: 'eco',
  classic: 'classic',
  premium: 'premium',
  signature: 'signature',
};

/**
 * Map a live Studio `RecipeInput` to a normalized intent for the preview. The
 * serving temperature is passed through as-is — the Integration Flow router blocks
 * an unsupported temperature (−11/−12/−13 only); it is never remapped.
 */
export function studioIntentFromRecipe(recipe: RecipeInput): NormalizedRecipeIntent {
  return {
    productProfile: CATEGORY_TO_PROFILE[recipe.category] ?? 'standard_gelato',
    qualityTier: MODE_TO_TIER[recipe.mode] ?? 'classic',
    servingTemperatureC: recipe.target_temperature_c as ServingTemperatureC,
    texturePreference: 'medium',
    sweetnessPreference: 'balanced',
    costPriority: 'balanced',
    flavorGroup: 'unknown',
    flavorTags: [],
    naturalOnly: false,
    allowBoosters: true,
    dietary: {
      vegan: recipe.category === 'vegan_gelato',
      lactoseFree: false,
      glutenFree: false,
      allergenAware: false,
      noAddedSugar: false,
      lowSugar: false,
      alcohol: recipe.category === 'alcohol_gelato',
    },
    constraints: {
      excludedIngredientIds: [],
      lockedIngredientIds: [],
      heroIngredientIds: [],
      batchSizeG: recipe.target_batch_grams,
      machineCapacityG: recipe.machine_capacity_grams,
    },
    source: 'user_input',
    warnings: [],
    contractVersion: SPINE_CONTRACT_VERSION,
  };
}

/** Run every DEV fixture. */
export function runAllOptimizationPreviews(
  fixtures: readonly OptimizationPreviewFixture[],
): OptimizationPreviewView[] {
  return fixtures.map(runOptimizationPreview);
}
