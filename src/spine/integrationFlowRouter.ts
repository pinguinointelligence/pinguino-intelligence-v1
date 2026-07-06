/**
 * PINGUINO Spine — Integration Flow Router (Phase C Slice 6).
 *
 * The pure, unwired integration seam that connects the Spine modules in the
 * locked execution order (Integration_Flow.md §2):
 *
 *   Recipe Intent → Designer → Product Profile Registry → Base Engine output
 *   → Temperature Regulator evaluation → decision routing.
 *
 * It NEVER calculates recipe chemistry, never recalculates the Base Engine,
 * never replaces it, and never mutates the Base Engine result it is handed — the
 * Temperature Regulator stays a pure evaluation LAYER over the engine output
 * (Integration_Flow.md §12–§13). It reads the selected product profile and
 * serving temperature from the already-normalized Recipe Intent (the single
 * source of truth), evaluates the metrics through `evaluateTemperatureRegulator`,
 * and maps the verdict onto one final decision + the recommended next action.
 *
 * No DB, no Supabase, no Mapper, no UI, no engine import (spine files import only
 * within src/spine). This is IF7 "decision router" from Integration_Flow.md §24 —
 * the Optimizer (IF8) and the batch-rescue / stock-shortage branches (IF9/IF10)
 * are deliberately left for later slices; this router surfaces correction goals
 * for the Optimizer to consume but never runs it.
 */
import {
  adaptBaseEngineResult,
  type BaseEngineResultLike,
} from './baseEngineMetricsAdapter';
import type { RecipeDesignPlan } from './designRecipe';
import {
  evaluateTemperatureRegulator,
  type BaseEngineMetrics,
  type CorrectionGoal,
  type TemperatureRegulatorEvaluation,
} from './evaluateTemperatureRegulator';
import { PRODUCT_PROFILE_REGISTRY } from './productProfiles';
import {
  SPINE_CONTRACT_VERSION,
  type NormalizedRecipeIntent,
  type ProductProfile,
  type ServingTemperatureC,
  type SpineContractVersion,
} from './types';

export type IntegrationFlowVersion = '0.1.0';
export const INTEGRATION_FLOW_VERSION: IntegrationFlowVersion = '0.1.0';

/** The five final decisions this router produces (task contract). */
export type IntegrationFlowDecision = 'ready' | 'warning' | 'tradeoff' | 'impossible' | 'blocked';

/** Deterministic next-action hint per decision — never English decision logic elsewhere. */
export type IntegrationFlowNextAction =
  | 'show_recipe'
  | 'show_recipe_with_warnings'
  | 'run_optimizer'
  | 'revise_recipe_or_intent'
  | 'resolve_blocker';

export interface IntegrationFlowInput {
  /** Normalized intent — the source of truth for productProfile, servingTemperatureC, texturePreference. */
  intent: NormalizedRecipeIntent;
  /** Base Engine output, EITHER already adapted to metrics OR the raw result to adapt. */
  baseEngineMetrics?: BaseEngineMetrics;
  baseEngineResult?: BaseEngineResultLike;
  /** Optional Designer plan — cross-checked against the intent's product profile. */
  designerPlan?: RecipeDesignPlan;
  /** Optional upstream warnings to carry through (never suppressed). */
  contextWarnings?: readonly string[];
}

/** Compact echo of the metrics the regulator actually evaluated. */
export interface BaseEngineMetricsSummary {
  npac: number | null;
  pod: number | null;
  iceFraction: number | null;
  water: number | null;
  solids: number | null;
  npacStatus: TemperatureRegulatorEvaluation['npacStatus'];
  acceptable: boolean;
}

export interface IntegrationFlowTrace {
  integrationFlowVersion: IntegrationFlowVersion;
  /** The locked step order this router realizes (Integration_Flow.md §2, steps 4–11/14–16 subset). */
  stepsRealized: string[];
  intentProfile: string;
  intentServingTemperatureC: number;
  designerProfile: string | null;
  metricsSource: 'metrics' | 'adapter' | 'none';
  adapterMissingFields: string[];
  regulatorStatus: TemperatureRegulatorEvaluation['status'];
  hardGateFailures: string[];
  advisoryFlags: string[];
}

export interface IntegrationFlowResult {
  decision: IntegrationFlowDecision;
  nextAction: IntegrationFlowNextAction;

  selectedProductProfile: ProductProfile | null;
  selectedTemperatureRegulatorProfile: string | null;
  servingTemperatureC: ServingTemperatureC | null;

  baseEngineMetricsSummary: BaseEngineMetricsSummary | null;
  temperatureRegulatorEvaluation: TemperatureRegulatorEvaluation;

  /** Correction goals the Optimizer would consume (never applied here). */
  correctionGoals: CorrectionGoal[];
  warnings: string[];
  /** Reasons a recipe is blocked or impossible (empty otherwise). */
  hardBlockers: string[];

  trace: IntegrationFlowTrace;
  contractVersion: SpineContractVersion;
}

const NEXT_ACTION: Readonly<Record<IntegrationFlowDecision, IntegrationFlowNextAction>> = {
  ready: 'show_recipe',
  warning: 'show_recipe_with_warnings',
  tradeoff: 'run_optimizer',
  impossible: 'revise_recipe_or_intent',
  blocked: 'resolve_blocker',
};

const summarize = (
  metrics: BaseEngineMetrics | null,
  evaluation: TemperatureRegulatorEvaluation,
): BaseEngineMetricsSummary | null => {
  if (!metrics) return null;
  const finite = (v: number | undefined): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  return {
    npac: finite(metrics.npac),
    pod: finite(metrics.pod),
    iceFraction: finite(metrics.iceFraction),
    water: finite(metrics.water),
    solids: finite(metrics.solids),
    npacStatus: evaluation.npacStatus,
    acceptable: evaluation.acceptable,
  };
};

/**
 * Route one recipe through the pure integration flow. Deterministic; mutates
 * nothing. Decision model (Integration_Flow.md §14/§20, task Phase 2):
 *   unsupported profile/temperature or missing core Base Engine metrics         → blocked;
 *   acceptable, on the clean center (or the requested-texture edge), no advisories → ready;
 *   acceptable but off-center, or carrying advisory flags / soft correction goals → warning;
 *   not acceptable but a correction direction exists (goals)                     → tradeoff (needs Optimizer);
 *   not acceptable with no correction direction at the temperature layer         → impossible.
 */
export function routeRecipeIntegrationFlow(input: IntegrationFlowInput): IntegrationFlowResult {
  const { intent } = input;
  const warnings: string[] = [...(input.contextWarnings ?? [])];

  // Designer/intent profile consistency (rule 7: catch a profile/regulator mismatch early).
  const designerProfile = input.designerPlan?.productProfile ?? null;
  if (designerProfile && designerProfile !== intent.productProfile) {
    warnings.push('designer_profile_mismatch');
  }

  // Resolve the Base Engine metrics: explicit metrics win; else adapt the raw result.
  let metrics: BaseEngineMetrics | null = null;
  let metricsSource: IntegrationFlowTrace['metricsSource'] = 'none';
  let adapterMissingFields: string[] = [];
  if (input.baseEngineMetrics) {
    metrics = input.baseEngineMetrics;
    metricsSource = 'metrics';
  } else if (input.baseEngineResult) {
    const adapted = adaptBaseEngineResult(input.baseEngineResult);
    metrics = adapted.metrics;
    metricsSource = 'adapter';
    adapterMissingFields = adapted.missingFields;
    warnings.push(...adapted.warnings);
  }

  // Evaluate through the Temperature Regulator (never recalculates the engine). When no metrics were
  // supplied, still run it with an empty metric set so the profile/temperature block is reported.
  const evaluation = evaluateTemperatureRegulator({
    productProfile: intent.productProfile,
    servingTemperatureC: intent.servingTemperatureC,
    metrics: metrics ?? ({ npac: Number.NaN, pod: Number.NaN, iceFraction: Number.NaN, water: Number.NaN, solids: Number.NaN } satisfies BaseEngineMetrics),
    texturePreference: intent.texturePreference,
  });

  warnings.push(...evaluation.warnings);

  const selectedProductProfile = evaluation.productProfile;
  const selectedTemperatureRegulatorProfile = selectedProductProfile
    ? PRODUCT_PROFILE_REGISTRY[selectedProductProfile].temperatureRegulator
    : null;

  const stepsRealized = [
    'recipe_intent',
    'designer',
    'product_profile',
    'base_engine_output',
    'temperature_regulator',
    'decision_router',
  ];

  // Any HARD gate the regulator could not CONFIRM (its metric was unavailable) is missing data —
  // not a proven failure and not an impossibility. A recipe with an unconfirmed hard gate is blocked
  // (Integration_Flow.md §14/§20: missing_data is its own outcome, distinct from impossible), never
  // silently declared "no safe solution exists". Block on the FULL set, not just the core metrics.
  const unconfirmedHardMetrics = evaluation.trace.missingHardMetrics;
  const hardBlockers: string[] = [];

  let decision: IntegrationFlowDecision;
  if (!evaluation.evaluated) {
    // Unsupported product profile or serving temperature — never remapped.
    decision = 'blocked';
    if (evaluation.blockedReason) hardBlockers.push(evaluation.blockedReason);
  } else if (metricsSource === 'none' || unconfirmedHardMetrics.length > 0) {
    // No Base Engine metrics, or a hard gate could not be confirmed — cannot evaluate the recipe.
    decision = 'blocked';
    hardBlockers.push(
      'missing_base_engine_metrics',
      ...unconfirmedHardMetrics.map((g) => `missing:${g}`),
    );
  } else if (evaluation.acceptable) {
    // Acceptable AND on the clean center (or the requested-texture edge) with no advisory
    // flags/goals → ready; acceptable but off-center or carrying advisories → warning.
    const onTarget = evaluation.npacStatus === 'clean_center' || evaluation.trace.textureAligned;
    const noSoftFlags = evaluation.advisoryFlags.length === 0 && evaluation.correctionGoals.length === 0;
    decision = onTarget && noSoftFlags ? 'ready' : 'warning';
  } else if (evaluation.correctionGoals.length > 0) {
    // A correction direction exists — hand it to the Optimizer (later slice).
    decision = 'tradeoff';
    hardBlockers.push(...evaluation.hardGateFailures);
  } else {
    // A hard gate failed with no correction lever at the temperature-regulator layer.
    decision = 'impossible';
    hardBlockers.push(...evaluation.hardGateFailures);
  }

  return {
    decision,
    nextAction: NEXT_ACTION[decision],
    selectedProductProfile,
    selectedTemperatureRegulatorProfile,
    servingTemperatureC: evaluation.servingTemperatureC,
    baseEngineMetricsSummary: metricsSource === 'none' ? null : summarize(metrics, evaluation),
    temperatureRegulatorEvaluation: evaluation,
    correctionGoals: evaluation.correctionGoals,
    warnings,
    hardBlockers,
    trace: {
      integrationFlowVersion: INTEGRATION_FLOW_VERSION,
      stepsRealized,
      intentProfile: intent.productProfile,
      intentServingTemperatureC: intent.servingTemperatureC,
      designerProfile,
      metricsSource,
      adapterMissingFields,
      regulatorStatus: evaluation.status,
      hardGateFailures: evaluation.hardGateFailures,
      advisoryFlags: evaluation.advisoryFlags,
    },
    contractVersion: SPINE_CONTRACT_VERSION,
  };
}
