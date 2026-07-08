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
  type RecipeInput,
} from '@/engine';
import {
  ACTIVE_PRODUCT_PROFILES,
  adaptBaseEngineResult,
  designRecipe,
  routeOptimizationFlow,
  routeRecipeIntegrationFlow,
  runOptimizationRerunPreview,
  type AppliedAdjustment,
  type BaseEngineMetrics,
  type CorrectionGoal,
  type CorrectionPlan,
  type IntegrationFlowDecision,
  type NormalizedRecipeIntent,
  type OptimizationDecision,
  type OptimizationRerunState,
  type RejectedCorrection,
  type RerunCorrectionFn,
  type RerunVerification,
} from '@/spine';
import type { OptimizationPreviewFixture } from './optimizationPreviewFixtures';

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
  intendedDecision: OptimizationPreviewFixture['intendedDecision'];
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

  warnings: readonly string[];
  hardBlockers: readonly string[];
}

const isSupportedProfile = (profile: string): boolean =>
  (ACTIVE_PRODUCT_PROFILES as readonly string[]).includes(profile);

/**
 * Run one fixture end-to-end: real Base Engine → Spine adapter → Integration Flow
 * → Optimizer routing → rerun preview (with the real solver injected). Pure and
 * deterministic; never mutates the fixture and never persists anything.
 */
export function runOptimizationPreview(fixture: OptimizationPreviewFixture): OptimizationPreviewView {
  const beforeResult = calculateRecipe(fixture.recipe);
  const beforeMetrics = adaptBaseEngineResult(beforeResult).metrics;

  // The Designer only handles supported profiles; for an unsupported profile (blocked path) the
  // constraints are never consumed, so derive them from a supported stand-in to avoid a lookup throw.
  const constraintsIntent: NormalizedRecipeIntent = isSupportedProfile(fixture.intent.productProfile)
    ? fixture.intent
    : { ...fixture.intent, productProfile: 'standard_gelato' };
  const optimizerConstraints = designRecipe(constraintsIntent).optimizerConstraints;

  const flow = routeRecipeIntegrationFlow({ intent: fixture.intent, baseEngineMetrics: beforeMetrics });
  const optimization = routeOptimizationFlow({ flow, intent: fixture.intent, optimizerConstraints });
  const preview = runOptimizationRerunPreview({
    intent: fixture.intent,
    beforeMetrics,
    recipeDraft: fixture.recipe,
    optimization,
    optimizerConstraints,
    rerunCorrection: realRerunCorrection,
  });

  const afterMetrics = preview.correctedBaseEngineResult
    ? adaptBaseEngineResult(preview.correctedBaseEngineResult).metrics
    : null;

  return {
    id: fixture.id,
    label: fixture.label,
    intendedDecision: fixture.intendedDecision,
    productProfile: fixture.intent.productProfile,
    servingTemperatureC: fixture.intent.servingTemperatureC,
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
    warnings: preview.warnings,
    hardBlockers: preview.hardBlockers,
  };
}

/** Run every DEV fixture. */
export function runAllOptimizationPreviews(
  fixtures: readonly OptimizationPreviewFixture[],
): OptimizationPreviewView[] {
  return fixtures.map(runOptimizationPreview);
}
