/**
 * Recipe constraints (UI/UX master spec §17, §18, §20.4, §23.2) — the public
 * surface of the pure lock/range + constraint-solver feasibility domain.
 * Built ON the existing engine (calculateRecipe / detectViolations /
 * proposeAutoFix via the @/engine barrel) — no parallel engine, no new math.
 */
export type {
  AppliedConstraintLine,
  AppliedConstraintNote,
  ConstraintChange,
  ConstraintConflict,
  ConstraintConflictReason,
  ConstraintFeasibilityAnalysis,
  ConstraintPreservationCode,
  ConstraintPreservationResult,
  ConstraintPreservationViolation,
  ConstraintSet,
  ConstraintSuggestedAction,
  ConstraintTargetContext,
  ConstraintValidationCode,
  ConstraintValidationIssue,
  ConstraintValidationResult,
  FeasibilityBound,
  FeasibilityViolationView,
  IngredientConstraint,
  NoReliableBoundReason,
} from './constraintTypes';

export {
  applyConstraintsToRecipe,
  BATCH_SUM_TOLERANCE_G,
  constrainedLineIds,
  constrainedMinimumGrams,
  rescaleBatchToTarget,
  validateConstraintSet,
  verifyConstraintsPreserved,
  type ApplyConstraintsResult,
  type RescaleBatchResult,
} from './constraintSet';

export {
  analyzeConstraintFeasibility,
  CONVERGENCE_GRAMS,
  EVALUATION_BUDGET_CAP,
  PROPOSE_EVALUATION_COST,
} from './constraintFeasibility';

export {
  buildFeasibilityExplanation,
  buildProposalExplanation,
  renderConstraintExplanationEn,
  type ConstraintExplanationEntry,
} from './constraintExplain';
