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

export {
  evaluateRecipeConstraintAuthority,
  recipeCandidateIsHardValid,
  type RecipeConstraintAuthorityInput,
  type RecipeConstraintAuthorityIssue,
  type RecipeConstraintAuthorityResult,
} from './recipeConstraintAuthority';

export {
  evaluateFreezingStabilityStatus,
  type FreezingStabilityAssessment,
  type FreezingStabilityAssessmentInput,
  type FreezingStabilityCalculationState,
  type FreezingStabilityReason,
  type FreezingStabilityStatus,
} from './freezingStabilityStatus';

export {
  GELATO_STABILIZER_SYSTEM_POLICY,
  assessGelatoStabilizerSystem,
  clampGelatoStabilizerComponentGrams,
  gelatoStabilizerSystemApplies,
  gelatoStabilizerSystemItems,
  gelatoStabilizerWholeGramBand,
  type ClampGelatoStabilizerComponentResult,
  type GelatoStabilizerSystemAssessment,
  type GelatoStabilizerSystemIssue,
  type GelatoStabilizerSystemIssueCode,
  type GelatoStabilizerWholeGramBand,
} from './gelatoStabilizerSystemAuthority';

export {
  SORBET_STABILIZER_SYSTEM_POLICY,
  assessSorbetStabilizerSystem,
  clampSorbetStabilizerComponentGrams,
  projectSorbetStabilizerSystemToWholeGramPreferred,
  sorbetStabilizerSystemApplies,
  sorbetStabilizerSystemItems,
  sorbetStabilizerWholeGramBand,
  type SorbetStabilizerSystemAssessment,
  type SorbetStabilizerSystemIssue,
  type SorbetStabilizerSystemIssueCode,
  type SorbetStabilizerWholeGramBand,
} from './sorbetStabilizerSystemAuthority';

export {
  assessOwnerStabilizerSystem,
  clampOwnerStabilizerComponentGrams,
  ownerStabilizerSystemApplies,
  ownerStabilizerSystemItems,
} from './ownerStabilizerSystemAuthority';
