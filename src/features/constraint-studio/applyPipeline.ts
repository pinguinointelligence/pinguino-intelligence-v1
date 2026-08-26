/**
 * Preview → Apply pipeline (SPEC §19) — PURE, deterministic, and THE ONLY DOOR
 * to an applied recipe change in the Constraint Studio.
 *
 * Structural guarantee (owner-mandated, §17.2/§19): EVERY apply runs
 * `verifyConstraintsPreserved`. This is enforced at COMPILE TIME, not by
 * convention: the only value the store accepts for a recipe write is a
 * `VerifiedApply` instance, `VerifiedApply` has a PRIVATE constructor, and its
 * single factory — `VerifiedApply.commit` (exported as `commitPreview`) —
 * always calls `verifyConstraintsPreserved` and returns a blocked result (with
 * a clear Polish message, recipe untouched) when the check fails. No other
 * module can construct a `VerifiedApply`, so no apply path can skip the check.
 * A companion boundary test pins the source-level rules (the store is the only
 * recipe writer in this feature; this module is the only verify call site).
 *
 * REUSE (no parallel engine, no new math):
 *  - solver runs through the public engine barrel (`proposeAutoFix` /
 *    `applyAutoFix` / `calculateRecipe` / `detectViolations`);
 *  - constraints through src/features/recipe-constraints
 *    (`applyConstraintsToRecipe`, `rescaleBatchToTarget`,
 *    `verifyConstraintsPreserved`, `buildProposalExplanation`);
 *  - honest failure codes, never silent fallbacks (§18.5).
 */
import {
  applyAutoFix,
  calculateRecipe,
  detectViolations,
  proposeAutoFix,
  type CorrectionProposal,
  type EngineIngredient,
  type RecipeDirectionTarget,
  type RecipeInput,
  type RecipeResult,
} from '@/engine';
import { recipeContext } from '@/features/studio/buildRecipeInput';
import {
  buildRecipeDirectionPlan,
  DEFAULT_RECIPE_DIRECTION_TARGETS,
  hasActiveExactDirectionObjective,
  recipeDirectionViolations,
} from '@/features/recipe-direction/recipeDirectionTargets';
import {
  compareDirectionDistance,
  directionDistance,
  requestedDirectionBands,
  type DirectionDistanceMeasure,
} from '@/features/recipe-direction/directionBandDistance';
import {
  assessRecipeDirection,
  type RecipeDirectionAssessment,
} from '@/features/recipe-direction/recipeDirectionAssessment';
import { projectSorbetExactDirectionCandidate } from '@/features/recipe-direction/sorbetDirectionProjection';
import { searchSorbetNearestDirectionCandidate } from '@/features/recipe-direction/sorbetNearestDirectionSearch';
import {
  buildDraftCandidateVector,
  describeDraftAdjustment,
  sweepDraftCandidateVector,
  type DraftStateMeasure,
  type DraftSweepResult,
} from './draftCandidateVector';
import {
  compareExperimentalCandidateMeasures,
  evaluateExperimentalCandidate,
  experimentalNeighborhoodSearch,
} from './experimentalNeighborhoodSearch';
import { effectiveInputCostPerKg, sweepEcoDraftCost } from './ecoDraftCostSweep';
import {
  applyEffectiveCustomerPrices,
  effectiveCostForIngredient,
  type CustomerPriceIndex,
} from '@/features/pro-core/effectiveRecipePricing';
import { normalizeFormulationStrategy } from '@/features/formulation-strategy/strategy';
import {
  verifyEcoFlavourProtection,
  type EcoFlavourViolation,
} from '@/features/formulation-strategy/flavourFloor';
import {
  applyConstraintsToRecipe,
  buildProposalExplanation,
  BATCH_SUM_TOLERANCE_G,
  evaluateRecipeConstraintAuthority,
  rescaleBatchToTarget,
  verifyConstraintsPreserved,
  type ConstraintExplanationEntry,
  type ConstraintPreservationViolation,
  type ConstraintSet,
  type ConstraintValidationIssue,
  type IngredientConstraint,
} from '@/features/recipe-constraints';
import { sorbetStabilizerWholeGramBand } from '@/features/recipe-constraints/sorbetStabilizerSystemAuthority';
import { constraintStudioCopy as copy } from './constraintStudioCopy';
import {
  approvedFormulationToolboxIngredients,
  buildFormulationProposal,
  HARD_ROLES,
  routeFormulationMode,
  type FormulationAddedLine,
  type FormulationMode,
  type FormulationOptions,
  type FormulationRecommendation,
  type FormulationRoleTraceRow,
} from '@/features/formulation/formulate';
import { resolveFunctionalRole, type FunctionalRole } from '@/features/formulation/ingredientRoles';
import { flavourHeldLineIds } from '@/features/formulation/flavourMutationAuthority';
import {
  buildUserIntentBaseline,
  MATERIAL_USER_INTENT_DRIFT,
  measureUserIntentDrift,
  normalizedLineDrift,
  userIntentDriftTotal,
  type UserIntentDeviation,
} from '@/features/formulation/userLineIntent';
import {
  isVerifiedRuntimeSubstitute,
  hasVerifiedMapperSubstitutionAuthorization,
  substitutionIngredientFingerprint,
} from '@/features/ingredient-builder/recipeSubstitution';
import type { SubstituteAuthorization } from '@/features/ingredient-builder/ingredientTableUx';
import { detectProportionalScaling } from '@/features/formulation/proportionalScaling';
import {
  isTemplateControlledStabilizer,
  internalStabilizerProfileIssues,
  templateControlledStabilizerViolations,
  violatesInternalStabilizerProfileAuthority,
  withTemplateControlledStabilizerLocks,
} from '@/features/formulation/stabilizerDosage';
import {
  findFormulationTemplateById,
  isApprovedTemplateId,
  selectFormulationTemplate,
  selectFormulationTemplateForRecipe,
  type FormulationTemplate,
  type TemplateStatus,
} from '@/features/formulation/templateRegistry';
import { isToolboxCandidateExcluded } from '@/features/formulation/toolboxCanonical';
import { classifyViolationBands } from '@/features/formulation/violationBands';
import {
  captureMainIngredientIntent,
  mainIdentityViolationMessage,
  resolveMainRatioScale,
  verifyMainIngredientIdentity,
  type MainIdentityViolation,
} from '@/features/formulation/mainIngredientContract';
import {
  mainEnvelopeSearchCeilingGrams,
  mainEnvelopeSearchFloorGrams,
  productBehaviorModuleGate,
  productBehaviorRequiredLineIds,
  productBehaviorSnapshotFingerprint,
  verifyMainEnvelope,
  type MainEnvelopeViolation,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import {
  OWNER_INULIN_POLICY,
  ownerInulinPolicyIssues,
  withOwnerInulinPolicyHold,
} from '@/features/product-intelligence/ownerInulinPolicy';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import {
  canonicalDuplicateIds,
  canonicalIngredientId,
  canonicalIngredientIdFromSourceId,
  ingredientProvenance,
  normalizeIngredientIdentity,
  normalizeRecipeItemIdentity,
} from '@/data/ingredients/canonicalIngredientIdentity';
import {
  veganRecipeEligibilityIssues,
  type VeganRecipeEligibilityIssue,
} from '@/data/ingredients/veganEligibility';
import {
  veganProfileConstraintIssues,
  veganProfileConstraintMessagePl,
  type VeganProfileConstraintIssue,
  withVeganInulinEnvelopeHold,
} from '@/features/formulation/veganProfileConstraints';
import {
  veganSubstitutionMessagePl,
  veganSubstitutionRecommendations,
  type VeganSubstitutionRecommendation,
} from '@/features/formulation/veganSubstitutions';
import { compareVeganStructuralCandidates } from '@/features/vegan-structure';
import {
  assessProteinFormulation,
  fitProteinFormulation,
  proteinFrontierRank,
  type ProteinFormulationAssessment,
} from '@/features/protein-gelato/proteinAuthority';
import {
  practicalizeRecipeCandidate,
  PRACTICAL_RECIPE_MODEL_VERSION,
  type PracticalRecipeAudit,
  type PracticalRecipeResult,
  type PracticalRecipeSavedAudit,
  isOmittableUnusedLine,
} from '@/features/practical-recipe/practicalRecipe';
import { mainTechnicalLinearUpperBound } from './mainTechnicalLinearBound';

/**
 * Internal SOLVER HOLDS applied to every search in this pipeline.
 *
 * Two safety clamps that are science, not user intent, and therefore must bound
 * the SEARCH rather than reject its result afterwards:
 *  - stabilizer dosage windows (`withTemplateControlledStabilizerLocks`);
 *  - the Vegan inulin calibration envelope (RC-2, `withVeganInulinEnvelopeHold`).
 *
 * Neither is persisted as a user-visible §17 lock, and an explicit owner
 * lock/percent/range always wins over both.
 */
const positiveStandardPresencePreserved = (before: RecipeInput, after: RecipeInput): boolean => {
  const afterByLineId = new Map(after.items.map((item) => [item.id, item] as const));
  return before.items
    .filter(
      (item) =>
        item.lock_type === 'unlocked' &&
        item.planned_grams > 0 &&
        (item.user_intent_anchor_grams ?? 0) > 0,
    )
    .every((item) => {
      const proposed = afterByLineId.get(item.id);
      return (
        proposed !== undefined &&
        canonicalIngredientId(proposed.ingredient) === canonicalIngredientId(item.ingredient) &&
        proposed.planned_grams >= 1
      );
    });
};

const solverHolds = (input: RecipeInput, set: ConstraintSet): ConstraintSet =>
  withVeganInulinEnvelopeHold(
    input,
    withOwnerInulinPolicyHold(input, withTemplateControlledStabilizerLocks(input, set)),
  );

/** Build-only commercial inputs. They rank ECO candidates in memory and are
 * deliberately absent from RecipeInput, Preview payloads and saved versions. */
export interface OptimizePreviewOptions extends FormulationOptions {
  effectivePriceOverrides?: CustomerPriceIndex;
  /** Immutable per-line product/version/policy authority. Engine formulas do
   * not read it; product orchestration and the Apply trust door do. */
  productBehaviorSnapshots?: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  /** Owner Review rows remain visibly Main but do not claim an approved
   * sensory Main policy. They are still subject to Engine and dosage gates. */
  technicalOnlyMainLineIds?: readonly string[];
  /** Pro workbench provenance gate: even a clean, already-integer recipe must
   * pass through the canonical Preview → Apply door before Save/Production. */
  requirePracticalPreview?: boolean;
  /** Rescue-advisor SIMULATION only (owner 2026-08-22): ids of the ONE
   * candidate line the advisor appended to the draft. The Sorbet
   * Main-constrained search treats them as free dimensions; nothing else
   * changes and such a line is never written by Apply. */
  rescueSimulationLineIds?: readonly string[];
  /** INTERNAL. Set on the probe runs issued by the shared Direction NEAREST
   * search so those probes do not recurse into the search themselves. Never set
   * by a caller. */
  directionNearestPass?: boolean;
  /** INTERNAL. Set while a material-drift line is temporarily held at x_user
   * to generate an alternative candidate. It prevents nested soft-anchor
   * probes while retaining the independent Direction-neighborhood search. */
  softAnchorPass?: boolean;
}

/* ── fingerprints (staleness guard) ──────────────────────────────────────── */

/**
 * Deterministic fingerprint of the working state a preview was built for:
 * recipe lines (id, grams, actuals, lock), batch, goal fields AND the
 * constraint set. Any change between preview creation and Apply invalidates
 * the preview (§19.2 — a preview must never apply onto a different recipe).
 */
export function workingStateFingerprint(input: RecipeInput, set: ConstraintSet): string {
  return JSON.stringify({
    items: input.items.map((item) => [
      item.id,
      canonicalIngredientId(item.ingredient),
      item.ingredient.id,
      item.ingredient.private_product_id ?? null,
      ingredientProvenance(item.ingredient),
      item.planned_grams,
      item.actual_grams,
      item.lock_type,
      item.main_ratio_weight ?? null,
    ]),
    batch: input.target_batch_grams,
    mode: input.mode,
    category: input.category,
    temperature: input.target_temperature_c,
    machine: input.machine_capacity_grams,
    goals: input.goals ?? null,
    constraints: set.byLineId,
  });
}

function constraintSetFingerprint(set: ConstraintSet): string {
  return JSON.stringify(
    Object.entries(set.byLineId)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([lineId, constraint]) => [lineId, constraint]),
  );
}

function sameConstraintSet(left: ConstraintSet, right: ConstraintSet): boolean {
  return constraintSetFingerprint(left) === constraintSetFingerprint(right);
}

/* ── preview model ───────────────────────────────────────────────────────── */

export type PreviewKind = 'optimize' | 'batch_rescale' | 'suggested_fix' | 'substitution';

export interface SubstitutionPreviewProof {
  lineId: string;
  fromCanonicalId: string;
  toCanonicalId: string;
  fromName: string;
  toName: string;
  changesMainIdentity: boolean;
  candidateFingerprint: string;
  mapperRowFingerprint: string;
  allergensFingerprint: string;
  veganEligibility: string;
}

/** Session-only explicit Main consent. It is never serialized in a preview or recipe. */
export interface SubstitutionConsent {
  baseFingerprint: string;
  lineId: string;
  fromCanonicalId: string;
  toCanonicalId: string;
}

export interface SubstitutionSessionAuthorization {
  baseFingerprint: string;
  lineId: string;
  fromCanonicalId: string;
  toCanonicalId: string;
  /** Exact in-memory authorization object returned with the fetched Mapper row. */
  mapperAuthorization: SubstituteAuthorization;
  /** Server-resolved authority for the replacement, bound to this exact line. */
  productBehaviorSnapshot: ProductBehaviorSnapshot;
  /** Complete proposed authority, including deterministic correction/toolbox
   * lines introduced by the substitution solver. Terminal Apply revalidates
   * this set server-side before it reaches the trustless commit door. */
  proposalProductBehaviorSnapshots: Record<string, ProductBehaviorSnapshot>;
}

/** Session-only server authority for correction/toolbox lines introduced by
 * an ordinary PI proposal. It is bound to both the unchanged draft and the
 * exact proposed vector; synthetic local line ids are never treated as a
 * catalog identity. */
export interface ProposalProductBehaviorAuthorization {
  baseFingerprint: string;
  proposedFingerprint: string;
  baseProductBehaviorFingerprint: string;
  proposedProductBehaviorFingerprint: string;
  snapshots: Record<string, ProductBehaviorSnapshot>;
}

/** Session-only user consent for removing one visible positive Standard line.
 * The Preview payload is not authority: Apply rechecks the exact base line,
 * canonical identity, entered grams and proposed working-state fingerprint. */
export interface ExplicitStandardRemovalConsent {
  baseFingerprint: string;
  proposedFingerprint: string;
  lineId: string;
  canonicalIngredientId: string;
  ingredientFingerprint: string;
  beforeGrams: number;
}

/** Session-only consent for a native-safe candidate that misses a selected
 * preference target. Bound to the exact base, target tuple and candidate. */
export interface DirectionBestAchievableConsent {
  baseFingerprint: string;
  targetFingerprint: string;
  candidateFingerprint: string;
}

/** Session-only authorization for the one constraint transition explicitly
 * selected through “Ustaw X g i przelicz”. Preview payloads are untrusted;
 * Apply independently derives the permitted next set from this authorization. */
export interface SuggestedFixSessionAuthorization {
  baseFingerprint: string;
  type: 'set_max' | 'set_min';
  lineId: string;
  grams: number;
}

export function directionTargetFingerprint(input: RecipeInput): string {
  return JSON.stringify([
    input.category,
    input.target_temperature_c,
    input.goals?.direction_targets_active === true,
    input.goals?.direction_targets ?? null,
  ]);
}

/* ── outcome classification (owner addendum item 4) ──────────────────────── */

/**
 * WHAT A PREVIEW ACTUALLY DID (owner FINAL INTEGRATION ADDENDUM item 4,
 * 2026-07-25) — "batch reconciliation is NOT formulation improvement".
 *
 * WHAT WAS TRUE BEFORE: the CURRENT-DRAFT wave made an off-batch draft
 * (955 g / 1045 g against a 1000 g target) produce a real Preview. That is
 * correct behaviour, but the preview was titled „Dopasowanie receptury" for
 * both a PURE RESCALE and a genuine technological improvement, and the only
 * distinction was `batchReconciliationOnly` — a flag the BUILDER set.
 *
 * WHAT IS TRUE NOW: every preview carries this classification, RECOMPUTED
 * TRUSTLESSLY from the before/after inputs alone (never from a builder flag),
 * so the surface can only ever say what really happened:
 *   · `batch_rescale`                    → „Przeskalowano partię"
 *   · `engine_optimization`              → „PI zoptymalizowało recepturę"
 *   · `batch_rescale_and_optimization`   → BOTH, batch first (order of honesty)
 *   · `no_verified_change`               → neither claim is available
 *
 * `engineImproved` is the engine's OWN measure (fewer violations, or lower
 * weighted severity) — a pure proportional rescale cannot change either,
 * because every metric is per-100 g, so a pure reconciliation can never
 * produce the optimisation wording by construction.
 */
export type PreviewOutcome =
  | 'batch_rescale'
  | 'engine_optimization'
  | 'batch_rescale_and_optimization'
  | 'no_verified_change';

export interface PreviewOutcomeClassification {
  outcome: PreviewOutcome;
  /** The planned mass really moved AND landed on the target batch. */
  batchReconciled: boolean;
  /** Per-100 g composition identical within tolerance (a pure rescale). */
  compositionUnchanged: boolean;
  /** The engine verified fewer violations OR lower weighted severity. */
  engineImproved: boolean;
  /** The native-safe Protein candidate improved its structural quality or won back the claim. */
  proteinQualityImproved?: boolean;
  beforeGrams: number;
  afterGrams: number;
  targetBatchGrams: number;
  violationsBefore: number;
  violationsAfter: number;
}

/** Per-100 g composition tolerance (0.01 g per 100 g — far below display). */
const COMPOSITION_SHARE_TOLERANCE = 0.01;

/**
 * Is the proposal a PURE RESCALE — same lines, same per-100 g composition?
 * Pure arithmetic on the two inputs; no flag, no builder intent.
 */
function isCompositionUnchanged(before: RecipeInput, after: RecipeInput): boolean {
  const beforeSum = plannedSum(before);
  const afterSum = plannedSum(after);
  if (!(beforeSum > 0) || !(afterSum > 0)) return false;
  if (before.items.length !== after.items.length) return false;
  const afterById = new Map(after.items.map((item) => [item.id, item]));
  for (const beforeItem of before.items) {
    const afterItem = afterById.get(beforeItem.id);
    if (!afterItem) return false;
    const beforeShare = (beforeItem.planned_grams / beforeSum) * 100;
    const afterShare = (afterItem.planned_grams / afterSum) * 100;
    if (Math.abs(beforeShare - afterShare) > COMPOSITION_SHARE_TOLERANCE) return false;
  }
  return true;
}

/** THE trustless classification (owner addendum item 4). PURE. */
export function classifyPreviewOutcome(
  before: RecipeInput,
  after: RecipeInput,
): PreviewOutcomeClassification {
  const beforeGrams = plannedSum(before);
  const afterGrams = plannedSum(after);
  const targetBatchGrams = after.target_batch_grams;
  const violationsBefore = detectViolations(calculateRecipe(before)).length;
  const violationsAfter = detectViolations(calculateRecipe(after)).length;

  const massMoved = Math.abs(afterGrams - beforeGrams) > BATCH_SUM_TOLERANCE_G;
  const landedOnTarget =
    targetBatchGrams > 0 && Math.abs(afterGrams - targetBatchGrams) <= BATCH_SUM_TOLERANCE_G;
  const batchReconciled = massMoved && landedOnTarget;
  const compositionUnchanged = isCompositionUnchanged(before, after);
  const nativeImproved =
    violationsAfter < violationsBefore ||
    totalSeverity(after) < totalSeverity(before) - SEVERITY_EPS;
  // Protein v2: "improved" means the candidate earns the HIGH PROTEIN claim it
  // did not earn before, or keeps the claim at strictly better structural
  // quality. Moving the protein NUMBER is never, on its own, an improvement.
  const beforeProtein = assessProteinFormulation(before);
  const afterProtein = assessProteinFormulation(after);
  const proteinQualityImproved =
    beforeProtein.applicable &&
    afterProtein.applicable &&
    afterProtein.hardSafe &&
    (afterProtein.qualification.qualified && !beforeProtein.qualification.qualified
      ? true
      : afterProtein.qualification.qualified &&
        beforeProtein.qualification.qualified &&
        (afterProtein.structure.score ?? 0) > (beforeProtein.structure.score ?? 0) + 1e-9);
  const engineImproved = nativeImproved || proteinQualityImproved;

  const outcome: PreviewOutcome = engineImproved
    ? batchReconciled
      ? 'batch_rescale_and_optimization'
      : 'engine_optimization'
    : batchReconciled
      ? 'batch_rescale'
      : 'no_verified_change';

  return {
    outcome,
    batchReconciled,
    compositionUnchanged,
    engineImproved,
    beforeGrams,
    afterGrams,
    proteinQualityImproved,
    targetBatchGrams,
    violationsBefore,
    violationsAfter,
  };
}

/* ── formulation authenticity proof (owner Agent 3 contract) ─────────────── */

/** Owner addendum (3) — the exact required stabilizer-dose provenance sentence. */
export const STABILIZER_TEMPLATE_DOSE_NOTE_PL =
  'Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.';

export type FormulationProofVerdict =
  /** ≥1 engine-verified improving move applied AND the presented composition is
   * NOT a shared-factor projection of the seed. */
  | 'engine_improved'
  /** The formulation ends with every band in range — nothing left to prove. */
  | 'all_bands_in_range'
  /** The full move search ran and every move was rejected (or the net result
   * equals the seed projection) — the presented state is the PROVEN
   * best-achievable under the constraints; per-move rejection reasons live in
   * `iteration.attemptedMoves`. NEVER presented as an optimized formulation. */
  | 'no_feasible_improvement';

/**
 * THE AUTHENTICITY PROOF a formulation preview must carry (owner Agent 3
 * contract): a proportional projection of the template seed may NEVER be
 * presented as formulation unless the engine-verified optimizer ran and either
 * improved it or PROVED it fixed-point best-achievable — and the preview says
 * which, with the attempted-move log as evidence.
 */
export interface FormulationProof {
  verdict: FormulationProofVerdict;
  /** Applied verified-improving rounds (0 = the seed survived untouched). */
  improvingMoves: number;
  /** How many times the canonical solver was REALLY invoked. */
  solverInvocations: number;
  /** Proportional-scaling detector on the FINAL state vs the seed baseline. */
  proportionalProjection: boolean;
  sharedScaleFactor: number | null;
  /** TRUE ⇒ the result must NEVER be presented as optimal — only best-effort. */
  bestEffort: boolean;
  bestEffortReasons: (
    | 'provisional_bands'
    | 'reference_derived_template'
    | 'iteration_capped'
    | 'residual_violations_proven_unfixable'
  )[];
  /** Owner addendum (3): present whenever the stabilizer dose in the FINAL
   * state is inherited from the reference template (never Engine-optimized). */
  stabilizerDoseNotePl: string | null;
}

export interface PreviewLineDiff {
  lineId: string;
  name: string;
  /** null = the line is new in the proposal. */
  beforeGrams: number | null;
  /** null = the line is removed by the proposal. */
  afterGrams: number | null;
  kind: 'unchanged' | 'changed' | 'added' | 'removed';
  /** The line is held by a locked/range constraint in the preview's NEXT set. */
  locked: boolean;
}

export interface ResidualMetricDiagnostic {
  metric: string;
  labelPl: string;
  valueUnit: '%' | 'pkt';
  distanceUnit: 'pp' | 'pkt';
  beforeValue: number | null;
  proposedValue: number;
  acceptedMin: number;
  acceptedMax: number;
  distanceBefore: number;
  distanceAfter: number;
  movement: 'improved' | 'unchanged' | 'worsened';
  status: 'hard_block' | 'advisory';
  bandStatus: 'seeded' | 'estimated' | null;
  categoryFallback: boolean;
  temperatureFallback: boolean;
  applyDisabledReasonPl: string;
}

export interface ConstraintPreview {
  kind: PreviewKind;
  titlePl: string;
  /** RC-2c: the exact Direction preference was unreachable, so this Preview is
   * the NEAREST legal executable recipe rather than an ACHIEVED target. Hard
   * constraints were never relaxed to produce it. */
  directionTargetUnreached?: boolean;
  /** A current user lock fixes a value outside an authoritative hard boundary.
   * The only legal transition is this disclosed, separately authorized
   * Suggested Fix Preview. */
  safetyLockConflict?: {
    lineId: string;
    ingredientName: string;
    beforeGrams: number;
    requiredGrams: number;
    boundary: 'minimum' | 'maximum';
    reason: 'product_dosage' | 'constraint_feasibility';
  };
  /** Exact identity swap; the Apply door re-derives every field. */
  substitution?: SubstitutionPreviewProof;
  /** Explicit user-requested removal; never created by normal optimization. */
  explicitStandardRemoval?: {
    lineId: string;
    canonicalIngredientId: string;
    ingredientFingerprint: string;
    productName: string;
    beforeGrams: number;
  };
  /** Owner P0 (Przelicz z PI) — auto-balance proof: what the orchestration actually did. */
  autoBalance?: { batchRescaled: boolean; solverRounds: number };
  /**
   * Owner CURRENT-DRAFT P0 (primary root cause): TRUE ⇒ this preview exists
   * because the draft was OFF its target batch and the batch was reconciled;
   * NO further technical improvement was verified. The UI must say exactly
   * that and must NEVER call it a technical improvement.
   */
  batchReconciliationOnly?: boolean;
  /** TRUE only when the recipe was already inside every selected/native band
   * and Preview exists solely to turn the exact draft into an executable
   * whole-gram vector. Apply never trusts this marker; it re-derives the exact
   * equality and the practical candidate from the current draft. */
  practicalizationOnly?: boolean;
  /** The planned mass the draft carried before the reconciliation. */
  batchBeforeGrams?: number;
  /**
   * OWNER ADDENDUM item 4 — WHAT THIS PREVIEW ACTUALLY DID, recomputed
   * trustlessly from (baseInput, proposedInput) by `classifyPreviewOutcome`.
   * The UI renders its wording from THIS, never from `batchReconciliationOnly`
   * or any other builder-set flag, so a pure rescale can never be presented as
   * an optimisation and an optimisation can never be presented as a rescale.
   */
  outcomeClassification: PreviewOutcomeClassification;
  /**
   * USER-INTENT DEVIATION REPORT (owner GLOBAL SOFT-HOLD §7/§13/§25).
   *
   * Computed HERE, trustlessly, from (baseInput, executableInput) for EVERY
   * preview builder — formulation, local correction, ECO, Rescue, batch
   * rescale alike — so no route can produce a preview that quietly turned a
   * positive user ingredient into a trace amount. `material` is the subset
   * that crossed the global policy line; when it is non-empty the Preview must
   * SAY what it is doing and the Apply door demands explicit consent.
   */
  userIntent?: {
    /** Σ weight × normalized drift over every soft-held line. */
    totalDrift: number;
    /** Every soft-held line, measured against the user baseline. */
    lines: UserIntentDeviation[];
    /** The subset that crossed `MATERIAL_USER_INTENT_DRIFT`. */
    material: UserIntentDeviation[];
  };
  /** Owner P0 (full formulation): the formulation provenance — template seed,
   * mode, auto-added toolbox lines (with reasons), honest gaps + suggestions. */
  formulation?: {
    mode: FormulationMode;
    templateId: string;
    templateStatus: TemplateStatus;
    added: FormulationAddedLine[];
    missingRoles: FunctionalRole[];
    recommendations: FormulationRecommendation[];
    keptFixed: string[];
    /** Phase-1 role trace (QA): one row per template role, in template order. */
    roleTrace: FormulationRoleTraceRow[];
    /** Owner Phase 6 (NIGHTLY): TRUE when this formulation was the
     * template-seeded FALLBACK after the local corrector found no safe fix —
     * same selected ingredient ids, locks, exclusions, batch, temperature. */
    localFallback?: boolean;
    /** Owner Agent 3 (authenticity): the REQUIRED proof — verdict, scaling
     * detector, best-effort labels, stabilizer-dose provenance. Every
     * formulation preview built by this pipeline carries it; the Apply door
     * rejects a formulation preview without a self-consistent proof. */
    proof?: FormulationProof;
  };
  /** Fingerprint of (input, constraints) the preview was built for. */
  baseFingerprint: string;
  /** Product/version/policy staleness guard, present for resolver-managed drafts. */
  productBehaviorFingerprint?: string;
  /** Authority of the unchanged draft. Substitution has a different proposed fingerprint. */
  baseProductBehaviorFingerprint?: string;
  /**
   * Owner P0 NIGHTLY (live FAILURE 1, Phase 3): the monotonic `draftRevision`
   * this preview was built for (stamped by the store). `commitPreview` rejects
   * a revision mismatch — the additional monotonic guard NEXT TO the
   * fingerprint guard, so a preview can never apply onto a later draft.
   */
  baseDraftRevision?: number;
  /** Owner P0 NIGHTLY (FAILURE 2): honest iteration diagnostics — count,
   * per-round violation/severity trajectory and the exact stop reason. */
  /** Protein v2 verdict on the staged candidate: claim qualification (HARD)
   *  and structural quality (QUALITY), plus the actual protein % to display. */
  proteinFormulation?: ProteinFormulationAssessment;
  /** One product-layer target-fit truth for Profile/Monitor/Preview/Production. */
  directionAssessment?: RecipeDirectionAssessment;
  /**
   * Product-layer flavour priority proof. Engine science remains unchanged:
   * the orchestration first fixes the best public technical-score class, then
   * maximises the whole Main set with one shared ratio-preserving scale and
   * finally lets the existing correction loop settle only the remaining
   * eligible lines.
   */
  mainObjective?: MainFlavourObjectiveProof;
  /**
   * Sorbet exact five-step Direction: the closed-form projection moved only
   * the canonical adjustable roles and kept every Main line byte-exact, so no
   * Main frontier proof exists for this proposal. The Apply door re-derives
   * the same exact candidate from the trusted draft instead.
   */
  mainHeldByExactDirection?: boolean;
  /** Owner 2026-08-22: which Sorbet Direction candidate generator produced the
   * executable proposal — the closed-form exact projection or the bounded
   * Main-constrained NEAREST search. Provenance only; the door re-derives it. */
  directionCandidateSource?: 'sorbet_exact_projection' | 'sorbet_nearest_search';
  iteration?: IterationDiagnostics;
  /** ACCEPTANCE ADDENDUM (3): residual violations on NATIVE approved bands in
   * the PROPOSED state (classified by `classifyViolationBands` provenance).
   * Non-empty ⇒ the preview is DIAGNOSTIC ONLY. The `commitPreview` door
   * re-derives this trustlessly from `proposedInput` — never from this field. */
  hardResidualMetrics?: string[];
  /** Exact per-metric Engine evidence for a diagnostic-only Preview. */
  residualMetricDiagnostics?: ResidualMetricDiagnostic[];
  /** ACCEPTANCE ADDENDUM (1+3) + owner addendum item 2: TRUE ⇒ diagnostic
   * preview — Apply is structurally disabled at the door (iteration cap,
   * hard-native residual, or non-approved formulation provenance).
   * Presentation marker only; the door enforces independently. */
  diagnosticOnly?: boolean;
  /** Owner addendum item 2 — WHICH honest explanation the card must render.
   * Presentation only; every one of these is enforced again at the door. */
  diagnosticReason?:
    | 'hard_residual'
    | 'iteration_cap'
    | 'reference_derived'
    | 'protein_claim_residual'
    | 'practicalization_blocked';
  /** Owner 2026-08-11: exact Engine candidate and the independently
   * Engine-recalculated whole-gram recipe the user will physically make.
   * Session-only Preview provenance; the practical input remains the sole
   * value that may cross Apply into the canonical recipe store. */
  practicalization?:
    | { status: 'ready'; audit: PracticalRecipeAudit }
    | {
        status: 'blocked';
        modelVersion: typeof PRACTICAL_RECIPE_MODEL_VERSION;
        failure: Extract<PracticalRecipeResult, { ok: false }>;
      };
  /** Audit provenance only. Apply requires a matching session authorization
   * and re-derives the exact permitted constraint transition. */
  suggestedFix?: SuggestedBoundFix;
  /** The proposed working state — applied ONLY through `commitPreview`. */
  proposedInput: RecipeInput;
  /** The constraint set in force AFTER apply (suggested fixes update a lock —
   * an explicit §18.2 user action; optimize/rescale keep the current set). */
  nextConstraints: ConstraintSet;
  lines: PreviewLineDiff[];
  /** Honest count of engine violations before/after (codes counted, no band
   * values) — the §19.1 impact line without Slice D's score adapter. */
  violationsBefore: number;
  violationsAfter: number;
  /** §20.4 Explain entries (domain-built, band-free). */
  explanation: ConstraintExplanationEntry[];
  /** Reproducibility trace for the §20.1 history record. */
  engineVersion: string;
  configVersion: string;
  createdAt: string;
}

export interface MainFlavourObjectiveProof {
  status: 'maximized' | 'best_achievable' | 'held_by_contract' | 'no_admissible_increase';
  startingMainGrams: number;
  exactAcceptedMainGrams: number;
  executableMainGrams: number;
  firstHigherRejectedGrams: number | null;
  firstHigherRejectedReason:
    | 'batch_or_constraints'
    | 'hard_gate'
    | 'technical_score_class'
    | 'main_identity'
    | 'certified_upper_bound'
    | null;
  technicalScore: number | null;
  attempts: number;
  /** Complete descending whole-gram search evidence. Optional on legacy
   * previews only; new Main technical-maximum previews always populate it. */
  searchUpperBoundGrams?: number;
  provenMaximum?: boolean;
  testedHigherCandidateCount?: number;
  limitingTechnicalRules?: string[];
  /** A safe mathematical upper bound. When the executable whole-gram point
   * equals this number, no larger real-valued (therefore no larger integer)
   * Main total can satisfy the relaxation's necessary technical conditions. */
  certifiedUpperBoundGrams?: number;
  proofKind?: 'linear_relaxation' | 'exact_contract' | 'heuristic_search';
}

const mainObjectiveCache = new WeakMap<
  RecipeInput,
  Map<string, { input: RecipeInput; proof: MainFlavourObjectiveProof | null }>
>();

/* ── shared helpers ──────────────────────────────────────────────────────── */

const violationCount = (result: RecipeResult): number => detectViolations(result).length;

/** The engine's own weighted out-of-band measure: total severity points (distance
 * beyond band edges in half-widths). A pure proportional rescale NEVER changes it
 * (per-100 g composition invariant) — only real solver actions can reduce it. */
const totalSeverity = (input: RecipeInput): number =>
  detectViolations(calculateRecipe(input)).reduce((sum, v) => sum + v.severity_points, 0);

const SEVERITY_EPS = 1e-9;

/**
 * The IMPROVEMENT BASELINE for a draft (owner P0 — no invented thresholds):
 * a proposal is acceptable only if it BEATS the null hypothesis for that draft.
 *  - Draft near its batch (±25%): the draft itself is the baseline.
 *  - Draft far off batch (all-1 g, empty): the null hypothesis is „just scale
 *    what you typed" — the proportional projection to the batch (equal split
 *    when the draft carries no mass at all). The owner's forbidden 8 × 125 g
 *    result IS this null, so it can never beat itself — while an approved
 *    template formulation beats it decisively or fails honestly.
 */
function improvementBaseline(current: RecipeInput): RecipeInput | null {
  const batch = current.target_batch_grams;
  if (!(batch > 0) || current.items.length === 0) return null;
  const sum = current.items.reduce((s, i) => s + i.planned_grams, 0);
  if (Math.abs(sum - batch) / batch <= 0.25) return current;
  const items =
    sum > 0
      ? current.items.map((i) => ({ ...i, planned_grams: (i.planned_grams / sum) * batch }))
      : current.items.map((i) => ({ ...i, planned_grams: batch / current.items.length }));
  return { ...current, items };
}

/**
 * Is the draft NEAR its target batch — i.e. is the draft ITSELF the null
 * hypothesis rather than „just scale what you typed"? Exactly the ±25 % band
 * `improvementBaseline` already uses (no new threshold): outside it, the
 * proportional projection IS the whole proposal (the forbidden 8 × 125 g
 * class); inside it, the composition is the user's recipe.
 */
function isNearTargetBatch(current: RecipeInput): boolean {
  const baseline = improvementBaseline(current);
  return baseline !== null && baseline === current;
}

/**
 * Is the draft a DIFFERENTIATED composition? A hollow draft whose positive
 * lines all carry the SAME grams projects onto an equal split (8 × 122 g → 8 ×
 * 125 g) — that projection is the null hypothesis and may never be presented
 * as a result. A real recipe always has differentiated grams.
 */
function isDifferentiatedComposition(current: RecipeInput): boolean {
  const positives = current.items.filter((item) => item.planned_grams > 0);
  if (positives.length < 2) return false;
  const first = positives[0]!.planned_grams;
  return positives.some(
    (item) => Math.abs(item.planned_grams - first) > Math.max(1e-9, first * 1e-6),
  );
}

/**
 * BATCH RECONCILIATION (owner CURRENT-DRAFT P0, primary root cause).
 *
 * A substantive, differentiated draft sitting OFF its target batch (955 g /
 * 1045 g against 1000 g) is not „already the best verified result" — it does
 * not even weigh what the user asked for. Reaching the hard batch equality is
 * a REQUIRED, legitimate outcome of „Przelicz z PI", so it must produce a real
 * Preview even when no further TECHNICAL improvement can be verified.
 *
 * It must NOT open the door for the owner's forbidden 8 × 125 g class, where
 * the proportional projection IS the entire proposal. The discriminators are
 * therefore, all required and all recomputable from the two inputs alone (the
 * Apply door re-derives them trustlessly — it never trusts a preview flag):
 *   1. the draft really was off batch by more than the tolerance;
 *   2. the draft is NEAR its target (the frozen ±25 % baseline band) — outside
 *      it the null hypothesis is the projection, not the draft;
 *   3. the draft is DIFFERENTIATED (never a uniform equal-split shape);
 *   4. the proposal really lands on the target batch;
 *   5. the proposal is not worse than the draft on the engine's own measures
 *      (never more violations, never more severity).
 * Engine-safety (no hard-native residual) and the batch invariant are enforced
 * by the existing gates and are deliberately NOT duplicated here.
 */
export function isBatchReconciliation(current: RecipeInput, proposed: RecipeInput): boolean {
  const target = current.target_batch_grams;
  if (!(target > 0)) return false;
  if (current.items.some((item) => item.actual_grams !== null)) return false;
  if (Math.abs(plannedSum(current) - target) <= BATCH_SUM_TOLERANCE_G) return false; // (1)
  // An explicit Multi-Main set is itself a substantive, non-uniform contract:
  // the user selected several positive identities and their coupled ratio.
  // The historical ±25% proximity guard exists to reject hollow proportional
  // projections (the 8 × 125 g class), not to discard a verified 1300→1000
  // correction that preserves that Crown group. Ordinary/single-Main drafts
  // remain subject to the frozen proximity rule.
  const hasExplicitMultiMain =
    current.items.filter((item) => item.lock_type === 'main' && item.planned_grams > 0).length > 1;
  if (!isNearTargetBatch(current) && !hasExplicitMultiMain) return false; // (2)
  if (!isDifferentiatedComposition(current)) return false; // (3)
  if (Math.abs(plannedSum(proposed) - target) > BATCH_SUM_TOLERANCE_G) return false; // (4)
  const before = detectViolations(calculateRecipe(current)).length;
  const after = detectViolations(calculateRecipe(proposed)).length;
  if (after > before) return false; // (5)
  return totalSeverity(proposed) <= totalSeverity(current) + SEVERITY_EPS;
}

/** Does `proposed` strictly beat the draft's null-hypothesis baseline? */
function beatsBaseline(current: RecipeInput, proposed: RecipeInput): boolean {
  const proposedViolations = detectViolations(calculateRecipe(proposed)).length;
  if (proposedViolations === 0) return true;
  const baseline = improvementBaseline(current);
  if (baseline === null) return false;
  const baselineViolations = detectViolations(calculateRecipe(baseline)).length;
  if (proposedViolations < baselineViolations) return true;
  return totalSeverity(proposed) < totalSeverity(baseline) - SEVERITY_EPS;
}

const isConstrained = (set: ConstraintSet, lineId: string): boolean => {
  const constraint = set.byLineId[lineId];
  return constraint !== undefined && constraint.mode !== 'ai';
};

/**
 * CANONICAL INGREDIENT IDENTITY (owner P0 — recalc duplication): the merge key
 * is the STABLE `ingredient.id` (PI-ING-* / canonical toolbox id). A solver ADD
 * whose ingredient already exists in the draft as a PLANNABLE line (unlocked,
 * nothing poured) must UPDATE that line, never append a parallel row — the
 * proven defect was `correction-dextrose-0`/`~2`/`~3` rows accumulating next to
 * the existing Dekstroza line across recalcs (1000 g → ~2928 g).
 *
 * Never merged: lines held by an engine lock (main/required/already_added), a
 * grams/range lock, or poured actuals — the engine's own top-up rule refuses to
 * change those, so a genuinely parallel line next to them stays separate.
 * Genuinely different ingredients (different stable ids) are never merged.
 */
export function mergeByCanonicalIdentity(base: RecipeInput, proposed: RecipeInput): RecipeInput {
  const baseIds = new Set(base.items.map((item) => item.id));
  // Solver-created rows use local presentation ids such as
  // `correction-inulin-0`. Persist the closed canonical identity on those new
  // rows before ProductBehavior resolution; existing catalog/private rows are
  // deliberately left byte-identical.
  const identityNormalizedProposed: RecipeInput = {
    ...proposed,
    items: proposed.items.map((item) =>
      baseIds.has(item.id) ? item : normalizeRecipeItemIdentity(item),
    ),
  };
  const seenIds = new Set<string>();
  const keepLineByIngredient = new Map<string, string>();
  const merged: { item: (typeof proposed.items)[number]; extraGrams: number }[] = [];
  let changed = false;

  for (const item of identityNormalizedProposed.items) {
    // A TRUE base line = the first occurrence of a base id. A solver add can
    // collide with a base id (`correction-dextrose-0` re-pushed next cycle),
    // so id membership alone is not enough — occurrence order decides.
    const isBaseLine = baseIds.has(item.id) && !seenIds.has(item.id);
    seenIds.add(item.id);
    const plannable = item.lock_type === 'unlocked' && item.actual_grams === null;
    const ingredientKey = canonicalIngredientId(item.ingredient);
    const keepLineId = plannable ? keepLineByIngredient.get(ingredientKey) : undefined;

    if (plannable && keepLineId !== undefined && !isBaseLine) {
      // Solver-added duplicate of an existing plannable line → fold grams in.
      const target = merged.find((entry) => entry.item.id === keepLineId);
      if (target) {
        target.extraGrams += item.planned_grams;
        changed = true;
        continue;
      }
    }
    if (plannable && keepLineId === undefined) {
      keepLineByIngredient.set(ingredientKey, item.id);
    }
    merged.push({ item, extraGrams: 0 });
  }

  if (!changed) return identityNormalizedProposed;
  return {
    ...identityNormalizedProposed,
    items: merged.map(({ item, extraGrams }) =>
      extraGrams > 0 ? { ...item, planned_grams: item.planned_grams + extraGrams } : item,
    ),
  };
}

/** Plannable-duplicate census: ingredient.id → number of unlocked, un-poured lines. */
const plannableCounts = (input: RecipeInput): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const item of input.items) {
    if (item.lock_type !== 'unlocked' || item.actual_grams !== null) continue;
    const ingredientKey = canonicalIngredientId(item.ingredient);
    counts.set(ingredientKey, (counts.get(ingredientKey) ?? 0) + 1);
  }
  return counts;
};

/**
 * DUPLICATE INVARIANT (owner P0 Phase 6): the proposal must not introduce a NEW
 * plannable duplicate of any canonical ingredient identity (pre-existing user
 * duplicates in the base are preserved, never multiplied).
 */
export function findNewDuplicateIngredients(base: RecipeInput, proposed: RecipeInput): string[] {
  const before = plannableCounts(base);
  const names: string[] = [];
  const nameByIngredient = new Map(
    proposed.items.map((item) => [canonicalIngredientId(item.ingredient), item.ingredient.name]),
  );
  for (const [ingredientId, count] of plannableCounts(proposed)) {
    if (count > Math.max(1, before.get(ingredientId) ?? 0)) {
      names.push(nameByIngredient.get(ingredientId) ?? ingredientId);
    }
  }
  return names;
}

/** Strict normal-recipe invariant: no repeated canonical ingredient at all. */
export function findCanonicalDuplicateIngredients(input: RecipeInput): string[] {
  const duplicateIds = new Set(canonicalDuplicateIds(input.items));
  const names = new Map(
    input.items.map((item) => [canonicalIngredientId(item.ingredient), item.ingredient.name]),
  );
  return [...duplicateIds].map((id) => names.get(id) ?? id);
}

/** Sum of planned grams — the visible batch total. */
export const plannedSum = (input: RecipeInput): number =>
  input.items.reduce((sum, item) => sum + item.planned_grams, 0);

/**
 * Re-apply the canonical mass implied by every active constraint without
 * leaking orchestration-only locks (for example the template stabilizer hold)
 * into the recipe shown to the user.
 *
 * This matters even when the candidate already sums to the requested batch:
 * a formulation seed can be batch-exact while a percentage-locked line has
 * drifted by a shared scale factor.
 */
function applyConstraintMassesPreservingLockTypes(
  candidate: RecipeInput,
  set: ConstraintSet,
): RecipeInput {
  const constrained = applyConstraintsToRecipe(candidate, set);
  if (!constrained.ok) return candidate;

  const originalLockTypeByLineId = new Map(
    candidate.items.map((item) => [item.id, item.lock_type] as const),
  );
  return {
    ...constrained.input,
    items: constrained.input.items.map((item) => {
      const originalLockType = originalLockTypeByLineId.get(item.id);
      return originalLockType !== undefined && item.lock_type !== originalLockType
        ? { ...item, lock_type: originalLockType }
        : item;
    }),
  };
}

/**
 * Solver moves are normalized back to the requested batch after every round.
 * Every positive Main line is held at the candidate's current group amount for
 * that normalization, so the generic rescaler can only redistribute the
 * technological envelope and cannot independently drift one flavour carrier.
 */
function rescalePreservingMainGroup(
  identityInput: RecipeInput,
  candidate: RecipeInput,
  set: ConstraintSet,
  targetBatchGrams: number,
  preserveCandidateMain = true,
  preserveUserTarget = true,
): ReturnType<typeof rescaleBatchToTarget> {
  const originalMainByLineId = new Map(
    candidate.items
      .filter((item) => item.lock_type === 'main')
      .map((item) => [item.id, item] as const),
  );
  const roleFlexibleCandidate: RecipeInput = preserveCandidateMain
    ? candidate
    : {
        ...candidate,
        items: candidate.items.map((item) =>
          item.lock_type === 'main' ? { ...item, lock_type: 'unlocked' as const } : item,
        ),
      };
  const userIntentAnchors = new Map(
    identityInput.items
      .filter(
        (item) =>
          item.lock_type === 'unlocked' &&
          (item.user_intent_anchor_grams ?? 0) > 0 &&
          item.planned_grams > 0,
      )
      .map((item) => [item.id, item] as const),
  );
  const candidateByLineId = new Map(
    roleFlexibleCandidate.items.map((item) => [item.id, item] as const),
  );
  const identityLineIds = new Set(identityInput.items.map((item) => item.id));
  const missingUserIntentAnchorLineIds = new Set(
    [...userIntentAnchors.keys()].filter((lineId) => !candidateByLineId.has(lineId)),
  );
  const presenceSafeCandidate: RecipeInput =
    userIntentAnchors.size === 0
      ? roleFlexibleCandidate
      : {
          ...roleFlexibleCandidate,
          items: [
            ...identityInput.items.flatMap((identityItem) => {
              const item = candidateByLineId.get(identityItem.id);
              const anchor = userIntentAnchors.get(identityItem.id);
              if (!item) {
                // A formulation seed may omit a positive Standard line. Restore
                // the exact user identity at the minimum executable presence;
                // the temporary normalization hold below keeps it at 1 g while
                // every other line absorbs the batch residual. This is not a
                // user gram lock and is never persisted as a constraint.
                return anchor ? [{ ...anchor, planned_grams: 1 }] : [];
              }
              if (!anchor) return [item];
              return [
                {
                  ...item,
                  user_intent_anchor_grams: anchor.user_intent_anchor_grams,
                  planned_grams: Math.max(1, item.planned_grams),
                },
              ];
            }),
            ...roleFlexibleCandidate.items.filter((item) => !identityLineIds.has(item.id)),
          ],
        };
  const constrainedCandidate = applyConstraintMassesPreservingLockTypes(presenceSafeCandidate, set);
  const byLineId = { ...set.byLineId };
  for (const lineId of missingUserIntentAnchorLineIds) {
    // Search-only presence authority. Existing user constraints remain
    // stronger and are copied above without modification.
    if (byLineId[lineId] === undefined) byLineId[lineId] = { mode: 'locked', grams: 1 };
  }
  if (preserveCandidateMain) {
    for (const main of captureMainIngredientIntent(identityInput)) {
      const current = constrainedCandidate.items.find(
        (item) =>
          item.id === main.lineId &&
          canonicalIngredientId(item.ingredient) === main.canonicalIngredientId &&
          item.lock_type === 'main',
      );
      if (!current || !(current.planned_grams > 0)) continue;
      byLineId[main.lineId] = { mode: 'locked', grams: current.planned_grams };
    }
  }
  if (preserveUserTarget) {
    for (const target of identityInput.items) {
      if (
        target.lock_type !== 'unlocked' ||
        target.actual_grams !== null ||
        target.user_target_grams === undefined ||
        !Number.isFinite(target.user_target_grams) ||
        target.user_target_grams < 0 ||
        isConstrained(set, target.id)
      ) {
        continue;
      }
      const current = constrainedCandidate.items.find((item) => item.id === target.id);
      if (!current || current.lock_type !== 'unlocked' || current.actual_grams !== null) continue;
      // Temporary normalization hold only. The item remains Standard/unlocked
      // in the returned recipe; hard locks and the Engine still decide whether
      // this exact candidate is feasible.
      byLineId[target.id] = { mode: 'locked', grams: current.planned_grams };
    }
  }
  const rescaled = rescaleBatchToTarget(constrainedCandidate, { byLineId }, targetBatchGrams);
  if (!rescaled.ok) return rescaled;
  if (
    [...userIntentAnchors].some(([lineId]) => {
      const item = rescaled.input.items.find((candidateItem) => candidateItem.id === lineId);
      return !item || item.planned_grams < 1;
    })
  ) {
    return { ok: false, reason: 'no_scalable_lines' };
  }
  if (preserveCandidateMain) return rescaled;
  return {
    ...rescaled,
    input: {
      ...rescaled.input,
      items: rescaled.input.items.map((item) => {
        const originalMain = originalMainByLineId.get(item.id);
        return originalMain
          ? {
              ...item,
              lock_type: 'main' as const,
              ...(originalMain.main_ratio_weight === undefined
                ? {}
                : { main_ratio_weight: originalMain.main_ratio_weight }),
            }
          : item;
      }),
    },
  };
}

/**
 * Solver ADD actions create new lines with `correction-<ingredient>-<index>`
 * ids; a SECOND apply in the same session can therefore push a duplicate id.
 * New (non-base) lines are renamed to the first free `<id>~N` — deterministic,
 * and never touches an existing line's identity (constraints stay keyed).
 * (After `mergeByCanonicalIdentity` this is a structural safety net only.)
 */
export function ensureUniqueLineIds(base: RecipeInput, proposed: RecipeInput): RecipeInput {
  const baseIds = new Set(base.items.map((item) => item.id));
  const seen = new Set<string>();
  let changed = false;
  const items = proposed.items.map((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      return item;
    }
    // Base ids are unique, so a duplicate is always a solver-added line.
    let suffix = 2;
    let candidate = `${item.id}~${suffix}`;
    while (seen.has(candidate) || baseIds.has(candidate)) {
      suffix += 1;
      candidate = `${item.id}~${suffix}`;
    }
    seen.add(candidate);
    changed = true;
    return { ...item, id: candidate };
  });
  return changed ? { ...proposed, items } : proposed;
}

/** Old→new diff per line (§19.1), locked lines flagged from the NEXT set. */
export function buildLineDiffs(
  before: RecipeInput,
  after: RecipeInput,
  nextConstraints: ConstraintSet,
): PreviewLineDiff[] {
  const afterById = new Map(after.items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const lines: PreviewLineDiff[] = [];

  for (const beforeItem of before.items) {
    seen.add(beforeItem.id);
    const afterItem = afterById.get(beforeItem.id);
    const locked = isConstrained(nextConstraints, beforeItem.id);
    if (!afterItem) {
      lines.push({
        lineId: beforeItem.id,
        name: beforeItem.ingredient.name,
        beforeGrams: beforeItem.planned_grams,
        afterGrams: null,
        kind: 'removed',
        locked,
      });
      continue;
    }
    const changed = !Object.is(afterItem.planned_grams, beforeItem.planned_grams);
    lines.push({
      lineId: beforeItem.id,
      name: beforeItem.ingredient.name,
      beforeGrams: beforeItem.planned_grams,
      afterGrams: afterItem.planned_grams,
      kind: changed ? 'changed' : 'unchanged',
      locked,
    });
  }

  for (const afterItem of after.items) {
    if (seen.has(afterItem.id)) continue;
    lines.push({
      lineId: afterItem.id,
      name: afterItem.ingredient.name,
      beforeGrams: null,
      afterGrams: afterItem.planned_grams,
      kind: 'added',
      locked: isConstrained(nextConstraints, afterItem.id),
    });
  }

  return lines;
}

const lockedIngredientNames = (input: RecipeInput, set: ConstraintSet): string[] =>
  input.items.filter((item) => isConstrained(set, item.id)).map((item) => item.ingredient.name);

/* ── preview builders ────────────────────────────────────────────────────── */

/**
 * Owner CURRENT-DRAFT P0 (Phase 4) — WHAT A STOP MUST PROVE.
 *
 * „The recipe already matches the reference template" is a RESEMBLANCE, not a
 * proof of optimality, and can never be a sufficient stop on its own. Every
 * terminal „no further safe improvement" state therefore carries this record:
 * how many solver rounds and current-draft sweeps really ran, which of the
 * user's own ingredients were offered to the optimizer and across which gram
 * range they were tested, which metrics are still limiting, and whether the
 * profile is scored on provisional bands at all.
 */
export interface BestSafeEvidence {
  /** Solver rounds really invoked. */
  solverInvocations: number;
  /** CURRENT-DRAFT candidate-vector sweeps really performed. */
  draftVectorSearches: number;
  /** Iteration rounds recorded (round 0 = the starting state). */
  iterations: number;
  /** The user's own adjustable lines, with the exact gram range tested. */
  testedCandidates: {
    ingredientName: string;
    currentGrams: number;
    testedFromGrams: number;
    testedToGrams: number;
  }[];
  /** Metrics still out of band on the terminal state (the limiting factors). */
  limitingMetrics: string[];
  /** TRUE ⇒ the profile is scored on provisional/fallback bands. */
  provisionalProfile: boolean;
}

export type BuildPreviewResult =
  | { ok: true; preview: ConstraintPreview }
  | { ok: false; code: 'invalid_constraints'; issues: ConstraintValidationIssue[] }
  | { ok: false; code: 'already_clean' }
  | {
      ok: false;
      code: 'standard_presence_removal_required';
      lineId: string;
      productName: string;
      currentGrams: number;
      bestAttemptedNonZeroGrams: number;
      limitingMetric: string;
      acceptedMin: number | null;
      acceptedMax: number | null;
      messagePl: string;
    }
  | { ok: false; code: 'practicalization_blocked'; lineIds: string[]; messagePl: string }
  | { ok: false; code: 'missing_prices'; lineIds: string[]; ingredientNames: string[] }
  /** Owner P0 (Przelicz z PI): a no-proposal failure carries the PROOF — the solver
   * really ran (invocation count) and these exact metrics stayed out of band. */
  | {
      ok: false;
      code: 'no_proposal';
      violatedMetrics?: string[];
      solverInvocations?: number;
      /** True only when the unchanged native-safe recipe is the verified
       * fixed point for the exact selected five-step Direction target. */
      directionTargetUnreached?: boolean;
      /** Owner P0 NIGHTLY (FAILURE 2): full iteration trajectory + stop reason. */
      iteration?: IterationDiagnostics;
    }
  /** Owner P0 (definitive fail): the pipeline PRODUCED a candidate but REJECTED it —
   * it did not improve the recipe (e.g. a batch-only rescale of an out-of-band
   * draft: 8 × 125 g with violations 9 → 9). Never presented as a preview. */
  | {
      ok: false;
      code: 'unsafe_proposal';
      violatedMetrics?: string[];
      solverInvocations?: number;
      /** True when the only change was the proportional batch rescale. */
      batchOnly?: boolean;
      /** Owner P0 NIGHTLY (FAILURE 2): full iteration trajectory + stop reason. */
      iteration?: IterationDiagnostics;
    }
  | { ok: false; code: 'apply_failed' }
  | { ok: false; code: 'line_missing' }
  | { ok: false; code: 'substitution_invalid'; reasons: string[]; messagePl: string }
  | { ok: false; code: 'rescale_invalid' }
  | { ok: false; code: 'rescale_actuals' }
  | { ok: false; code: 'rescale_no_scalable' }
  | { ok: false; code: 'rescale_locked_sum'; minimumBatchGrams: number }
  | {
      ok: false;
      code: 'main_ratio_conflict';
      lineIds: string[];
      ingredientNames: string[];
      messagePl: string;
    }
  | {
      ok: false;
      code: 'product_behavior_invalid';
      violations: MainEnvelopeViolation[];
      messagePl: string;
      /** Exact server reason codes retained for lifecycle routing. The normal
       * UI renders product names only; immutable snapshot identifiers remain
       * diagnostics/report data and are never shown to the customer. */
      productBehaviorIssues?: Array<{
        lineId: string;
        lineName: string;
        reasons: string[];
      }>;
    }
  | {
      ok: false;
      code: 'main_ingredient_unavailable';
      ingredientIds: string[];
      messagePl: string;
    }
  | {
      ok: false;
      code: 'vegan_ingredient_conflict';
      issues: VeganRecipeEligibilityIssue[];
      substitutions: VeganSubstitutionRecommendation[];
      messagePl: string;
    }
  | {
      ok: false;
      code: 'vegan_profile_constraint';
      issues: VeganProfileConstraintIssue[];
      messagePl: string;
      /** Non-appliable candidate retained only for calibration diagnostics. */
      diagnosticInput: RecipeInput;
    }
  /** Owner P0 (full formulation): no approved template for this profile ×
   * temperature — honest unsupported, never routed to another profile. */
  | { ok: false; code: 'unsupported_profile'; reason: string }
  /** A user-supplied role (fruit / plant base / chocolate) is missing and may
   * never be invented — precise missing-role stop with the Polish message. */
  | {
      ok: false;
      code: 'missing_required_role';
      role: string;
      messagePl: string;
      /** Picker-owned Base products that still require a real dose. Kept out
       * of Engine input semantics; the UI uses this only to return focus. */
      lineIds?: string[];
      /** Phase-1 role trace (QA) — how far the resolution got, per role. */
      roleTrace?: FormulationRoleTraceRow[];
    }
  /** Owner P0 NIGHTLY Phase 7(b) — the BEST-SAFE FIXED POINT: the local
   * corrector AND the template-seeded fallback both found no safe further
   * improvement, and every remaining out-of-band metric sits on a
   * PROVISIONAL/FALLBACK band (never a native approved one). This is an
   * explanatory terminal state, NOT a failure: the current recipe is the best
   * verified result for the chosen ingredients and constraints. */
  | {
      ok: false;
      code: 'best_safe_result';
      /** Proof: how many times the local solver was really invoked. */
      solverInvocations: number;
      /** Soft (provisional/fallback-band) metrics still out of range. */
      softViolatedMetrics: string[];
      /** Band provenance for the profile (calibration status). */
      bandSource: 'category_fallback' | 'temperature_fallback';
      /** The template the fallback seeded from (provenance ONLY — owner
       * CURRENT-DRAFT P0 Phase 4: resemblance to a reference template is NEVER
       * evidence of optimality and must never be presented as the stop reason). */
      templateId: string;
      templateStatus: TemplateStatus;
      stopReason: 'local_no_proposal' | 'template_fixed_point';
      /** Owner CURRENT-DRAFT P0 (Phase 4): the REAL evidence behind the stop —
       * what was searched, over which ingredients, across which gram range, and
       * which metrics are still limiting. Without this a stop is unprovable. */
      evidence: BestSafeEvidence;
      /** Owner P0 NIGHTLY (FAILURE 2): full iteration trajectory + stop reason. */
      iteration?: IterationDiagnostics;
    }
  /** Owner Agent 3 (dominant-lock infeasibility) + ACCEPTANCE ADDENDUM (1):
   * a constrained reformulation whose engine-verified move search exhausted
   * its deterministic budget WITHOUT proving a fixed point (`iteration_cap` —
   * the milk-900 / strawberry-900 signature) is NEVER an applicable recipe:
   * `iteration_cap` can NEVER be labelled best-achievable proof, whatever the
   * band provenance of the residual violations. Honest terminal state with
   * the EXACT conflicting constraint, (when computable) the deterministic,
   * engine-verified nearest feasible lock value found by bisection, and
   * (when deterministically applicable) the product-type alternative. A
   * VERIFIED fixed point with residual violations instead presents as the
   * proven best-achievable state (hard-native residuals are then blocked at
   * the Apply door — addendum 3 — soft/provisional ones stay applicable). */
  | {
      ok: false;
      code: 'impossible_under_constraints';
      /** The dominant held constraint (largest held grams) — the conflict. */
      conflict: {
        lineId: string;
        ingredientName: string;
        kind: 'locked' | 'range' | 'grams_lock';
        grams: number;
      } | null;
      /** Native approved bands still violated after the full move search. */
      hardViolatedMetrics: string[];
      /** Addendum (1): ALL residual out-of-band metrics (any provenance) —
       * the capped/degenerate evidence for provisional-band profiles. */
      residualViolatedMetrics: string[];
      /** TRUE when the deterministic iteration budget was exhausted without a
       * proven fixed point (the addendum-1 trigger). */
      capReached: boolean;
      /** Max grams of the conflicting lock for which a feasible formulation
       * exists (bisection, engine-verified); null when not computable. */
      nearestFeasibleGrams: number | null;
      /** Addendum (1): deterministic product-type alternative — set when the
       * conflicting lock is a FRUIT role and an approved template exists for
       * sorbet at this serving temperature (routing/UX only, no science). */
      alternativeProductType: 'sorbet' | null;
      solverInvocations: number;
      iteration: IterationDiagnostics;
      templateId: string;
      templateStatus: TemplateStatus;
    };

function mainSafePreview(
  input: RecipeInput,
  preview: ConstraintPreview,
  productBehaviorSnapshots?: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
): BuildPreviewResult {
  if (!positiveStandardPresencePreserved(input, preview.proposedInput)) {
    return {
      ok: false,
      code: 'unsafe_proposal',
      violatedMetrics: ['standard_presence_removal_not_allowed'],
    };
  }
  // One presentation contract for every Preview producer: if the executable
  // recipe still misses any supported active Direction axis, the served UI
  // must collect the same explicit best-achievable consent that commitPreview
  // independently requires. Formulation, local correction and promoted search
  // all converge here, so none can expose an Apply button without its token.
  const direction = assessRecipeDirection(
    preview.proposedInput,
    calculateRecipe(preview.proposedInput),
  );
  if (direction.active && direction.supportedAxisCount > 0 && !direction.reached) {
    preview.directionTargetUnreached = true;
  }
  if (preview.proposedInput.category === 'vegan_gelato') {
    const issues = veganRecipeEligibilityIssues(preview.proposedInput.items);
    if (issues.length > 0) {
      const substitutions = veganSubstitutionRecommendations(preview.proposedInput.items, issues);
      return {
        ok: false,
        code: 'vegan_ingredient_conflict',
        issues,
        substitutions,
        messagePl:
          'Receptura Wegańska zawiera składniki bez potwierdzonej zgodności Vegan: ' +
          issues.map((issue) => `${issue.ingredientName} [${issue.status}]`).join(', ') +
          '. PI nie usunie ich ani nie zastąpi po cichu.' +
          veganSubstitutionMessagePl(substitutions),
      };
    }
    const profileIssues = veganProfileConstraintIssues(preview.proposedInput);
    if (profileIssues.length > 0) {
      return {
        ok: false,
        code: 'vegan_profile_constraint',
        issues: profileIssues,
        messagePl: veganProfileConstraintMessagePl(profileIssues),
        diagnosticInput: preview.proposedInput,
      };
    }
  }
  if (normalizeFormulationStrategy(input.goals?.formulation_strategy ?? input.mode) === 'eco') {
    const flavour = verifyEcoFlavourProtection(input, preview.proposedInput, {
      productBehaviorSnapshots,
    });
    if (!flavour.ok) {
      return {
        ok: false,
        code: 'main_ratio_conflict',
        lineIds: [...new Set(flavour.violations.map((violation) => violation.lineId))],
        ingredientNames: [
          ...new Set(flavour.violations.map((violation) => violation.ingredientName)),
        ],
        messagePl:
          'ECO zablokowane: propozycja narusza tożsamość składnika smakowego lub proporcję grupy Głównej.',
      };
    }
  }
  const identity = verifyMainIngredientIdentity(
    input,
    preview.proposedInput,
    preview.nextConstraints.byLineId,
  );
  if (identity.ok) return { ok: true, preview };
  return {
    ok: false,
    code: 'main_ratio_conflict',
    lineIds: [...new Set(identity.violations.flatMap((violation) => violation.lineIds))],
    ingredientNames: [
      ...new Set(identity.violations.flatMap((violation) => violation.ingredientNames)),
    ],
    messagePl: mainIdentityViolationMessage(identity),
  };
}

/**
 * WHOLE-GRAM DIRECTION REPAIR (owner P1-A, 2026-08-23).
 *
 * The exact search can land INSIDE a Direction band and then have whole-gram
 * practicalization round it back out. Measured on the owner Fior di Latte:
 * Sweetness -1 solved to POD 13.974 (inside [13, 14]) but the executable recipe
 * read 14.04, so a genuinely achieved target was presented as NEAREST.
 *
 * This repair runs ONLY when the EXACT candidate satisfied the Direction
 * contract and the EXECUTABLE one does not - i.e. the miss was created by
 * rounding, never by the search. It searches whole-gram, mass-neutral exchanges
 * between adjustable lines, so the batch stays exact by construction, and it
 * accepts a candidate only when the engine still reports zero violations AND the
 * Direction assessment is genuinely reached. Bounded: |lines| x |lines| x 3.
 *
 * It never touches Main lines, locked/ranged lines, poured actuals, template-
 * controlled stabilizers, or P1-B held flavour accents.
 */
const repairDirectionWholeGramRounding = (
  exactInput: RecipeInput,
  executableInput: RecipeInput,
  set: ConstraintSet,
): RecipeInput | null => {
  if (exactInput.goals?.direction_targets_active !== true) return null;
  const exactAssessment = assessRecipeDirection(exactInput, calculateRecipe(exactInput));
  if (!exactAssessment.active || exactAssessment.supportedAxisCount === 0) return null;
  if (!exactAssessment.reached) return null;
  const executableResult = calculateRecipe(executableInput);
  if (assessRecipeDirection(executableInput, executableResult).reached) return null;
  if (detectViolations(executableResult).length > 0) return null;

  const flavourHeld = flavourHeldLineIds(executableInput);
  const movable = executableInput.items.filter(
    (item) =>
      item.lock_type === 'unlocked' &&
      item.actual_grams === null &&
      set.byLineId[item.id] === undefined &&
      item.percent_constraint === undefined &&
      item.grams_constraint === undefined &&
      !isTemplateControlledStabilizer(item.ingredient),
  );
  if (movable.length < 2) return null;

  for (const delta of [1, 2, 3]) {
    for (const donor of movable) {
      if (donor.planned_grams - delta < 1) continue;
      for (const receiver of movable) {
        if (receiver.id === donor.id) continue;
        if (flavourHeld.has(receiver.id)) continue;
        const candidate: RecipeInput = {
          ...executableInput,
          items: executableInput.items.map((item) =>
            item.id === donor.id
              ? { ...item, planned_grams: item.planned_grams - delta }
              : item.id === receiver.id
                ? { ...item, planned_grams: item.planned_grams + delta }
                : item,
          ),
        };
        const result = calculateRecipe(candidate);
        if (detectViolations(result).length > 0) continue;
        if (!assessRecipeDirection(candidate, result).reached) continue;
        return candidate;
      }
    }
  }
  return null;
};

const finishPreview = (
  kind: PreviewKind,
  titlePl: string,
  baseInput: RecipeInput,
  baseSet: ConstraintSet,
  proposedInput: RecipeInput,
  nextConstraints: ConstraintSet,
  violationsBefore: number,
  explanation: ConstraintExplanationEntry[],
  createdAt: string,
): ConstraintPreview => {
  const beforeResult = calculateRecipe(baseInput);
  // Protein Engine v2: EVERY preview route converges here, so this is the one
  // place that can guarantee a Protein candidate still earns its claim after
  // Main maximisation and the Direction segment have moved grams.
  // `baseSet` — the user's OWN locks — is the right authority here. The
  // post-preview `nextConstraints` marks solver-owned lines as non-AI, which
  // would leave the ladder with no adjustable pair at all.
  proposedInput = refineProteinFormulation(baseInput, proposedInput, baseSet);
  // Owner P1-B: whole-gram reconciliation may not top up a flavour accent.
  let practical = practicalizeRecipeCandidate(
    proposedInput,
    nextConstraints,
    flavourHeldLineIds(proposedInput),
  );
  let executableInput = practical.ok ? practical.audit.executableInput : proposedInput;
  // Owner P1-A: recover a Direction target the whole-gram rounding lost.
  if (practical.ok) {
    const repaired = repairDirectionWholeGramRounding(
      practical.audit.exactInput,
      executableInput,
      nextConstraints,
    );
    if (repaired !== null) {
      const repracticalized = practicalizeRecipeCandidate(
        repaired,
        nextConstraints,
        flavourHeldLineIds(repaired),
      );
      if (repracticalized.ok) {
        const repairedExecutable = repracticalized.audit.executableInput;
        // Accept only a genuine improvement: still engine-clean AND now inside
        // the Direction bands the exact candidate had already earned.
        if (
          detectViolations(calculateRecipe(repairedExecutable)).length === 0 &&
          assessRecipeDirection(repairedExecutable, calculateRecipe(repairedExecutable)).reached
        ) {
          practical = repracticalized;
          executableInput = repairedExecutable;
        }
      }
    }
  }
  // Protein Engine v2 — the boundary defect this repair exists for.
  //
  // Practicalization rounds the exact solver candidate to the whole grams the
  // user will physically weigh. Near the HIGH PROTEIN boundary that rounding is
  // large enough to cross it: a measured case entered practicalization
  // qualified and left it at 8.489 % protein against a requirement of
  // 8.4896 %, i.e. an energy share of 19.9988 %.
  //
  // The EXECUTABLE recipe is the one the user makes, so the claim has to hold
  // THERE. Re-run the ladder from the executable candidate and re-practicalize;
  // accept only if the round trip genuinely restores the frontier.
  if (baseInput.category === 'protein_gelato') {
    const beforeRounding = proteinFrontierRank(proposedInput) ?? 0;
    const afterRounding = proteinFrontierRank(executableInput) ?? 0;
    if (afterRounding < beforeRounding - 1e-9) {
      const repaired = refineProteinFormulation(baseInput, executableInput, baseSet);
      if (repaired !== executableInput) {
        const repracticalized = practicalizeRecipeCandidate(
          repaired,
          nextConstraints,
          flavourHeldLineIds(repaired),
        );
        const repairedExecutable = repracticalized.ok
          ? repracticalized.audit.executableInput
          : repaired;
        if ((proteinFrontierRank(repairedExecutable) ?? 0) > afterRounding + 1e-9) {
          practical = repracticalized;
          executableInput = repairedExecutable;
          proposedInput = repaired;
        }
      }
    }
  }
  const afterResult = practical.ok
    ? practical.audit.executableResult
    : calculateRecipe(proposedInput);
  const hardResiduals = new Set(classifyViolationBands(executableInput).hardMetrics);
  const beforeIndicators = new Map(beforeResult.indicators.map((row) => [row.key, row] as const));
  const afterIndicators = new Map(afterResult.indicators.map((row) => [row.key, row] as const));
  const metricLabels: Record<string, string> = {
    ice_fraction: 'Udział lodu',
    pod: 'Słodycz (POD)',
    npac: 'Miękkość (NPAC)',
    water: 'Woda',
    total_solids: 'Sucha masa',
    fat: 'Tłuszcz',
    protein: 'Białko',
    lactose: 'Laktoza',
    alcohol: 'Alkohol',
  };
  const distanceToBand = (value: number | null, min: number, max: number): number => {
    if (value === null || !Number.isFinite(value)) return 0;
    return value < min ? min - value : value > max ? value - max : 0;
  };
  const residualMetricDiagnostics: ResidualMetricDiagnostic[] = detectViolations(afterResult)
    .filter((violation) => violation.value !== null && violation.band !== null)
    .map((violation) => {
      const beforeValue = beforeIndicators.get(violation.metric)?.value ?? null;
      const indicator = afterIndicators.get(violation.metric);
      const proposedValue = violation.value!;
      const acceptedMin = violation.band!.min;
      const acceptedMax = violation.band!.max;
      const distanceBefore = distanceToBand(beforeValue, acceptedMin, acceptedMax);
      const distanceAfter = distanceToBand(proposedValue, acceptedMin, acceptedMax);
      const movement =
        distanceAfter < distanceBefore - 1e-9
          ? ('improved' as const)
          : distanceAfter > distanceBefore + 1e-9
            ? ('worsened' as const)
            : ('unchanged' as const);
      const status = hardResiduals.has(violation.metric)
        ? ('hard_block' as const)
        : ('advisory' as const);
      const valueUnit = violation.metric === 'pod' || violation.metric === 'npac' ? 'pkt' : '%';
      return {
        metric: violation.metric,
        labelPl: metricLabels[violation.metric] ?? violation.metric,
        valueUnit,
        distanceUnit: valueUnit === '%' ? 'pp' : 'pkt',
        beforeValue,
        proposedValue,
        acceptedMin,
        acceptedMax,
        distanceBefore,
        distanceAfter,
        movement,
        status,
        bandStatus: indicator?.band_status ?? null,
        categoryFallback: indicator?.category_fallback === true,
        temperatureFallback: indicator?.temperature_fallback === true,
        applyDisabledReasonPl:
          status === 'hard_block'
            ? 'Wynik nadal pozostaje poza zatwierdzonym zakresem. Zastosowanie jest wyłączone.'
            : 'Wynik pozostaje poza zakresem doradczym.',
      };
    });
  return {
    kind,
    titlePl,
    // Owner addendum item 4: computed HERE, from the two inputs, for EVERY
    // preview builder — there is no path that can produce a preview without it.
    outcomeClassification: classifyPreviewOutcome(baseInput, executableInput),
    // Owner GLOBAL SOFT-HOLD §9: measured against the USER BASELINE carried by
    // `baseInput` — the recipe on the user's screen — never candidate-against-
    // candidate. With no soft-held line the report is empty and every existing
    // flow is byte-identical.
    userIntent: (() => {
      const report = measureUserIntentDrift(
        buildUserIntentBaseline(baseInput, baseSet),
        executableInput,
      );
      return { totalDrift: report.total, lines: report.lines, material: report.material };
    })(),
    baseFingerprint: workingStateFingerprint(baseInput, baseSet),
    proposedInput: executableInput,
    nextConstraints,
    proteinFormulation: assessProteinFormulation(executableInput, afterResult),
    directionAssessment: assessRecipeDirection(executableInput, afterResult),
    lines: buildLineDiffs(baseInput, executableInput, nextConstraints),
    violationsBefore,
    violationsAfter: violationCount(afterResult),
    residualMetricDiagnostics,
    practicalization: practical.ok
      ? { status: 'ready', audit: practical.audit }
      : {
          status: 'blocked',
          modelVersion: PRACTICAL_RECIPE_MODEL_VERSION,
          failure: practical,
        },
    ...(practical.ok
      ? {}
      : {
          diagnosticOnly: true,
          diagnosticReason: 'practicalization_blocked' as const,
        }),
    explanation,
    engineVersion: afterResult.engine_version,
    configVersion: afterResult.config_version,
    createdAt,
  };
};

/** WHY a solver round produced no admissible move (owner P0 NIGHTLY FAILURE 2 —
 * a fixed point is distinguished from a missing candidate and from a
 * provisional-band-only conflict; never one generic bucket). */
export type NoProposalDetail =
  | 'solver_fixed_point' // engine found no safe/admissible improving move
  | 'missing_candidate' // engine diagnosis: no correction candidate exists
  | 'apply_failed' // a proposal existed but could not be applied
  | 'provisional_band_conflict'; // remaining violations sit ONLY on fallback bands

/* ── attempted-move log (owner Agent 3 — QA move-level evidence) ─────────── */

export type AttemptedMoveRejection =
  | 'missing_candidate' // engine diagnosis: no correction candidate exists
  | 'solver_fixed_point' // engine returned no admissible improving move
  | 'constrained_add_blocked' // §17 add-intent filter (constrained ingredient)
  | 'excluded_add_blocked' // never-reintroduce: user-excluded ingredient (Agent R handoff)
  | 'stabilizer_dosage_clamp' // approved Mapper dosage window
  | 'product_behavior_dosage_clamp' // exact frozen per-line ProductBehavior range
  /** Owner CURRENT-DRAFT P0: the engine's REDUCE path picks the dominant
   * contributor from `lock_type` alone and cannot see the §17 padlock layer —
   * a move onto an exact-locked / range-held LINE is refused here, so a
   * locked line can never be moved even inside a Preview. */
  | 'constrained_line_blocked'
  | 'apply_failed' // proposal existed but could not be applied
  | 'no_metric_improvement' // applied, verified NOT improving → reverted
  /** Owner CURRENT-DRAFT P0 (Phase 2/3): the whole CURRENT-DRAFT candidate
   * vector was tested line by line and no gram move improved the engine's own
   * measure — the fixed point is proven over the user's OWN ingredients, not
   * merely over the engine's ADD catalogue. */
  | 'draft_vector_no_improvement';

/** One row of the per-move QA evidence log: what move the engine offered, what
 * happened to it and the exact metric deltas for applied/reverted moves. */
export interface AttemptedMoveLogEntry {
  round: number;
  /** Compact description of the exact engine actions ('none' when the engine
   * returned no actionable move this round). */
  move: string;
  outcome: 'applied' | 'rejected' | 'none';
  rejectionReason: AttemptedMoveRejection | null;
  violationsBefore: number;
  severityBefore: number;
  /** Post-move metrics for applied / reverted moves (null when never applied). */
  violationsAfter: number | null;
  severityAfter: number | null;
}

const describeActions = (proposal: CorrectionProposal): string =>
  proposal.actions.length === 0
    ? 'none'
    : proposal.actions
        .map((action) => `${action.type} ${action.ingredient_id} ${action.grams.toFixed(1)} g`)
        .join(' + ');

/**
 * CAPACITY DEFERRAL (Agent 1 §4 deciding mechanism — Agent 3 repair): the
 * engine's capacity gate judges the PRE-restore hypothetical mass
 * (verify.ts), while this pipeline restores the batch to its target AFTER
 * every round — so with `machine_capacity_grams === target_batch_grams` (the
 * natural Pro setting) EVERY add of ≥ 0.05 g was capacity-rejected and the
 * solver was structurally disabled. Deferring the capacity check to the
 * pipeline is SAFE exactly when the restore guarantee holds: planning lines
 * only (no poured actuals) and the target batch itself fits the machine —
 * the restored final mass equals the target batch, so the REAL capacity
 * constraint is re-established by construction (and the Apply door's batch
 * invariant enforces the restored sum). When the target does NOT fit the
 * machine, the capacity stays with the engine — nothing is deferred.
 */
const solverInputWithDeferredCapacity = (current: RecipeInput): RecipeInput => {
  const deferrable =
    current.machine_capacity_grams !== null &&
    current.target_batch_grams <= current.machine_capacity_grams &&
    current.items.every((item) => item.actual_grams === null);
  return deferrable ? { ...current, machine_capacity_grams: null } : current;
};

/** One solver round: propose → filter (§17 add-intent + NEVER-REINTRODUCE
 * exclusions + approved stabilizer dosage clamp) → apply. PURE helper. Also
 * reports every candidate the filter rejected (owner Agent 3 — the
 * attempted-move log).
 *
 * NEVER-REINTRODUCE (Agent R handoff, 2026-07-24): a solver ADD whose
 * ingredient the user explicitly excluded/marked unavailable — under the
 * engine candidate id OR the stable canonical Mapper id (the SAME matching as
 * `isToolboxCandidateExcluded`) — is filtered here, so the LOCAL-correction
 * route can no longer re-add an excluded ingredient (the formulation route
 * already honored exclusions at the seed; this closes the solver-round gap on
 * BOTH routes). */
function solveOneRound(
  current: RecipeInput,
  constrainedIngredientIds: ReadonlySet<string>,
  excludedIngredientIds: ReadonlySet<string>,
  /** §17-held LINE ids — the padlock layer the engine's own rules cannot see. */
  heldLineIds: ReadonlySet<string> = new Set(),
):
  | {
      applied: RecipeInput;
      proposal: CorrectionProposal;
      filtered: { move: string; reason: AttemptedMoveRejection }[];
    }
  | {
      applied: null;
      violated: string[];
      detail: NoProposalDetail;
      filtered: { move: string; reason: AttemptedMoveRejection }[];
    } {
  const solverInput = solverInputWithDeferredCapacity(current);
  const context = recipeContext(solverInput);
  const directionPlan = buildRecipeDirectionPlan(solverInput);
  const proposed = proposeAutoFix({
    input: solverInput,
    context,
    exactCorrectionGrams: true,
    targetBandOverride: directionPlan.bands,
  });
  const violated = [...new Set(recipeDirectionViolations(current).map((v) => v.metric))];
  if (proposed.redacted) {
    return { applied: null, violated, detail: 'solver_fixed_point', filtered: [] };
  }
  const filtered: { move: string; reason: AttemptedMoveRejection }[] = [];
  let proposal: CorrectionProposal | undefined;
  for (const candidate of proposed.proposals) {
    if (candidate.actions.length === 0) continue;
    // An ADD for a canonical ingredient already in the recipe becomes a
    // top-up of that stable line. A held/poured copy cannot be topped up and
    // blocks the move instead of creating a semantic duplicate.
    const canonicalCandidate: CorrectionProposal = {
      ...candidate,
      actions: candidate.actions.map((action) => {
        if (action.type !== 'add' || action.target_line_id !== undefined) return action;
        const canonicalId = canonicalIngredientIdFromSourceId(action.ingredient_id);
        const existing = current.items.find(
          (item) => canonicalIngredientId(item.ingredient) === canonicalId,
        );
        if (
          existing &&
          existing.lock_type === 'unlocked' &&
          existing.actual_grams === null &&
          !heldLineIds.has(existing.id)
        ) {
          return { ...action, target_line_id: existing.id };
        }
        return action;
      }),
    };
    const addBlocked = canonicalCandidate.actions.some((action) => {
      if (action.type !== 'add' || action.target_line_id !== undefined) return false;
      const canonicalId = canonicalIngredientIdFromSourceId(action.ingredient_id);
      return (
        constrainedIngredientIds.has(canonicalId) ||
        current.items.some((item) => canonicalIngredientId(item.ingredient) === canonicalId)
      );
    });
    // NEVER-REINTRODUCE (Agent R handoff): a solver ADD of an explicitly
    // excluded ingredient — engine id OR canonical Mapper id — is rejected.
    const excludedBlocked = canonicalCandidate.actions.some(
      (action) =>
        action.type === 'add' &&
        isToolboxCandidateExcluded(action.ingredient_id, excludedIngredientIds),
    );
    // Owner Phase 9 (approved-bounds wiring): a solver action may never move a
    // registered stabilizer outside its approved Mapper window.
    const dosageBlocked = canonicalCandidate.actions.some((action) =>
      violatesInternalStabilizerProfileAuthority(current, action),
    );
    // Owner CURRENT-DRAFT P0 — §17 LINE HOLD: the engine's REDUCE path selects
    // the dominant contributor from `lock_type` alone and is blind to the §17
    // padlock layer, so a `locked`/`range` line could be moved INSIDE a
    // preview (the Apply door then refused it — an honest but useless dead
    // end). Any action targeting a held line is refused here instead.
    const heldLineBlocked = canonicalCandidate.actions.some(
      (action) => action.target_line_id !== undefined && heldLineIds.has(action.target_line_id),
    );
    if (!addBlocked && !excludedBlocked && !dosageBlocked && !heldLineBlocked) {
      proposal = canonicalCandidate;
      break;
    }
    filtered.push({
      move: describeActions(candidate),
      reason: addBlocked
        ? 'constrained_add_blocked'
        : excludedBlocked
          ? 'excluded_add_blocked'
          : heldLineBlocked
            ? 'constrained_line_blocked'
            : 'stabilizer_dosage_clamp',
    });
  }
  if (!proposal) {
    // Distinguish the engine's own diagnosis: an actions-empty blocked/
    // impossible proposal names its blocking constraint.
    const diagnosed = proposed.proposals.find((candidate) => candidate.actions.length === 0);
    const detail: NoProposalDetail =
      diagnosed?.blocking?.constraint === 'no_candidate'
        ? 'missing_candidate'
        : 'solver_fixed_point';
    return { applied: null, violated, detail, filtered };
  }
  const applied = applyAutoFix({ input: solverInput, proposal, context });
  if (!applied.success) return { applied: null, violated, detail: 'apply_failed', filtered };
  // The deferred capacity is presentation-invariant: restore the ORIGINAL
  // machine capacity on the applied state (only grams may differ).
  const newInput =
    solverInput === current
      ? applied.newInput
      : { ...applied.newInput, machine_capacity_grams: current.machine_capacity_grams };
  return { applied: newInput, proposal, filtered };
}

/**
 * Max verified-improvement rounds per recalculation (owner P0 NIGHTLY
 * FAILURE 2): the DETERMINISTIC convergence guard. Iteration continues WHILE a
 * verified improvement exists and stops ONLY at: all bands in range, a
 * verified fixed point (no improving move), this cap (REPORTED honestly via
 * `IterationDiagnostics.capped`) or a hard incompatibility upstream.
 */
export const MAX_SOLVER_ROUNDS = 18;

export interface IterationRoundDiagnostic {
  /** 0 = the starting state; N = the state after the N-th applied round. */
  round: number;
  violations: number;
  /** The engine's own weighted out-of-band measure (severity points). */
  severityPoints: number;
}

export type IterationStopReason =
  | 'all_bands_in_range' // 10/10 — nothing left out of band
  | 'fixed_point_no_proposal' // solver returned no admissible move (see detail)
  | 'no_improving_move' // a move existed but verifiably improved nothing — reverted
  | 'protein_best_formulation'
  | 'protein_best_achievable'
  | 'iteration_cap'; // deterministic guard hit — deterministic guard, reported honestly

/**
 * Owner CURRENT-DRAFT P0 (Phase 1 — instrumentation): WHAT the optimizer was
 * actually given for this draft revision, captured per optimization run so a
 * ledger/QA readout can PROVE that the user's current lines and their current
 * grams reached the solver (never a stale or reference draft).
 */
export interface CandidateVectorDiagnostic {
  lineId: string;
  ingredientId: string;
  ingredientName: string;
  /** The grams the optimizer received for this line — the CURRENT draft value. */
  currentGrams: number;
  increasable: boolean;
  /** The exact gram values the optimizer tested this line at. */
  testedGrams: number[];
}

export interface IterationDiagnostics {
  /** How many times the canonical solver was REALLY invoked. */
  solverInvocations: number;
  /** Owner CURRENT-DRAFT P0: how many times the CURRENT-DRAFT candidate vector
   * (every unlocked selected line) was really searched. */
  draftVectorSearches: number;
  /** Owner CURRENT-DRAFT P0 (Phase 1): the candidate vector as passed to the
   * optimizer on the FIRST round — the proof of what the optimizer saw. Grams
   * are the BATCH-RECONCILED values the search really worked on; the untouched
   * draft values are in `draftLineGrams` below. */
  candidateVector: CandidateVectorDiagnostic[];
  /** Owner Phase 1 — THE anti-staleness proof: the user's CURRENT draft as the
   * optimizer received it, BEFORE any batch reconciliation (the 955 g / 1045 g
   * question: did the optimizer get the real total or a stale 1000 g?). */
  draftPlannedSumGrams: number;
  draftLineGrams: { lineId: string; ingredientId: string; grams: number }[];
  /** Total planned mass the search STARTED from (after batch reconciliation). */
  startPlannedSumGrams: number;
  /** The target batch the optimizer reconciled to. */
  targetBatchGrams: number;
  /** Per-round violation/severity trajectory (round 0 = start). */
  rounds: IterationRoundDiagnostic[];
  stopReason: IterationStopReason;
  /** Sub-classification when the solver returned no move (null otherwise). */
  stopDetail: NoProposalDetail | null;
  /** TRUE only when the cap fired while improvement was still in progress. */
  /** Product target assessment at the exact final candidate. */
  proteinFormulation?: ProteinFormulationAssessment;
  capped: boolean;
  /** Owner Agent 3 — the per-move QA evidence log: every move the engine
   * offered, filtered, applied or reverted, with metric deltas and the exact
   * rejection reason. The `no_feasible_improvement` proof lives here. */
  attemptedMoves: AttemptedMoveLogEntry[];
}

/**
 * ITERATE the canonical solver to a VERIFIED fixed point (owner P0 NIGHTLY
 * FAILURE 2 — „stops after 1 round" repair). Deterministic: same input → same
 * rounds → same result (the engine solver is deterministic and this loop adds
 * no randomness). Each applied round must STRICTLY improve (fewer violations
 * or lower engine severity after canonical-identity merge + batch restoration)
 * — a non-improving move is reverted and ends the loop as the verified fixed
 * point. Fallback/provisional bands GUIDE the iteration exactly like native
 * bands (the honest partial-score labelling is a separate, kept concern);
 * band provenance is classified in `stopDetail` when the loop stops on
 * remaining soft-only violations.
 */
function iterateSolverToFixedPoint(
  base: RecipeInput,
  start: RecipeInput,
  constrainedIngredientIds: ReadonlySet<string>,
  restore: (candidate: RecipeInput) => RecipeInput,
  excludedIngredientIds: ReadonlySet<string> = new Set(),
  /** Owner CURRENT-DRAFT P0 (Phase 3): the §17 set, so EVERY unlocked selected
   * line becomes an adjustable candidate for the optimizer. */
  set: ConstraintSet = { byLineId: {} },
  priceOverrides: CustomerPriceIndex = {},
  // Protein v2 removed the `probeLowerProteinTargets` parameter that used to
  // sit here. The v1 solver bisected DOWNWARD from an infeasible USER-REQUESTED
  // protein target; there is no user target any more, and
  // `fitProteinFormulation` sweeps its own bounded ladder instead.
  minimumProteinScore: number | null = null,
  productBehaviorSnapshots?: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
): {
  working: RecipeInput;
  lastProposal: CorrectionProposal | null;
  violated: string[];
  diagnostics: IterationDiagnostics;
} {
  // Stabilizer dosage windows are safety clamps, not an Engine activity
  // gradient. Keep every current stabilizer dose as an internal solver hold in
  // the canonical corrector, draft-vector, ECO and Protein paths. The hold is
  // deliberately not persisted as a user-visible §17 lock.
  const solverSet = solverHolds(start, set);
  // THE USER-INTENT BASELINE of this solve (owner §9). `base` is the recipe the
  // user actually entered; `start` may already be a full-formulation TEMPLATE
  // seed. Anchoring to `start` made every later move look close to the template
  // and erased the user's vector before ranking even began. Capture `x_user`
  // once and never re-derive it from a seed or intermediate candidate.
  const userIntentBaseline = buildUserIntentBaseline(base, solverSet);
  const measure = (candidate: RecipeInput): DraftStateMeasure => {
    const list = recipeDirectionViolations(candidate);
    return {
      violations: list.length,
      severityPoints: list.reduce((sum, violation) => sum + violation.severity_points, 0),
      // Ranks strictly below hard legality + engine severity and strictly above
      // cost (owner §8). With an empty baseline this is 0 for every candidate,
      // so ranking is byte-identical to the pre-soft-hold behaviour.
      userIntentDrift: userIntentDriftTotal(userIntentBaseline, candidate),
    };
  };

  let working = start;
  let current = measure(working);
  const rounds: IterationRoundDiagnostic[] = [{ round: 0, ...current }];
  const attemptedMoves: AttemptedMoveLogEntry[] = [];
  let lastProposal: CorrectionProposal | null = null;
  let violated: string[] = [];
  let solverInvocations = 0;
  let draftVectorSearches = 0;
  // §17 padlock layer, resolved to LINE ids once (the engine cannot see it).
  const heldLineIds = new Set(
    Object.entries(solverSet.byLineId)
      .filter(([, constraint]) => constraint.mode !== 'ai')
      .map(([lineId]) => lineId),
  );
  // Owner Phase 1 instrumentation: the candidate vector of the STARTING state.
  const candidateVector: CandidateVectorDiagnostic[] = buildDraftCandidateVector(
    start,
    solverSet,
    excludedIngredientIds,
  ).map((candidate) => ({
    lineId: candidate.lineId,
    ingredientId: candidate.ingredientId,
    ingredientName: candidate.ingredientName,
    currentGrams: candidate.currentGrams,
    increasable: candidate.increasable,
    testedGrams: candidate.testedGrams,
  }));
  // Definite assignment: every loop exit path assigns a stop reason.
  let stopReason!: IterationStopReason;
  let stopDetail: NoProposalDetail | null = null;
  let capped = false;

  for (let round = 1; ; round += 1) {
    if (current.violations === 0) {
      if (working.category === 'protein_gelato') {
        const targetFit = fitProteinFormulation(working, solverSet, [...excludedIngredientIds]);
        if (targetFit.changed) {
          // The Main frontier only needs to prove preservation of the already
          // selected Protein score class. `fitProteinFormulation` has already
          // run its complete product-layer ladder from this candidate; once
          // that result reaches the required class, repeating the same search
          // from successive partial states cannot improve the lexicographic
          // Main decision. Normal Protein formulation keeps the historical
          // progressive-fit behaviour through the default `null` threshold.
          if (
            minimumProteinScore !== null &&
            (targetFit.assessment.score ?? -Infinity) < minimumProteinScore
          ) {
            stopReason = 'protein_best_achievable';
            break;
          }
          const next = measure(targetFit.input);
          attemptedMoves.push({
            round,
            move: `protein-formulation ${targetFit.sourceLineId ?? 'source'} ↔ ${targetFit.balancingLineId ?? 'balance'}`,
            outcome: 'applied',
            rejectionReason: null,
            violationsBefore: current.violations,
            severityBefore: current.severityPoints,
            violationsAfter: next.violations,
            severityAfter: next.severityPoints,
          });
          working = targetFit.input;
          current = next;
          rounds.push({ round, ...next });
          if (minimumProteinScore !== null) {
            stopReason = targetFit.assessment.qualification.qualified
              ? 'protein_best_formulation'
              : 'protein_best_achievable';
            break;
          }
          continue;
        }
        stopReason = targetFit.assessment.qualification.qualified
          ? 'protein_best_formulation'
          : 'protein_best_achievable';
        break;
      }
      stopReason = 'all_bands_in_range';
      break;
    }
    if (round > MAX_SOLVER_ROUNDS) {
      stopReason = 'iteration_cap';
      capped = true;
      violated = [...new Set(recipeDirectionViolations(working).map((v) => v.metric))];
      break;
    }
    const outcome = solveOneRound(
      working,
      constrainedIngredientIds,
      excludedIngredientIds,
      heldLineIds,
    );
    solverInvocations += 1;
    // Owner Agent 3 — QA move log: candidates the §17/dosage filter rejected.
    for (const rejected of outcome.filtered) {
      attemptedMoves.push({
        round,
        move: rejected.move,
        outcome: 'rejected',
        rejectionReason: rejected.reason,
        violationsBefore: current.violations,
        severityBefore: current.severityPoints,
        violationsAfter: null,
        severityAfter: null,
      });
    }

    /**
     * Owner CURRENT-DRAFT P0 (Phase 2/3) — SECOND TIER: the CURRENT-DRAFT
     * candidate vector. The canonical solver ALWAYS runs first and keeps
     * absolute priority (existing behaviour is byte-identical whenever it
     * produces an improving move); only where it stops does the optimizer now
     * additionally test the draft's OWN unlocked lines as adjustable
     * quantities. „Not in the reference template" therefore no longer means
     * „not adjustable" — and a fixed point is only ever claimed after the
     * user's own ingredients were really tried.
     */
    const searchDraftVector = (): DraftSweepResult | null => {
      draftVectorSearches += 1;
      const constraints = {
        context: recipeContext(working),
        mode: working.mode,
        allow_main_ingredient_reduction: false,
        // Capacity is re-established by construction after every accepted line.
        machine_capacity_grams: null,
        // Scale for the user-intent reduction floor (owner SOFT-HOLD).
        target_batch_grams: working.target_batch_grams,
      } as const;
      const normalize = (candidate: RecipeInput) =>
        restore(ensureUniqueLineIds(base, mergeByCanonicalIdentity(base, candidate)));

      const hasExactDirectionObjective = hasActiveExactDirectionObjective(base);
      if (
        normalizeFormulationStrategy(base.goals?.formulation_strategy ?? base.mode) === 'eco' &&
        !hasExactDirectionObjective
      ) {
        return sweepEcoDraftCost({
          identityInput: base,
          start: working,
          set: solverSet,
          excludedIngredientIds,
          constraints,
          normalize,
          priceOverrides,
          productBehaviorSnapshots,
        });
      }
      // When an approved exact Direction target is active, fit outranks cost
      // in ECO. Use the same canonical measure as OPTIMAL until the target is
      // reached; inactive and unsupported profiles keep their prior ECO path.
      // Owner P1-A: the paired-exchange pass may only fire when a Direction
      // preference is the ONLY residual — the recipe is otherwise engine-clean.
      const directionOnlyResidual =
        hasExactDirectionObjective && detectViolations(calculateRecipe(working)).length === 0;
      return sweepDraftCandidateVector({
        start: working,
        set: solverSet,
        userIntentBaseline,
        excludedIngredientIds,
        constraints,
        normalize,
        measure,
        startMeasure: current,
        directionOnlyResidual,
      });
    };

    if (outcome.applied === null) {
      const drafted = searchDraftVector();
      if (drafted !== null) {
        attemptedMoves.push({
          round,
          move: drafted.moves.map(describeDraftAdjustment).join(' + '),
          outcome: 'applied',
          rejectionReason: null,
          violationsBefore: current.violations,
          severityBefore: current.severityPoints,
          violationsAfter: drafted.measure.violations,
          severityAfter: drafted.measure.severityPoints,
        });
        working = drafted.input;
        current = drafted.measure;
        rounds.push({ round, ...drafted.measure });
        continue;
      }
      attemptedMoves.push({
        round,
        move: 'none',
        outcome: 'none',
        rejectionReason:
          outcome.detail === 'provisional_band_conflict' ? 'solver_fixed_point' : outcome.detail,
        violationsBefore: current.violations,
        severityBefore: current.severityPoints,
        violationsAfter: null,
        severityAfter: null,
      });
      attemptedMoves.push({
        round,
        move: `draft-vector (${candidateVector.length} adjustable lines)`,
        outcome: 'none',
        rejectionReason: 'draft_vector_no_improvement',
        violationsBefore: current.violations,
        severityBefore: current.severityPoints,
        violationsAfter: null,
        severityAfter: null,
      });
      violated = outcome.violated;
      stopReason = 'fixed_point_no_proposal';
      stopDetail = outcome.detail;
      break;
    }
    const candidate = restore(
      ensureUniqueLineIds(base, mergeByCanonicalIdentity(base, outcome.applied)),
    );
    const next = measure(candidate);
    const exactDirectionActive = hasActiveExactDirectionObjective(base);
    const improved =
      (!exactDirectionActive || next.violations <= current.violations) &&
      (next.violations < current.violations ||
        next.severityPoints < current.severityPoints - SEVERITY_EPS);
    attemptedMoves.push({
      round,
      move: describeActions(outcome.proposal),
      outcome: improved ? 'applied' : 'rejected',
      rejectionReason: improved ? null : 'no_metric_improvement',
      violationsBefore: current.violations,
      severityBefore: current.severityPoints,
      violationsAfter: next.violations,
      severityAfter: next.severityPoints,
    });
    if (!improved) {
      // The solver's own move did not improve — before declaring a fixed point,
      // the CURRENT-DRAFT candidate vector must be searched (owner Phase 2/3).
      const drafted = searchDraftVector();
      if (drafted !== null) {
        attemptedMoves.push({
          round,
          move: drafted.moves.map(describeDraftAdjustment).join(' + '),
          outcome: 'applied',
          rejectionReason: null,
          violationsBefore: current.violations,
          severityBefore: current.severityPoints,
          violationsAfter: drafted.measure.violations,
          severityAfter: drafted.measure.severityPoints,
        });
        working = drafted.input;
        current = drafted.measure;
        rounds.push({ round, ...drafted.measure });
        continue;
      }
      attemptedMoves.push({
        round,
        move: `draft-vector (${candidateVector.length} adjustable lines)`,
        outcome: 'none',
        rejectionReason: 'draft_vector_no_improvement',
        violationsBefore: current.violations,
        severityBefore: current.severityPoints,
        violationsAfter: null,
        severityAfter: null,
      });
      // Verified fixed point: neither the engine solver's move nor ANY move of
      // the current-draft candidate vector improved the engine's own measure.
      stopReason = 'no_improving_move';
      violated = [...new Set(detectViolations(calculateRecipe(working)).map((v) => v.metric))];
      break;
    }
    working = candidate;
    lastProposal = outcome.proposal;
    current = next;
    rounds.push({ round, ...next });
  }

  // Band-provenance sub-classification (owner FAILURE 2): remaining violations
  // that sit ONLY on provisional/fallback bands are named as such.
  if (
    (stopReason === 'fixed_point_no_proposal' || stopReason === 'no_improving_move') &&
    current.violations > 0
  ) {
    const bands = classifyViolationBands(working);
    if (bands.hardMetrics.length === 0 && bands.softMetrics.length > 0) {
      stopDetail = 'provisional_band_conflict';
    }
  }

  return {
    working,
    lastProposal,
    violated,
    diagnostics: {
      solverInvocations,
      draftVectorSearches,
      candidateVector,
      draftPlannedSumGrams: plannedSum(base),
      draftLineGrams: base.items.map((item) => ({
        lineId: item.id,
        ingredientId: canonicalIngredientId(item.ingredient),
        grams: item.planned_grams,
      })),
      startPlannedSumGrams: plannedSum(start),
      targetBatchGrams: start.target_batch_grams,
      rounds,
      stopReason,
      proteinFormulation: assessProteinFormulation(working),
      stopDetail,
      capped,
      attemptedMoves,
    },
  };
}

const MAIN_OBJECTIVE_EPSILON_G = 0.05;
const MAIN_OBJECTIVE_MAX_PROBES = 16;

type MainObjectiveProbe =
  | { ok: true; input: RecipeInput; mainGrams: number; score: number | null }
  | {
      ok: false;
      mainGrams: number;
      reason: 'batch_or_constraints' | 'hard_gate' | 'technical_score_class' | 'main_identity';
    };

/**
 * FINAL Protein refinement (Protein Engine v2).
 *
 * The solver applies `fitProteinFormulation` mid-loop, but Main maximisation and
 * the hard-safe Direction segment run AFTERWARDS and move grams. Those stages
 * only promise to PRESERVE the protein frontier rank they were handed, so a
 * candidate that was a hundredth of a point short of the HIGH PROTEIN claim
 * stayed short all the way to the Preview.
 *
 * Measured case: 8.489 % protein against a requirement of 8.4896 %, i.e. an
 * energy share of 19.9988 % — natively hard-safe, Direction-clean, and not a
 * Protein product. Re-running the ladder on the FINAL candidate lifts it to
 * 9.0 % / 21.2 % of energy.
 *
 * Strictly additive and fail-closed: the refinement is accepted only when it
 * improves the protein frontier rank AND preserves everything the later stages
 * had already won — Main grams, native hard-safety and Direction.
 */
function refineProteinFormulation(
  identityInput: RecipeInput,
  candidate: RecipeInput,
  set: ConstraintSet,
): RecipeInput {
  if (candidate.category !== 'protein_gelato') return candidate;
  if (candidate.items.some((item) => item.actual_grams !== null)) return candidate;

  // Qualification is the explicit Protein product request. Once the exact
  // executable candidate is already hard-safe and qualified, a higher internal
  // frontier rank is secondary to preserving x_user; continuing to climb here
  // rewrote the technical Protein bases after the request had been satisfied.
  const baselineAssessment = assessProteinFormulation(candidate);
  if (
    baselineAssessment.hardSafe &&
    baselineAssessment.qualification.qualified &&
    candidate.items.every((item) => item.planned_grams > 0) &&
    recipeDirectionViolations(candidate).length === 0
  ) {
    return candidate;
  }

  const baselineRank = proteinFrontierRank(candidate);
  if (baselineRank === null) return candidate;

  // No exclusion list is needed: the ladder only exchanges grams between lines
  // that are ALREADY in the candidate and never introduces an ingredient, so an
  // excluded product can never enter through this pass.
  const fit = fitProteinFormulation(candidate, set, []);
  if (!fit.changed) return candidate;

  const refined = fit.input;
  const refinedRank = proteinFrontierRank(refined);
  if (refinedRank === null || refinedRank <= baselineRank + 1e-9) return candidate;
  if (classifyViolationBands(refined).hardMetrics.length > 0) return candidate;
  if (
    mainGroupTotal(identityInput, refined) <
    mainGroupTotal(identityInput, candidate) - MAIN_OBJECTIVE_EPSILON_G
  ) {
    return candidate;
  }
  if (recipeDirectionViolations(refined).length > recipeDirectionViolations(candidate).length) {
    return candidate;
  }
  if (!verifyConstraintsPreserved(set, refined).ok) return candidate;
  return refined;
}

const mainGroupTotal = (identityInput: RecipeInput, candidate: RecipeInput): number => {
  const byLineId = new Map(candidate.items.map((item) => [item.id, item] as const));
  return captureMainIngredientIntent(identityInput).reduce(
    (sum, main) => sum + (byLineId.get(main.lineId)?.planned_grams ?? 0),
    0,
  );
};

const hasAdjustablePositiveMainIntent = (input: RecipeInput, set: ConstraintSet): boolean =>
  captureMainIngredientIntent(input).some((main) => {
    const item = input.items.find((candidate) => candidate.id === main.lineId);
    const constraint = set.byLineId[main.lineId];
    return (
      item?.actual_grams === null && constraint?.mode !== 'locked' && constraint?.mode !== 'percent'
    );
  });

/** Every Main line of the trusted draft is present in the proposal with byte-identical grams. */
const mainGroupLinesByteIdentical = (base: RecipeInput, proposed: RecipeInput): boolean => {
  const proposedByLineId = new Map(proposed.items.map((item) => [item.id, item] as const));
  return captureMainIngredientIntent(base).every((main) => {
    const current = base.items.find((item) => item.id === main.lineId);
    const next = proposedByLineId.get(main.lineId);
    return (
      current !== undefined &&
      next !== undefined &&
      next.lock_type === current.lock_type &&
      canonicalIngredientId(next.ingredient) === canonicalIngredientId(current.ingredient) &&
      Object.is(next.planned_grams, current.planned_grams)
    );
  });
};

const requiredLineContractViolations = (before: RecipeInput, after: RecipeInput): string[] => {
  const afterByLineId = new Map(after.items.map((item) => [item.id, item] as const));
  return before.items
    .filter((item) => item.lock_type === 'required')
    .filter((required) => {
      const proposed = afterByLineId.get(required.id);
      return (
        proposed === undefined ||
        proposed.lock_type !== 'required' ||
        canonicalIngredientId(proposed.ingredient) !== canonicalIngredientId(required.ingredient) ||
        !Object.is(proposed.planned_grams, required.planned_grams)
      );
    })
    .map((item) => item.id);
};

/**
 * Post-solve proximity polish for a no-Main exact Direction recipe. The
 * established candidate is a seed, not authority: it
 * is re-evaluated alongside x_user by the same hard/target/proximity hierarchy,
 * and every explored vector passes the normal constraint, required-line,
 * ProductBehavior and ECO-flavour gates. A reached recipe cannot trade away
 * its target; a NEAREST recipe may only move to the same violation count and a
 * better/equivalent severity tier before proximity is allowed to decide.
 */
const polishDirectionVector = (
  input: RecipeInput,
  set: ConstraintSet,
  reached: RecipeInput,
  createdAt: string,
  options: OptimizePreviewOptions,
): RecipeInput => {
  if (
    !hasActiveExactDirectionObjective(input) ||
    captureMainIngredientIntent(input).length > 0 ||
    input.goals?.formulation_strategy === undefined ||
    (options.rescueSimulationLineIds?.length ?? 0) > 0 ||
    input.items.some(
      (item) =>
        item.actual_grams !== null ||
        !Number.isInteger(item.planned_grams) ||
        item.planned_grams <= 0 ||
        (item.user_target_grams !== undefined &&
          Number.isFinite(item.user_target_grams) &&
          Math.abs(item.user_target_grams - item.planned_grams) > BATCH_SUM_TOLERANCE_G),
    ) ||
    Math.abs(plannedSum(input) - input.target_batch_grams) > BATCH_SUM_TOLERANCE_G
  ) {
    return reached;
  }
  const excluded = new Set(
    (options.excludedIngredientIds ?? []).map(canonicalIngredientIdFromSourceId),
  );
  if (
    input.items.some(
      (item) => item.planned_grams > 0 && excluded.has(canonicalIngredientId(item.ingredient)),
    )
  ) {
    return reached;
  }
  const strategy = normalizeFormulationStrategy(input.goals.formulation_strategy ?? input.mode);
  const module = strategy === 'eco' ? 'ECO' : 'OPTIMAL';
  const requiredBehaviorLineIds = productBehaviorRequiredLineIds({ items: input.items });
  if (
    Object.keys(options.productBehaviorSnapshots ?? {}).length > 0 &&
    !productBehaviorModuleGate(
      options.productBehaviorSnapshots ?? {},
      module,
      requiredBehaviorLineIds,
    ).ready
  ) {
    return reached;
  }
  const polishSet = solverHolds(input, set);
  const practicalSeedResult = practicalizeRecipeCandidate(
    reached,
    polishSet,
    flavourHeldLineIds(reached),
  );
  if (!practicalSeedResult.ok) return reached;
  const practicalSeed = practicalSeedResult.audit.executableInput;
  const searchOptions = {
    beamWidth: 20,
    evaluationBudget: 100_000,
    excludedIngredientIds: options.excludedIngredientIds,
    effectivePriceOverrides: options.effectivePriceOverrides,
    externalHardGate: (candidate: RecipeInput) =>
      verifyConstraintsPreserved(polishSet, candidate).ok &&
      positiveStandardPresencePreserved(input, candidate) &&
      requiredLineContractViolations(input, candidate).length === 0 &&
      (module !== 'ECO' ||
        verifyEcoFlavourProtection(input, candidate, {
          productBehaviorSnapshots: options.productBehaviorSnapshots,
        }).ok),
  } as const;
  const seedReached = recipeDirectionViolations(practicalSeed).length === 0;
  // A material fold-change on any positive user line is evidence that the
  // current search path may be using that line as a composition lever rather
  // than preserving the entered vector. Generate an alternative by holding
  // EACH such line at x_user one at a time, then remove the temporary hold and
  // judge the resulting complete vector under the ORIGINAL constraints. This
  // is a candidate-generation detour only: no ingredient/profile identity is
  // encoded, and a held probe can win solely through the normal hierarchy
  // (hard validity → exact target/NEAREST → whole-vector proximity).
  const practicalByLineId = new Map(
    practicalSeed.items.map((item) => [item.id, item.planned_grams] as const),
  );
  const practicalSeedMeasure = evaluateExperimentalCandidate(
    input,
    practicalSeed,
    polishSet,
    searchOptions,
  );
  const softAnchorCandidates: RecipeInput[] = [];
  if (options.softAnchorPass !== true) {
    for (const item of input.items) {
      const proposed = practicalByLineId.get(item.id);
      if (
        proposed === undefined ||
        item.lock_type !== 'unlocked' ||
        item.actual_grams !== null ||
        item.planned_grams <= 0 ||
        (item.user_intent_anchor_grams ?? 0) <= 0 ||
        set.byLineId[item.id] !== undefined ||
        normalizedLineDrift(item.planned_grams, proposed, input.target_batch_grams) <=
          MATERIAL_USER_INTENT_DRIFT
      ) {
        continue;
      }
      const probeSet: ConstraintSet = {
        ...set,
        byLineId: {
          ...set.byLineId,
          [item.id]: { mode: 'locked', grams: item.planned_grams },
        },
      };
      const probe = buildOptimizePreview(input, probeSet, createdAt, {
        ...options,
        softAnchorPass: true,
      });
      if (!probe.ok || probe.preview.diagnosticOnly === true) continue;
      const candidate = { ...input, items: probe.preview.proposedInput.items };
      const measure = evaluateExperimentalCandidate(input, candidate, polishSet, searchOptions);
      // A soft-anchor probe exists solely to recover formulation proximity. A
      // probe that makes the COMPLETE x_user vector farther away is not
      // evidence for this mechanism, even if it happens to improve Direction.
      if (
        measure.normalizedDistanceFromUser <
        practicalSeedMeasure.normalizedDistanceFromUser - SEVERITY_EPS
      ) {
        softAnchorCandidates.push(candidate);
      }
    }
  }
  // Sibling Direction probes already form the outer bounded neighborhood.
  // They still need the soft-anchor alternative to be comparable with a
  // normal top-level solve, but recursively running another 100k-candidate
  // neighborhood inside every one of up to 15 probes would multiply the same
  // search without adding a new generator class.
  const polished =
    options.directionNearestPass === true
      ? null
      : experimentalNeighborhoodSearch(input, polishSet, {
          ...searchOptions,
          ...(seedReached ? { seedInputs: [practicalSeed] } : {}),
        });
  let best = {
    input: practicalSeed,
    measure: practicalSeedMeasure,
  };
  if (
    polished !== null &&
    (polished.status === 'candidate' || polished.status === 'nearest') &&
    compareExperimentalCandidateMeasures(polished.measure, best.measure, strategy) < 0
  ) {
    best = { input: polished.input, measure: polished.measure };
  }
  for (const candidate of softAnchorCandidates) {
    const measure = evaluateExperimentalCandidate(input, candidate, polishSet, searchOptions);
    if (compareExperimentalCandidateMeasures(measure, best.measure, strategy) < 0) {
      best = { input: candidate, measure };
    }
  }
  return best.input;
};

/**
 * Whole-gram practicalization is part of the executable contract, so it may
 * change the Direction tier used by the pre-practicalization proximity rank.
 * Re-run the same generic x_user polish once on the physical Preview vector
 * and rebuild every candidate-derived field when a closer peer wins.
 */
const polishPracticalDirectionPreview = (
  input: RecipeInput,
  set: ConstraintSet,
  preview: ConstraintPreview,
  createdAt: string,
  options: OptimizePreviewOptions,
): ConstraintPreview => {
  if (
    !hasActiveExactDirectionObjective(input) ||
    recipeDirectionViolations(preview.proposedInput).length === 0 ||
    captureMainIngredientIntent(input).length > 0 ||
    preview.formulation !== undefined ||
    preview.diagnosticOnly === true ||
    preview.batchReconciliationOnly === true ||
    preview.practicalizationOnly === true ||
    options.softAnchorPass === true ||
    options.directionNearestPass === true
  ) {
    return preview;
  }
  const ranked = polishDirectionVector(input, set, preview.proposedInput, createdAt, options);
  if (
    workingStateFingerprint(ranked, preview.nextConstraints) ===
    workingStateFingerprint(preview.proposedInput, preview.nextConstraints)
  ) {
    return preview;
  }
  const refreshed = finishPreview(
    preview.kind,
    preview.titlePl,
    input,
    set,
    ranked,
    preview.nextConstraints,
    preview.violationsBefore,
    preview.explanation,
    preview.createdAt,
  );
  return {
    ...preview,
    ...refreshed,
    hardResidualMetrics: classifyViolationBands(refreshed.proposedInput).hardMetrics,
  };
};

export interface ManualIngredientTargetProof {
  lineId: string;
  requestedGrams: number;
  selectedGrams: number;
  firstCloserRejectedGrams: number | null;
  provenNearest: boolean;
  attempts: number;
}

/**
 * Product-layer projection of the latest direct Standard gram edit. The
 * existing exact whole-gram linear relaxation proposes complete batch vectors;
 * every proposed vector is then independently accepted by the unchanged
 * Engine and all existing Apply gates. The relaxation can reject impossible
 * mass/band points, but it can never accept one by itself.
 */
export function projectManualIngredientTarget(
  identityInput: RecipeInput,
  set: ConstraintSet,
  options: OptimizePreviewOptions = {},
  technicalStart: RecipeInput = identityInput,
): { input: RecipeInput; proof: ManualIngredientTargetProof | null } {
  let targetLine: RecipeInput['items'][number] | null = null;
  for (const item of identityInput.items) {
    if (
      item.lock_type === 'unlocked' &&
      item.actual_grams === null &&
      item.user_target_grams !== undefined &&
      Number.isFinite(item.user_target_grams) &&
      item.user_target_grams >= 0 &&
      !isConstrained(set, item.id)
    ) {
      targetLine = item;
    }
  }
  if (!targetLine) return { input: technicalStart, proof: null };
  if (!technicalStart.items.some((item) => item.id === targetLine.id)) {
    return { input: technicalStart, proof: null };
  }

  const requestedGrams = Math.max(0, Math.round(targetLine.user_target_grams!));
  // NOTE: this lower bound stays the PRESENCE floor on purpose. A projection
  // that lands below the user's request here is a PROVEN-nearest answer — the
  // search reports `firstCloserRejectedGrams` and `provenNearest`, i.e. every
  // closer amount was individually shown infeasible under the user's own hard
  // locks. That is precisely the §12 case where a larger deviation is allowed,
  // and it is classified and disclosed as a material deviation by
  // `finishPreview`. The owner's 40 g → 1 g collapse was NOT this: there the
  // yolk was not the target line at all, and its 1 g came from the relaxation's
  // own lower bound (see `userIntentFloorGrams` in mainTechnicalLinearBound).
  const minimumGrams = requestedGrams > 0 ? 1 : 0;
  const batchMaximumGrams = Math.max(minimumGrams, Math.floor(identityInput.target_batch_grams));
  const excluded = new Set(options.excludedIngredientIds ?? []);
  const targetCanonicalId = canonicalIngredientId(targetLine.ingredient);
  if (excluded.has(targetCanonicalId) && requestedGrams > 0) {
    return { input: technicalStart, proof: null };
  }

  const requiredLineIds = productBehaviorRequiredLineIds({ items: identityInput.items });
  const behaviorModule =
    normalizeFormulationStrategy(
      identityInput.goals?.formulation_strategy ?? identityInput.mode,
    ) === 'eco'
      ? 'ECO'
      : 'OPTIMAL';
  const managedBehavior = Object.keys(options.productBehaviorSnapshots ?? {}).length > 0;
  const cache = new Map<number, RecipeInput | null>();
  let attempts = 0;

  const objectiveBound = mainTechnicalLinearUpperBound({
    recipe: technicalStart,
    constraints: solverHolds(technicalStart, set),
    snapshots: options.productBehaviorSnapshots ?? {},
    excludedIngredientIds: options.excludedIngredientIds,
    objectiveLineIds: [targetLine.id],
  });
  const certifiedMaximum =
    objectiveBound.status === 'certified' &&
    objectiveBound.integerSolutionCertified &&
    objectiveBound.wholeGramUpperBound !== null
      ? Math.floor(objectiveBound.wholeGramUpperBound)
      : null;
  const maximumGrams =
    certifiedMaximum === null
      ? batchMaximumGrams
      : Math.max(minimumGrams, Math.min(batchMaximumGrams, certifiedMaximum));

  const assess = (candidate: RecipeInput, grams: number): RecipeInput | null => {
    const practical = practicalizeRecipeCandidate(candidate, set, flavourHeldLineIds(candidate));
    if (!practical.ok) return null;
    const executable = practical.audit.executableInput;
    const target = executable.items.find((item) => item.id === targetLine.id);
    if (!target || !Object.is(target.planned_grams, grams) || target.lock_type !== 'unlocked') {
      return null;
    }
    if (
      Math.abs(plannedSum(executable) - identityInput.target_batch_grams) > BATCH_SUM_TOLERANCE_G ||
      executable.items.some(
        (item) => !Number.isInteger(item.planned_grams) || item.planned_grams < 0,
      ) ||
      !verifyConstraintsPreserved(set, executable).ok ||
      !verifyMainIngredientIdentity(identityInput, executable, set.byLineId).ok ||
      requiredLineContractViolations(identityInput, executable).length > 0
    ) {
      return null;
    }
    const requiredHardRoles = new Set(
      technicalStart.items
        .filter((item) => item.planned_grams > 0)
        .map((item) => resolveFunctionalRole(item.ingredient))
        .filter((role) => HARD_ROLES.has(role)),
    );
    if (
      [...requiredHardRoles].some(
        (role) =>
          !executable.items.some(
            (item) => item.planned_grams > 0 && resolveFunctionalRole(item.ingredient) === role,
          ),
      )
    ) {
      return null;
    }
    const result = practical.audit.executableResult;
    if (
      detectViolations(result).length > 0 ||
      recipeDirectionViolations(executable).length > 0 ||
      result.warnings.some((warning) => warning.severity === 'critical')
    ) {
      return null;
    }
    const protein = assessProteinFormulation(executable, result);
    if (protein.applicable && !protein.qualification.qualified) return null;
    if (
      executable.category === 'vegan_gelato' &&
      (veganRecipeEligibilityIssues(executable.items).length > 0 ||
        veganProfileConstraintIssues(executable).length > 0)
    ) {
      return null;
    }
    if (
      normalizeFormulationStrategy(
        identityInput.goals?.formulation_strategy ?? identityInput.mode,
      ) === 'eco' &&
      !verifyEcoFlavourProtection(identityInput, executable, {
        productBehaviorSnapshots: options.productBehaviorSnapshots,
      }).ok
    ) {
      return null;
    }
    if (managedBehavior) {
      const gate = productBehaviorModuleGate(
        options.productBehaviorSnapshots ?? {},
        behaviorModule,
        requiredLineIds,
      );
      if (!gate.ready) return null;
    }
    return executable;
  };

  const probe = (grams: number): RecipeInput | null => {
    const cached = cache.get(grams);
    if (cached !== undefined || cache.has(grams)) return cached ?? null;
    attempts += 1;
    const probeSet: ConstraintSet = {
      byLineId: { ...set.byLineId, [targetLine.id]: { mode: 'locked', grams } },
    };
    const bound = mainTechnicalLinearUpperBound({
      recipe: technicalStart,
      constraints: solverHolds(technicalStart, probeSet),
      snapshots: options.productBehaviorSnapshots ?? {},
      excludedIngredientIds: options.excludedIngredientIds,
      objectiveLineIds: [targetLine.id],
      // This call BUILDS THE RECIPE, so the user's other positive lines are
      // not free mass for the objective to consume. Without this the objective
      // pushes every non-objective user line to the relaxation's lower bound —
      // which is exactly how the owner's 40 g dried egg yolk arrived at 1 g
      // while the projection was busy targeting a different line entirely.
      respectUserIntentFloors: true,
    });
    const solution =
      bound.status === 'certified' && bound.integerSolutionCertified
        ? bound.continuousSolutionGrams
        : null;
    if (!solution || solution.length !== technicalStart.items.length) {
      cache.set(grams, null);
      return null;
    }
    const candidate: RecipeInput = {
      ...technicalStart,
      items: technicalStart.items.map((item, index) => ({
        ...item,
        planned_grams: Math.round(solution[index]!),
      })),
    };
    const assessed = assess(candidate, grams);
    cache.set(grams, assessed);
    return assessed;
  };

  const exactRequested =
    requestedGrams >= minimumGrams && requestedGrams <= maximumGrams ? probe(requestedGrams) : null;
  if (exactRequested) {
    return {
      input: exactRequested,
      proof: {
        lineId: targetLine.id,
        requestedGrams,
        selectedGrams: requestedGrams,
        firstCloserRejectedGrams: null,
        provenNearest: true,
        attempts,
      },
    };
  }

  const ordered = Array.from(
    { length: maximumGrams - minimumGrams + 1 },
    (_, index) => minimumGrams + index,
  ).sort(
    (left, right) =>
      Math.abs(left - requestedGrams) - Math.abs(right - requestedGrams) || left - right,
  );
  for (const grams of ordered) {
    if (grams === requestedGrams) continue;
    const feasible = probe(grams);
    if (!feasible) continue;
    const firstCloserRejectedGrams = ordered.find(
      (candidate) =>
        Math.abs(candidate - requestedGrams) < Math.abs(grams - requestedGrams) &&
        cache.get(candidate) === null,
    );
    return {
      input: feasible,
      proof: {
        lineId: targetLine.id,
        requestedGrams,
        selectedGrams: grams,
        firstCloserRejectedGrams:
          firstCloserRejectedGrams ??
          (certifiedMaximum !== null && requestedGrams > maximumGrams ? maximumGrams + 1 : null),
        provenNearest:
          (requestedGrams <= maximumGrams || certifiedMaximum !== null) &&
          ordered
            .filter(
              (candidate) =>
                Math.abs(candidate - requestedGrams) < Math.abs(grams - requestedGrams),
            )
            .every((candidate) => cache.get(candidate) === null),
        attempts,
      },
    };
  }
  return { input: technicalStart, proof: null };
}

/**
 * Owner final Main semantics. This is deliberately product orchestration, not
 * Engine science: all candidate amounts are proposed outside Engine, every
 * candidate is then recalculated by the unchanged Engine and must remain in
 * the already-best public technical-score class. Multi-Main always moves as a
 * single ratio-preserving group. A bounded bisection is deterministic and
 * reports the first higher rejected mass instead of claiming infinity-level
 * precision.
 */
function maximizeMainFromStart(
  identityInput: RecipeInput,
  start: RecipeInput,
  set: ConstraintSet,
  options: OptimizePreviewOptions,
): { input: RecipeInput; proof: MainFlavourObjectiveProof | null } {
  const mains = captureMainIngredientIntent(identityInput);
  if (mains.length === 0 || identityInput.items.some((item) => item.actual_grams !== null)) {
    return { input: start, proof: null };
  }
  // Crown authority protects Main identity and Multi-Main ratio, not absolute
  // grams. With no approved sensory envelope, the unchanged Engine and hard
  // safety gates define the admissible frontier; only a real §17 constraint
  // may make a Main amount exact.

  // The proof's starting point is always the CURRENT canonical draft, not a
  // template/solver seed. A formulation seed may already carry a different
  // Main mass; reporting that as "starting" would make a valid Preview
  // impossible to re-verify at the trustless Apply door.
  const startingMainGrams = mainGroupTotal(identityInput, identityInput);
  const searchStartingMainGrams = mainGroupTotal(identityInput, start);
  const baselineResult = calculateRecipe(start);
  const identityResult = calculateRecipe(identityInput);
  const behaviorMode =
    normalizeFormulationStrategy(
      identityInput.goals?.formulation_strategy ?? identityInput.mode,
    ) === 'eco'
      ? 'eco'
      : 'optimal';
  const managedBehavior = Object.keys(options.productBehaviorSnapshots ?? {}).length > 0;
  const mainEnvelopeAdmissible = (candidate: RecipeInput): boolean =>
    !managedBehavior ||
    verifyMainEnvelope({
      recipe: candidate,
      snapshots: options.productBehaviorSnapshots ?? {},
      mode: behaviorMode,
      technicalOnlyMainLineIds: options.technicalOnlyMainLineIds,
    }).ok;
  const startEnvelopeValid = mainEnvelopeAdmissible(start);
  const identityEnvelopeValid = mainEnvelopeAdmissible(identityInput);
  // Protein v2 frontier: preserve the CLAIM and the structural QUALITY, never
  // a distance to a requested protein number.
  const startProteinRank = proteinFrontierRank(start, baselineResult);
  const identityProteinRank = proteinFrontierRank(identityInput, identityResult);
  const baselineProteinRank =
    start.category !== 'protein_gelato'
      ? null
      : Math.max(startProteinRank ?? -Infinity, identityProteinRank ?? -Infinity);
  const preservesProteinFrontier = (
    candidate: RecipeInput,
    result = calculateRecipe(candidate),
  ): boolean => {
    if (candidate.category !== 'protein_gelato' || baselineProteinRank === null) return true;
    const rank = proteinFrontierRank(candidate, result);
    return rank !== null && rank >= baselineProteinRank - 1e-9;
  };
  const startScore = recipeFitForInput(start, baselineResult).score;
  const identityScore = recipeFitForInput(identityInput, identityResult).score;
  const startHardCount = classifyViolationBands(start).hardMetrics.length;
  const identityHardCount = classifyViolationBands(identityInput).hardMetrics.length;
  // Lexicographic rule: a different solver/template seed must never define a
  // lower "best class" than the current draft already proves achievable.
  // Main optimisation is allowed only inside a native-hard-safe class.
  const baselineHardCount = Math.min(startHardCount, identityHardCount);
  const admissibleBaselineScores = [
    ...(startEnvelopeValid && startScore !== null ? [startScore] : []),
    ...(identityEnvelopeValid && identityScore !== null ? [identityScore] : []),
  ];
  const baselineScore =
    admissibleBaselineScores.length > 0
      ? Math.max(...admissibleBaselineScores)
      : Number.NEGATIVE_INFINITY;
  const baselineDirectionReached = Math.max(
    startEnvelopeValid ? assessRecipeDirection(start, baselineResult).reachedAxisCount : 0,
    identityEnvelopeValid
      ? assessRecipeDirection(identityInput, identityResult).reachedAxisCount
      : 0,
  );
  if (!(startingMainGrams > 0) || !(searchStartingMainGrams > 0) || baselineHardCount > 0) {
    return {
      input: start,
      proof: {
        status: 'no_admissible_increase',
        startingMainGrams,
        exactAcceptedMainGrams: startingMainGrams,
        executableMainGrams: startingMainGrams,
        firstHigherRejectedGrams: null,
        firstHigherRejectedReason: 'technical_score_class',
        technicalScore: baselineScore,
        attempts: 0,
      },
    };
  }

  const excludedIngredientIds = new Set(options.excludedIngredientIds ?? []);
  let attempts = 0;
  const practicalScoreIfAdmissible = (candidate: RecipeInput): number | null => {
    const practical = practicalizeRecipeCandidate(candidate, set, flavourHeldLineIds(candidate));
    if (!practical.ok) return null;
    const executable = practical.audit.executableInput;
    const identity = verifyMainIngredientIdentity(identityInput, executable);
    const constraints = verifyConstraintsPreserved(set, executable);
    const hardCount = classifyViolationBands(executable).hardMetrics.length;
    const score = recipeFitForInput(executable, practical.audit.executableResult).score;
    const directionReached = assessRecipeDirection(
      executable,
      practical.audit.executableResult,
    ).reachedAxisCount;
    const ecoValid =
      normalizeFormulationStrategy(
        identityInput.goals?.formulation_strategy ?? identityInput.mode,
      ) !== 'eco' ||
      verifyEcoFlavourProtection(identityInput, executable, {
        productBehaviorSnapshots: options.productBehaviorSnapshots,
      }).ok;
    const veganValid =
      executable.category !== 'vegan_gelato' ||
      (veganRecipeEligibilityIssues(executable.items).length === 0 &&
        veganProfileConstraintIssues(executable).length === 0);
    return identity.ok &&
      constraints.ok &&
      mainEnvelopeAdmissible(executable) &&
      hardCount <= baselineHardCount &&
      score !== null &&
      score >= baselineScore &&
      directionReached >= baselineDirectionReached &&
      preservesProteinFrontier(executable, practical.audit.executableResult) &&
      ecoValid &&
      veganValid
      ? score
      : null;
  };
  const probe = (desiredMainGrams: number): MainObjectiveProbe => {
    attempts += 1;
    const ratio = resolveMainRatioScale(identityInput, set.byLineId, desiredMainGrams);
    if (!ratio.ok) {
      return { ok: false, mainGrams: desiredMainGrams, reason: 'batch_or_constraints' };
    }
    const requestedMainGrams = ratio.allocatedMainTotal;
    const mainByLineId = new Map(
      ratio.allocations.map((allocation) => [allocation.lineId, allocation.grams] as const),
    );
    const staged: RecipeInput = {
      ...start,
      items: start.items.map((item) => {
        const grams = mainByLineId.get(item.id);
        return grams === undefined ? item : { ...item, planned_grams: grams };
      }),
    };
    const mainSet: ConstraintSet = {
      byLineId: {
        ...set.byLineId,
        ...Object.fromEntries(
          [...mainByLineId].map(([lineId, grams]) => [lineId, { mode: 'locked', grams }] as const),
        ),
      },
    };
    const solverSet = solverHolds(staged, mainSet);
    const rescaled = rescaleBatchToTarget(staged, solverSet, identityInput.target_batch_grams);
    // Proportional normalization is not the whole feasible space. In
    // particular a flavour carrier can often advance one more executable gram
    // by taking that gram from one eligible balancer (for example Milk) while
    // a proportional reduction of every line would cross an unrelated gate.
    // Probe the proportional candidate AND every deterministic one-line donor;
    // all of them still pass the unchanged Engine and contract gates below.
    const candidates: RecipeInput[] = rescaled.ok ? [rescaled.input] : [];
    const batchDelta = plannedSum(staged) - identityInput.target_batch_grams;
    if (Math.abs(batchDelta) > BATCH_SUM_TOLERANCE_G) {
      for (const donor of staged.items) {
        if (
          mainByLineId.has(donor.id) ||
          donor.actual_grams !== null ||
          isConstrained(solverSet, donor.id) ||
          excludedIngredientIds.has(canonicalIngredientId(donor.ingredient))
        ) {
          continue;
        }
        const nextGrams = donor.planned_grams - batchDelta;
        if (!Number.isFinite(nextGrams) || nextGrams < 0) continue;
        const candidate = {
          ...staged,
          items: staged.items.map((item) =>
            item.id === donor.id ? { ...item, planned_grams: nextGrams } : item,
          ),
        };
        if (
          Math.abs(plannedSum(candidate) - identityInput.target_batch_grams) <=
          BATCH_SUM_TOLERANCE_G
        ) {
          candidates.push(candidate);
        }
      }
    }

    let rejection: Extract<MainObjectiveProbe, { ok: false }>['reason'] = 'batch_or_constraints';
    let best: Extract<MainObjectiveProbe, { ok: true }> | null = null;
    const assessCandidate = (settled: RecipeInput): void => {
      const identity = verifyMainIngredientIdentity(identityInput, settled);
      const constraints = verifyConstraintsPreserved(set, settled);
      if (!identity.ok || !constraints.ok) {
        rejection = 'main_identity';
        return;
      }
      if (
        normalizeFormulationStrategy(
          identityInput.goals?.formulation_strategy ?? identityInput.mode,
        ) === 'eco' &&
        !verifyEcoFlavourProtection(identityInput, settled, {
          productBehaviorSnapshots: options.productBehaviorSnapshots,
        }).ok
      ) {
        rejection = 'main_identity';
        return;
      }
      if (!mainEnvelopeAdmissible(settled)) {
        rejection = 'hard_gate';
        return;
      }
      if (
        settled.category === 'vegan_gelato' &&
        (veganRecipeEligibilityIssues(settled.items).length > 0 ||
          veganProfileConstraintIssues(settled).length > 0)
      ) {
        rejection = 'hard_gate';
        return;
      }
      const hardCount = classifyViolationBands(settled).hardMetrics.length;
      if (hardCount > baselineHardCount) {
        rejection = 'hard_gate';
        return;
      }
      const settledResult = calculateRecipe(settled);
      const score = recipeFitForInput(settled, settledResult).score;
      const directionReached = assessRecipeDirection(settled, settledResult).reachedAxisCount;
      if (score === null || score < baselineScore) {
        rejection = 'technical_score_class';
        return;
      }
      if (directionReached < baselineDirectionReached) {
        rejection = 'technical_score_class';
        return;
      }
      if (!preservesProteinFrontier(settled, settledResult)) {
        rejection = 'technical_score_class';
        return;
      }
      const practicalScore = practicalScoreIfAdmissible(settled);
      if (practicalScore === null) {
        rejection = 'technical_score_class';
        return;
      }
      const accepted = {
        ok: true as const,
        input: settled,
        mainGrams: mainGroupTotal(identityInput, settled),
        score: practicalScore,
      };
      if (best === null || (accepted.score ?? -Infinity) > (best.score ?? -Infinity))
        best = accepted;
    };
    for (const settled of candidates) assessCandidate(settled);
    // An authority-invalid starting Main group is not an admissible score or
    // composition baseline. If proportional/one-donor normalization cannot
    // make the ceiling vector technical, run the existing bounded support-line
    // settlement once on the best raw seed, then repeat every gate above.
    if (best === null && !identityEnvelopeValid && candidates.length > 0) {
      const seed = [...candidates]
        .map((candidate, index) => ({
          candidate,
          index,
          violations: detectViolations(calculateRecipe(candidate)).length,
          severity: totalSeverity(candidate),
        }))
        .sort(
          (left, right) =>
            left.violations - right.violations ||
            left.severity - right.severity ||
            left.index - right.index,
        )[0]?.candidate;
      if (seed) assessCandidate(settleRemainingLines(seed));
    }
    return best ?? { ok: false, mainGrams: requestedMainGrams, reason: rejection };
  };

  const settleRemainingLines = (candidate: RecipeInput): RecipeInput => {
    const mainSet: ConstraintSet = {
      byLineId: {
        ...set.byLineId,
        ...Object.fromEntries(
          mains.map((main) => {
            const grams = candidate.items.find((item) => item.id === main.lineId)?.planned_grams;
            return [main.lineId, { mode: 'locked', grams: grams ?? main.grams }] as const;
          }),
        ),
      },
    };
    const solverSet = solverHolds(candidate, mainSet);
    const constrainedIngredientIds = new Set(
      candidate.items
        .filter((item) => isConstrained(solverSet, item.id))
        .map((item) => canonicalIngredientId(item.ingredient)),
    );
    const restore = (next: RecipeInput): RecipeInput => {
      const normalized = rescalePreservingMainGroup(
        identityInput,
        next,
        solverSet,
        identityInput.target_batch_grams,
      );
      return normalized.ok ? normalized.input : next;
    };
    return iterateSolverToFixedPoint(
      identityInput,
      candidate,
      constrainedIngredientIds,
      restore,
      excludedIngredientIds,
      solverSet,
      options.effectivePriceOverrides,
      null,
      options.productBehaviorSnapshots,
    ).working;
  };
  const settleIfAdmissible = (candidate: RecipeInput): RecipeInput => {
    const settled = settleRemainingLines(candidate);
    const identity = verifyMainIngredientIdentity(identityInput, settled);
    const constraints = verifyConstraintsPreserved(set, settled);
    const hardCount = classifyViolationBands(settled).hardMetrics.length;
    const settledResult = calculateRecipe(settled);
    const score = recipeFitForInput(settled, settledResult).score;
    const directionReached = assessRecipeDirection(settled, settledResult).reachedAxisCount;
    const ecoValid =
      normalizeFormulationStrategy(
        identityInput.goals?.formulation_strategy ?? identityInput.mode,
      ) !== 'eco' ||
      verifyEcoFlavourProtection(identityInput, settled, {
        productBehaviorSnapshots: options.productBehaviorSnapshots,
      }).ok;
    const veganValid =
      settled.category !== 'vegan_gelato' ||
      (veganRecipeEligibilityIssues(settled.items).length === 0 &&
        veganProfileConstraintIssues(settled).length === 0);
    const practicalScore = practicalScoreIfAdmissible(settled);
    return identity.ok &&
      constraints.ok &&
      mainEnvelopeAdmissible(settled) &&
      hardCount <= baselineHardCount &&
      score !== null &&
      score >= baselineScore &&
      directionReached >= baselineDirectionReached &&
      preservesProteinFrontier(settled, settledResult) &&
      ecoValid &&
      veganValid &&
      practicalScore !== null
      ? settled
      : candidate;
  };

  // A Main exact/percent/range sidecar may resolve every requested amount back
  // to the current group mass. Detect that explicitly; it is a held contract,
  // not a failed optimiser.
  const behaviorCeiling = mainEnvelopeSearchCeilingGrams({
    recipe: identityInput,
    snapshots: options.productBehaviorSnapshots ?? {},
    technicalOnlyMainLineIds: options.technicalOnlyMainLineIds,
    mode:
      normalizeFormulationStrategy(
        identityInput.goals?.formulation_strategy ?? identityInput.mode,
      ) === 'eco'
        ? 'eco'
        : 'optimal',
  });
  const behaviorFloor = mainEnvelopeSearchFloorGrams({
    recipe: identityInput,
    snapshots: options.productBehaviorSnapshots ?? {},
    technicalOnlyMainLineIds: options.technicalOnlyMainLineIds,
  });
  const searchFloor =
    behaviorFloor === null ? 1 : Math.max(1, Math.ceil(behaviorFloor - MAIN_OBJECTIVE_EPSILON_G));
  const upper = probe(behaviorCeiling ?? identityInput.target_batch_grams);
  // A user-entered Crown group may start ABOVE its hard ProductBehavior
  // envelope. The ordinary maximization interval assumes the starting point
  // is already admissible and searches upward; using that interval here would
  // collapse `rejectedMainGrams` back to the oversized start and silently keep
  // the invalid vector. Search downward from the approved ceiling instead.
  // This is still the same bounded Main probe and unchanged Engine gate; only
  // the direction of enumeration differs for an authority-invalid baseline.
  if (
    !upper.ok &&
    behaviorCeiling !== null &&
    behaviorCeiling < searchStartingMainGrams - MAIN_OBJECTIVE_EPSILON_G
  ) {
    let lastRejected = upper;
    let descendingAttempts = 0;
    for (
      let total = Math.floor(behaviorCeiling + MAIN_OBJECTIVE_EPSILON_G) - 1;
      total >= searchFloor && descendingAttempts < MAIN_TECHNICAL_PROBE_BUDGET;
      total -= 1
    ) {
      descendingAttempts += 1;
      const candidate = probe(total);
      if (!candidate.ok) {
        lastRejected = candidate;
        continue;
      }
      const settled = settleIfAdmissible(candidate.input);
      const acceptedMainGrams = mainGroupTotal(identityInput, settled);
      return {
        input: settled,
        proof: {
          status: 'best_achievable',
          startingMainGrams,
          exactAcceptedMainGrams: acceptedMainGrams,
          executableMainGrams: acceptedMainGrams,
          firstHigherRejectedGrams:
            lastRejected.mainGrams > acceptedMainGrams + MAIN_OBJECTIVE_EPSILON_G
              ? lastRejected.mainGrams
              : null,
          firstHigherRejectedReason:
            lastRejected.mainGrams > acceptedMainGrams + MAIN_OBJECTIVE_EPSILON_G
              ? lastRejected.reason
              : null,
          technicalScore: recipeFitForInput(settled, calculateRecipe(settled)).score,
          attempts,
        },
      };
    }
    return {
      input: start,
      proof: {
        status: 'no_admissible_increase',
        startingMainGrams,
        exactAcceptedMainGrams: startingMainGrams,
        executableMainGrams: startingMainGrams,
        firstHigherRejectedGrams: lastRejected.mainGrams,
        firstHigherRejectedReason: lastRejected.reason,
        technicalScore: baselineScore,
        attempts,
      },
    };
  }
  if (upper.ok && Math.abs(upper.mainGrams - searchStartingMainGrams) <= MAIN_OBJECTIVE_EPSILON_G) {
    return {
      input: start,
      proof: {
        status: 'held_by_contract',
        startingMainGrams,
        exactAcceptedMainGrams: startingMainGrams,
        executableMainGrams: startingMainGrams,
        firstHigherRejectedGrams: null,
        firstHigherRejectedReason: null,
        technicalScore: baselineScore,
        attempts,
      },
    };
  }
  if (upper.ok) {
    const settledUpper = settleIfAdmissible(upper.input);
    return {
      input: settledUpper,
      proof: {
        status: 'maximized',
        startingMainGrams,
        exactAcceptedMainGrams: upper.mainGrams,
        executableMainGrams: upper.mainGrams,
        firstHigherRejectedGrams: null,
        firstHigherRejectedReason: null,
        technicalScore: recipeFitForInput(settledUpper, calculateRecipe(settledUpper)).score,
        attempts,
      },
    };
  }

  let acceptedInput = start;
  let acceptedMainGrams = searchStartingMainGrams;
  let acceptedScore: number | null = baselineScore;
  let rejectedMainGrams = Math.max(searchStartingMainGrams, upper.mainGrams);
  let rejectedReason = upper.reason;

  for (let index = 0; index < MAIN_OBJECTIVE_MAX_PROBES; index += 1) {
    if (rejectedMainGrams - acceptedMainGrams <= MAIN_OBJECTIVE_EPSILON_G) break;
    const desired = acceptedMainGrams + (rejectedMainGrams - acceptedMainGrams) / 2;
    const candidate = probe(desired);
    if (candidate.ok && candidate.mainGrams > acceptedMainGrams + 1e-9) {
      acceptedInput = candidate.input;
      acceptedMainGrams = candidate.mainGrams;
      acceptedScore = candidate.score;
    } else {
      rejectedMainGrams = Math.max(acceptedMainGrams, candidate.mainGrams);
      if (!candidate.ok) rejectedReason = candidate.reason;
      if (rejectedMainGrams <= acceptedMainGrams + 1e-9) break;
    }
  }

  const settledAccepted =
    acceptedMainGrams > startingMainGrams + MAIN_OBJECTIVE_EPSILON_G
      ? settleIfAdmissible(acceptedInput)
      : acceptedInput;
  return {
    input: settledAccepted,
    proof: {
      status:
        acceptedMainGrams > startingMainGrams + MAIN_OBJECTIVE_EPSILON_G
          ? 'maximized'
          : 'no_admissible_increase',
      startingMainGrams,
      exactAcceptedMainGrams: acceptedMainGrams,
      executableMainGrams: acceptedMainGrams,
      firstHigherRejectedGrams:
        rejectedMainGrams > acceptedMainGrams + 1e-9 ? rejectedMainGrams : null,
      firstHigherRejectedReason:
        rejectedMainGrams > acceptedMainGrams + 1e-9 ? rejectedReason : null,
      technicalScore:
        acceptedMainGrams > startingMainGrams + MAIN_OBJECTIVE_EPSILON_G
          ? recipeFitForInput(settledAccepted, calculateRecipe(settledAccepted)).score
          : acceptedScore,
      attempts,
    },
  };
}

const MAIN_TECHNICAL_MAXIMUM_ENABLED = true;
// A certified maximum may still sit below the linear upper bound because the
// final Engine contains discrete/non-linear gates. Search every reachable
// whole gram downward for normal Pro/Home batches, but keep a finite guard so
// a malformed or unusually large target cannot synchronously monopolise the
// UI thread. When the guard is reached the proof remains honestly bounded
// BEST_ACHIEVABLE; it is never promoted to a certified maximum.
export const MAIN_TECHNICAL_PROBE_BUDGET = 2_000;

type MainTechnicalProbe =
  | { ok: true; input: RecipeInput; mainGrams: number; score: number | null }
  | {
      ok: false;
      mainGrams: number;
      reason: Exclude<MainFlavourObjectiveProof['firstHigherRejectedReason'], null>;
      rules: string[];
    };

/**
 * Deterministic Main frontier. A whole-gram maximum is reported only when the
 * real Engine accepts the certified integer-linear upper bound. If that one
 * exact frontier vector is not executable, the bounded search may return only
 * an honestly labelled BEST_ACHIEVABLE lower bound; it never promotes a local
 * failure to a global maximum. Starting Main grams and ECO/OPTIMAL are absent
 * from the bound/allocation contract.
 */
function maximizeMainTechnicalObjective(
  identityInput: RecipeInput,
  set: ConstraintSet,
  options: OptimizePreviewOptions,
  seedCandidates: readonly RecipeInput[] = [],
  technicalStart: RecipeInput = identityInput,
): { input: RecipeInput; proof: MainFlavourObjectiveProof | null } {
  const presentationInput = identityInput;
  const contractInput = identityInput;
  const behaviorMode =
    normalizeFormulationStrategy(
      contractInput.goals?.formulation_strategy ?? contractInput.mode,
    ) === 'eco'
      ? 'eco'
      : 'optimal';
  // Strategy is deliberately removed from the technical objective. It may
  // have shaped the starting recipe, but it cannot change the frontier of this
  // exact current vector. Restore the user's mode/goals on the returned recipe.
  identityInput = {
    ...technicalStart,
    goals: { ...technicalStart.goals, formulation_strategy: 'optimal' },
  };
  const mains = captureMainIngredientIntent(contractInput);
  if (mains.length === 0 || identityInput.items.some((item) => item.actual_grams !== null)) {
    return { input: presentationInput, proof: null };
  }
  // §6/§21: an uncalibrated member prevents borrowing another member's sensory
  // envelope, but it does not create an exact gram constraint. The group keeps
  // its user ratio and moves together through the Engine-verified frontier.

  const startingMainGrams = mainGroupTotal(contractInput, contractInput);
  if (assessProteinFormulation(identityInput).applicable) {
    // Protein's structural fitter owns only the supporting ingredients. Main
    // still goes through the same bounded, ratio-coupled group search used by
    // every other profile; the former zero-attempt return validated only the
    // group total and left legacy/asymmetric vectors outside that authority.
    const technicalPresentationInput: RecipeInput = {
      ...technicalStart,
      mode: presentationInput.mode,
      goals: presentationInput.goals ? { ...presentationInput.goals } : undefined,
    };
    // Protein support refinement must establish the technically admissible
    // search seed BEFORE the coupled Main frontier runs.  Waiting until the
    // common `finishPreview` boundary leaves an out-of-band user draft with a
    // zero-attempt `no_admissible_increase` proof, even when the existing
    // Protein ladder can repair only the support lines while preserving the
    // complete Crown group.  The refinement is fail-closed: it retains Main
    // mass/ratio, user constraints and Direction, and is accepted only after
    // the unchanged Engine reports a strictly better Protein frontier.
    const refinedTechnicalPresentationInput = refineProteinFormulation(
      contractInput,
      technicalPresentationInput,
      set,
    );
    const bounded = maximizeMainFromStart(
      contractInput,
      refinedTechnicalPresentationInput,
      set,
      options,
    );
    if (!bounded.proof) return bounded;
    const executableMainGrams = mainGroupTotal(contractInput, bounded.input);
    return {
      input: bounded.input,
      proof: {
        ...bounded.proof,
        // This search is deliberately bounded, so it is a reproducible BEST
        // witness, never a mathematical maximum certificate. Apply rebuilds
        // the same search and compares the complete vector before committing.
        status: 'best_achievable',
        exactAcceptedMainGrams: executableMainGrams,
        executableMainGrams,
        searchUpperBoundGrams: Math.max(
          Math.round(executableMainGrams),
          Math.floor(contractInput.target_batch_grams),
        ),
        provenMaximum: false,
        testedHigherCandidateCount: 0,
        limitingTechnicalRules: [
          bounded.proof.firstHigherRejectedReason ?? 'bounded_protein_group_search',
        ],
        proofKind: 'heuristic_search',
        certifiedUpperBoundGrams: undefined,
      },
    };
  }
  const linearConstraintSet = solverHolds(identityInput, set);
  const batchUpperBound = Math.max(1, Math.floor(identityInput.target_batch_grams));
  const behaviorCeiling = mainEnvelopeSearchCeilingGrams({
    recipe: identityInput,
    snapshots: options.productBehaviorSnapshots ?? {},
    technicalOnlyMainLineIds: options.technicalOnlyMainLineIds,
    mode: behaviorMode,
  });
  const behaviorFloor = mainEnvelopeSearchFloorGrams({
    recipe: identityInput,
    snapshots: options.productBehaviorSnapshots ?? {},
    technicalOnlyMainLineIds: options.technicalOnlyMainLineIds,
  });
  const searchFloor =
    behaviorFloor === null ? 1 : Math.max(1, Math.ceil(behaviorFloor - MAIN_OBJECTIVE_EPSILON_G));
  const behaviorUpperBound =
    behaviorCeiling === null
      ? batchUpperBound
      : Math.floor(behaviorCeiling + MAIN_OBJECTIVE_EPSILON_G);
  // A published ProductBehavior ceiling already supplies an independent upper
  // authority. In that case the continuous LP is enough to tighten it: the
  // floor of a continuous maximum is a safe whole-gram upper bound, and the
  // candidate at min(LP, ProductBehavior) still passes the unchanged integer
  // allocation, practicalization, Engine, lock and Main-ratio gates below.
  // Branch-and-bound cannot accept a recipe; it could only tighten a failed
  // starting probe. Groups WITHOUT a published ceiling retain the original
  // single 4,096-node integer proof, so user-held Main and real locks do not
  // pay for a redundant continuous solve or lose any certification authority.
  const linearBound = mainTechnicalLinearUpperBound({
    recipe: identityInput,
    constraints: linearConstraintSet,
    snapshots: options.productBehaviorSnapshots ?? {},
    excludedIngredientIds: options.excludedIngredientIds,
    ...(behaviorCeiling !== null ? { certifyWholeGram: false } : {}),
  });
  const linearUpperBound =
    linearBound.status === 'certified'
      ? (linearBound.wholeGramUpperBound ?? batchUpperBound)
      : batchUpperBound;
  const upperBound = Math.max(1, Math.min(batchUpperBound, linearUpperBound, behaviorUpperBound));
  const behaviorCeilingIsLimiting =
    behaviorCeiling !== null && behaviorUpperBound <= Math.min(linearUpperBound, batchUpperBound);
  const upperAllocation = resolveMainRatioScale(identityInput, set.byLineId, upperBound);
  if (!upperAllocation.ok) {
    return {
      input: presentationInput,
      proof: {
        status: 'held_by_contract',
        startingMainGrams,
        exactAcceptedMainGrams: startingMainGrams,
        executableMainGrams: startingMainGrams,
        firstHigherRejectedGrams: null,
        firstHigherRejectedReason: 'batch_or_constraints',
        technicalScore: recipeFitForInput(identityInput, calculateRecipe(identityInput)).score,
        attempts: 0,
        searchUpperBoundGrams: upperBound,
        provenMaximum: false,
        testedHigherCandidateCount: 0,
        limitingTechnicalRules: ['main_ratio_or_constraint_conflict'],
        ...(linearBound.status === 'certified' && linearBound.wholeGramUpperBound !== null
          ? {
              certifiedUpperBoundGrams: linearBound.wholeGramUpperBound,
              proofKind: 'linear_relaxation' as const,
            }
          : { proofKind: 'heuristic_search' as const }),
      },
    };
  }

  const excluded = new Set(options.excludedIngredientIds ?? []);
  const requiredLineIds = productBehaviorRequiredLineIds({ items: contractInput.items });
  const behaviorModule = behaviorMode === 'eco' ? 'ECO' : 'OPTIMAL';
  const managedBehavior = Object.keys(options.productBehaviorSnapshots ?? {}).length > 0;

  const assess = (
    candidate: RecipeInput,
    candidateSet: ConstraintSet,
    requestedMainGrams: number,
  ): MainTechnicalProbe => {
    const practical = practicalizeRecipeCandidate(
      candidate,
      candidateSet,
      flavourHeldLineIds(candidate),
    );
    if (!practical.ok) {
      return {
        ok: false,
        mainGrams: requestedMainGrams,
        reason: 'batch_or_constraints',
        rules: ['whole_gram_batch_reconciliation'],
      };
    }
    const executable = practical.audit.executableInput;
    const executableMainGrams = mainGroupTotal(contractInput, executable);
    const constraintCheck = verifyConstraintsPreserved(set, executable);
    if (!constraintCheck.ok) {
      return {
        ok: false,
        mainGrams: requestedMainGrams,
        reason: 'batch_or_constraints',
        rules: constraintCheck.violations.map((violation) => violation.code),
      };
    }
    const identity = verifyMainIngredientIdentity(contractInput, executable, set.byLineId);
    if (!identity.ok) {
      return {
        ok: false,
        mainGrams: requestedMainGrams,
        reason: 'main_identity',
        rules: identity.violations.map((violation) => violation.code),
      };
    }
    const changedRequiredLineIds = requiredLineContractViolations(contractInput, executable);
    if (changedRequiredLineIds.length > 0) {
      return {
        ok: false,
        mainGrams: requestedMainGrams,
        reason: 'batch_or_constraints',
        rules: changedRequiredLineIds.map((lineId) => `required_line_changed:${lineId}`),
      };
    }
    if (
      Math.abs(plannedSum(executable) - identityInput.target_batch_grams) > BATCH_SUM_TOLERANCE_G ||
      executable.items.some(
        (item) => !Number.isInteger(item.planned_grams) || item.planned_grams < 0,
      )
    ) {
      return {
        ok: false,
        mainGrams: requestedMainGrams,
        reason: 'batch_or_constraints',
        rules: ['exact_target_or_whole_gram'],
      };
    }
    if (managedBehavior) {
      const gate = productBehaviorModuleGate(
        options.productBehaviorSnapshots ?? {},
        behaviorModule,
        requiredLineIds,
      );
      if (!gate.ready) {
        return {
          ok: false,
          mainGrams: requestedMainGrams,
          reason: 'hard_gate',
          rules: [gate.reason ?? `product_behavior_${behaviorModule.toLocaleLowerCase('en')}`],
        };
      }
      const mainEnvelope = verifyMainEnvelope({
        recipe: executable,
        snapshots: options.productBehaviorSnapshots ?? {},
        mode: behaviorModule === 'ECO' ? 'eco' : 'optimal',
        technicalOnlyMainLineIds: options.technicalOnlyMainLineIds,
      });
      if (!mainEnvelope.ok) {
        return {
          ok: false,
          mainGrams: requestedMainGrams,
          reason: 'hard_gate',
          rules: mainEnvelope.violations.map((violation) => violation.code),
        };
      }
    }
    const result = practical.audit.executableResult;
    const violations = detectViolations(result);
    const criticalWarnings = result.warnings
      .filter((warning) => warning.severity === 'critical')
      .map((warning) => warning.code);
    const protein = assessProteinFormulation(executable, result);
    const veganIssues =
      executable.category === 'vegan_gelato'
        ? [
            ...veganRecipeEligibilityIssues(executable.items).map(
              (issue) => `vegan_eligibility:${issue.ingredientName}`,
            ),
            ...veganProfileConstraintIssues(executable).map((issue) => issue.code),
          ]
        : [];
    const technicalRules = [
      ...new Set([
        ...violations.map((violation) => violation.metric),
        ...recipeDirectionViolations(executable).map(
          (violation) => `direction:${violation.metric}`,
        ),
        ...criticalWarnings,
        ...(protein.applicable && !protein.qualification.qualified ? ['protein_claim'] : []),
        ...veganIssues,
      ]),
    ];
    if (technicalRules.length > 0) {
      return {
        ok: false,
        mainGrams: requestedMainGrams,
        reason: 'hard_gate',
        rules: technicalRules,
      };
    }
    return {
      ok: true,
      input: executable,
      mainGrams: executableMainGrams,
      score: recipeFitForInput(executable, result).score,
    };
  };

  const probe = (desiredMainGrams: number): MainTechnicalProbe => {
    const allocation = resolveMainRatioScale(contractInput, set.byLineId, desiredMainGrams);
    if (!allocation.ok) {
      return {
        ok: false,
        mainGrams: desiredMainGrams,
        reason: 'batch_or_constraints',
        rules: ['main_ratio_or_constraint_conflict'],
      };
    }
    const mainByLineId = new Map(
      allocation.allocations.map((row) => [row.lineId, row.grams] as const),
    );
    const staged: RecipeInput = {
      ...identityInput,
      items: identityInput.items.map((item) => {
        const grams = mainByLineId.get(item.id);
        return grams === undefined ? item : { ...item, planned_grams: grams };
      }),
    };
    const candidateSet: ConstraintSet = {
      byLineId: {
        ...set.byLineId,
        ...Object.fromEntries(
          allocation.allocations.map(
            ({ lineId, grams }) => [lineId, { mode: 'locked', grams }] as const,
          ),
        ),
      },
    };
    // FLAVOUR MUTATION AUTHORITY (owner P1-B): the Main frontier re-solves a
    // linear relaxation in which every non-Main line is a free variable, so a
    // secondary flavour accent is otherwise just mass to allocate — this is the
    // route that turned a 30 g lemon-juice accent into 188 g while water
    // collapsed to 1 g. Pin the accents for the solver exactly as the Main
    // allocation is pinned. Only `solverSet` is constrained, so the preview's
    // user-facing lock counters keep reporting the user's own locks.
    const heldFlavourLineIds = flavourHeldLineIds(identityInput);
    const solverSet = solverHolds(staged, {
      byLineId: {
        ...candidateSet.byLineId,
        ...Object.fromEntries(
          staged.items
            .filter((item) => heldFlavourLineIds.has(item.id))
            .map((item) => [item.id, { mode: 'locked', grams: item.planned_grams }] as const),
        ),
      },
    });
    const candidates: RecipeInput[] = seedCandidates.filter(
      (candidate) =>
        Math.abs(mainGroupTotal(contractInput, candidate) - allocation.allocatedMainTotal) <=
        MAIN_OBJECTIVE_EPSILON_G,
    );
    // Re-solve the complete linear relaxation for this exact Main allocation.
    // Reusing only the maximum-bound vector would miss technically valid lower
    // frontiers whose non-Main balance is materially different (Vegan,
    // Protein and mixed forms are common examples).
    const candidateRelaxation = mainTechnicalLinearUpperBound({
      recipe: staged,
      constraints: solverSet,
      snapshots: options.productBehaviorSnapshots ?? {},
      excludedIngredientIds: options.excludedIngredientIds,
      integerNodeBudget: 256,
    });
    if (
      candidateRelaxation.status === 'certified' &&
      candidateRelaxation.continuousSolutionGrams?.length === staged.items.length
    ) {
      const solution = candidateRelaxation.continuousSolutionGrams;
      // Try the exact relaxation vector first. Product-profile fitters can
      // then make a mass-neutral adjustment before practicalization; this is
      // both more complete and dramatically cheaper than enumerating every
      // floor/ceil permutation up front.
      candidates.push({
        ...staged,
        items: staged.items.map((item, index) =>
          mainByLineId.has(item.id) || heldFlavourLineIds.has(item.id)
            ? item
            : { ...item, planned_grams: solution[index]! },
        ),
      });
      const optionsByIndex = staged.items.map((item, index): readonly number[] => {
        if (mainByLineId.has(item.id) || heldFlavourLineIds.has(item.id))
          return [item.planned_grams];
        const value = Math.max(0, solution[index]!);
        const floor = Math.floor(value + MAIN_OBJECTIVE_EPSILON_G);
        const ceil = Math.ceil(value - MAIN_OBJECTIVE_EPSILON_G);
        return floor === ceil ? [floor] : [floor, ceil];
      });
      const rounded: number[] = Array.from({ length: staged.items.length }, () => 0);
      let generated = 0;
      const enumerateRoundedSolutions = (index: number, sum: number): void => {
        if (generated >= 32 || sum > identityInput.target_batch_grams) return;
        if (index === staged.items.length) {
          if (Math.abs(sum - identityInput.target_batch_grams) > MAIN_OBJECTIVE_EPSILON_G) return;
          generated += 1;
          candidates.push({
            ...staged,
            items: staged.items.map((item, itemIndex) => ({
              ...item,
              planned_grams: rounded[itemIndex]!,
            })),
          });
          return;
        }
        for (const grams of optionsByIndex[index]!) {
          rounded[index] = grams;
          enumerateRoundedSolutions(index + 1, sum + grams);
        }
      };
      enumerateRoundedSolutions(0, 0);
    }
    const proportional = rescaleBatchToTarget(staged, solverSet, identityInput.target_batch_grams);
    if (proportional.ok) candidates.push(proportional.input);
    const batchDelta = plannedSum(staged) - identityInput.target_batch_grams;
    for (const donor of staged.items) {
      if (
        mainByLineId.has(donor.id) ||
        donor.actual_grams !== null ||
        isConstrained(solverSet, donor.id) ||
        excluded.has(canonicalIngredientId(donor.ingredient))
      )
        continue;
      const nextGrams = donor.planned_grams - batchDelta;
      if (!Number.isFinite(nextGrams) || nextGrams < 0) continue;
      candidates.push({
        ...staged,
        items: staged.items.map((item) =>
          item.id === donor.id ? { ...item, planned_grams: nextGrams } : item,
        ),
      });
    }
    const unique = new Map<string, RecipeInput>();
    for (const candidate of candidates) {
      const key = candidate.items.map((item) => `${item.id}:${item.planned_grams}`).join('|');
      if (!unique.has(key)) unique.set(key, candidate);
    }
    let best: Extract<MainTechnicalProbe, { ok: true }> | null = null;
    let failure: Extract<MainTechnicalProbe, { ok: false }> = {
      ok: false,
      mainGrams: allocation.allocatedMainTotal,
      reason: 'batch_or_constraints',
      rules: ['complete_recipe_rebalance'],
    };
    for (const candidate of unique.values()) {
      const fittedCandidate =
        candidate.category === 'protein_gelato'
          ? fitProteinFormulation(candidate, solverSet, options.excludedIngredientIds ?? []).input
          : candidate;
      const outcome = assess(fittedCandidate, candidateSet, allocation.allocatedMainTotal);
      if (!outcome.ok) {
        if (outcome.reason === 'hard_gate' || failure.reason !== 'hard_gate') failure = outcome;
        continue;
      }
      best = outcome;
      // Main mass is the lexicographic objective. Once a deterministic vector
      // at this exact mass passes every complete technical gate, alternative
      // vectors at the same mass cannot improve the Main frontier.
      break;
    }
    if (best === null) {
      const rankedSeeds = [...unique.values()]
        .map((candidate, index) => ({
          candidate,
          index,
          violations: detectViolations(calculateRecipe(candidate)).length,
          severity: totalSeverity(candidate),
        }))
        .sort(
          (left, right) =>
            left.violations - right.violations ||
            left.severity - right.severity ||
            left.index - right.index,
        );
      for (const { candidate } of rankedSeeds.slice(0, 1)) {
        const constrainedIngredientIds = new Set(
          candidate.items
            .filter((item) => isConstrained(solverSet, item.id))
            .map((item) => canonicalIngredientId(item.ingredient)),
        );
        const restore = (next: RecipeInput): RecipeInput => {
          const restored = rescalePreservingMainGroup(
            identityInput,
            next,
            solverSet,
            identityInput.target_batch_grams,
          );
          return restored.ok ? restored.input : next;
        };
        const settled = iterateSolverToFixedPoint(
          contractInput,
          candidate,
          constrainedIngredientIds,
          restore,
          excluded,
          solverSet,
          options.effectivePriceOverrides,
          null,
          options.productBehaviorSnapshots,
        ).working;
        const originalIds = identityInput.items.map((item) => item.id).sort();
        const settledIds = settled.items.map((item) => item.id).sort();
        if (JSON.stringify(originalIds) !== JSON.stringify(settledIds)) continue;
        const outcome = assess(settled, candidateSet, allocation.allocatedMainTotal);
        if (!outcome.ok) {
          if (outcome.reason === 'hard_gate' || failure.reason !== 'hard_gate') failure = outcome;
          continue;
        }
        if (best === null || (outcome.score ?? -Infinity) > (best.score ?? -Infinity))
          best = outcome;
      }
    }
    return best ?? failure;
  };

  const exactOnly = upperAllocation.heldEntirelyByExactConstraints;
  // A Main range can certify a stricter objective bound than batch mass. Use
  // the reachable allocation returned by the ratio/constraint contract so a
  // capped first probe is not mislabeled as thousands of untested candidates.
  const searchStart = Math.round(upperAllocation.allocatedMainTotal);
  let attempts = 0;
  const rejected = new Map<number, Extract<MainTechnicalProbe, { ok: false }>>();
  let accepted: Extract<MainTechnicalProbe, { ok: true }> | null = null;
  let fallbackAccepted: Extract<MainTechnicalProbe, { ok: true }> | null = null;
  const seedTotals = [
    ...new Set(
      seedCandidates.map((candidate) => Math.round(mainGroupTotal(identityInput, candidate))),
    ),
  ]
    .filter((total) => total >= searchFloor && total <= searchStart)
    .sort((left, right) => right - left);
  for (const total of seedTotals) {
    const outcome = probe(total);
    attempts += 1;
    if (
      outcome.ok &&
      (fallbackAccepted === null || outcome.mainGrams > fallbackAccepted.mainGrams)
    ) {
      fallbackAccepted = outcome;
    }
  }
  let frontierAttempts = 0;
  for (let total = searchStart; total >= searchFloor; total -= 1) {
    if (frontierAttempts >= MAIN_TECHNICAL_PROBE_BUDGET) break;
    frontierAttempts += 1;
    attempts += 1;
    const outcome = probe(total);
    if (outcome.ok) {
      accepted = outcome;
      break;
    }
    rejected.set(total, outcome);
    // Product authority/identity failures do not depend on grams. Descending
    // through the whole batch cannot turn a missing binding/snapshot into a
    // valid product, so stop deterministically after the first proof instead
    // of spending hundreds of identical Engine probes.
    const invariantAuthorityFailure =
      outcome.reason === 'main_identity' ||
      outcome.rules.some(
        (rule) =>
          rule === 'main_behavior_missing' ||
          rule === 'main_identity_changed' ||
          rule.startsWith('product_behavior_'),
      );
    if (exactOnly || invariantAuthorityFailure) break;
  }
  if (accepted === null) {
    if (fallbackAccepted !== null) {
      const fallbackMainGrams = Math.round(fallbackAccepted.mainGrams);
      return {
        input: {
          ...fallbackAccepted.input,
          mode: presentationInput.mode,
          goals: presentationInput.goals,
        },
        proof: {
          status: 'best_achievable',
          startingMainGrams,
          exactAcceptedMainGrams: fallbackMainGrams,
          executableMainGrams: fallbackMainGrams,
          firstHigherRejectedGrams: null,
          firstHigherRejectedReason: null,
          technicalScore: fallbackAccepted.score,
          attempts,
          searchUpperBoundGrams: searchStart,
          provenMaximum: false,
          testedHigherCandidateCount: rejected.size,
          limitingTechnicalRules: ['deterministic_probe_budget'],
          ...(linearBound.status === 'certified' && linearBound.wholeGramUpperBound !== null
            ? {
                certifiedUpperBoundGrams: linearBound.wholeGramUpperBound,
                proofKind: 'linear_relaxation' as const,
              }
            : { proofKind: 'heuristic_search' as const }),
        },
      };
    }
    const failure = rejected.get(searchStart);
    const testedHigherCandidateCount = [...rejected.keys()].filter(
      (mainGrams) => mainGrams > startingMainGrams + MAIN_OBJECTIVE_EPSILON_G,
    ).length;
    const firstHigherFailure =
      failure && failure.mainGrams > startingMainGrams + MAIN_OBJECTIVE_EPSILON_G ? failure : null;
    return {
      input: presentationInput,
      proof: {
        status: exactOnly ? 'held_by_contract' : 'no_admissible_increase',
        startingMainGrams,
        exactAcceptedMainGrams: startingMainGrams,
        executableMainGrams: startingMainGrams,
        // A linear/Direction ceiling can sit below an already-safe current
        // Crown group. Such a lower probe is not a "higher rejected" quantum,
        // and the proof's explored upper range may never be lower than the
        // unchanged executable witness that it returns.
        firstHigherRejectedGrams: firstHigherFailure?.mainGrams ?? null,
        firstHigherRejectedReason: firstHigherFailure?.reason ?? null,
        technicalScore: recipeFitForInput(identityInput, calculateRecipe(identityInput)).score,
        attempts,
        searchUpperBoundGrams: Math.max(
          searchStart,
          Math.ceil(startingMainGrams - MAIN_OBJECTIVE_EPSILON_G),
        ),
        provenMaximum: false,
        testedHigherCandidateCount,
        limitingTechnicalRules: failure?.rules ?? ['no_technically_valid_main_candidate'],
        ...(linearBound.status === 'certified' && linearBound.wholeGramUpperBound !== null
          ? {
              certifiedUpperBoundGrams: linearBound.wholeGramUpperBound,
              proofKind: 'linear_relaxation' as const,
            }
          : { proofKind: 'heuristic_search' as const }),
      },
    };
  }

  const maximum = Math.round(accepted.mainGrams);
  const nextFailure = rejected.get(maximum + 1) ?? null;
  const mathematicallyCertified =
    maximum === upperBound &&
    (behaviorCeilingIsLimiting ||
      (linearBound.status === 'certified' && linearBound.wholeGramUpperBound !== null));
  const limitingCertifiedRules = behaviorCeilingIsLimiting
    ? ['main_policy_ceiling']
    : linearBound.certificate;
  return {
    input: {
      ...accepted.input,
      mode: presentationInput.mode,
      goals: presentationInput.goals,
    },
    proof: {
      status: exactOnly
        ? 'held_by_contract'
        : mathematicallyCertified
          ? 'maximized'
          : 'best_achievable',
      startingMainGrams,
      exactAcceptedMainGrams: maximum,
      executableMainGrams: maximum,
      firstHigherRejectedGrams: mathematicallyCertified
        ? maximum + 1
        : maximum < searchStart
          ? maximum + 1
          : null,
      firstHigherRejectedReason: mathematicallyCertified
        ? 'certified_upper_bound'
        : maximum < searchStart
          ? (nextFailure?.reason ?? 'batch_or_constraints')
          : null,
      technicalScore: accepted.score,
      attempts,
      searchUpperBoundGrams: searchStart,
      provenMaximum: exactOnly || mathematicallyCertified,
      testedHigherCandidateCount: rejected.size,
      limitingTechnicalRules: mathematicallyCertified
        ? limitingCertifiedRules
        : (nextFailure?.rules ?? ['heuristic_search_limit']),
      ...(behaviorCeilingIsLimiting ||
      (linearBound.status === 'certified' && linearBound.wholeGramUpperBound !== null)
        ? {
            certifiedUpperBoundGrams: upperBound,
            proofKind: 'linear_relaxation' as const,
          }
        : { proofKind: exactOnly ? ('exact_contract' as const) : ('heuristic_search' as const) }),
    },
  };
}

function maximizeMainFlavourObjective(
  identityInput: RecipeInput,
  start: RecipeInput,
  set: ConstraintSet,
  options: OptimizePreviewOptions,
): { input: RecipeInput; proof: MainFlavourObjectiveProof | null } {
  if (MAIN_TECHNICAL_MAXIMUM_ENABLED) {
    const intendedMains = captureMainIngredientIntent(identityInput);
    if (intendedMains.length === 0) {
      return { input: start, proof: null };
    }
    // Formulation may have added the technical toolbox (dairy, sugars,
    // stabilizer) before the Main frontier runs. Search the COMPLETE current
    // candidate, not the sparse user draft.
    // Server-bound products carry complete immutable behavior snapshots, so
    // their exact current vector is the authority. Pure Engine/demo drafts do
    // not; for those, use the already-built technical toolbox rather than the
    // sparse/off-batch seed.
    const technicalStart =
      identityInput.category === 'protein_gelato' ||
      Object.keys(options.productBehaviorSnapshots ?? {}).length === 0
        ? start
        : identityInput;
    // The accepted bounded corrector is retained only as a deterministic,
    // fully revalidated lower-bound seed. It can improve BEST_ACHIEVABLE when
    // the exact frontier budget is exhausted, but it can never certify a
    // maximum or impose its former sensory ceiling.
    const lowerBoundSeeds =
      technicalStart === start
        ? [maximizeMainFromStart(identityInput, start, set, options).input]
        : [];
    return maximizeMainTechnicalObjective(
      identityInput,
      set,
      options,
      lowerBoundSeeds,
      technicalStart,
    );
  }
  const cacheKey = JSON.stringify([
    workingStateFingerprint(start, set),
    options.excludedIngredientIds ?? [],
    options.effectivePriceOverrides ?? {},
  ]);
  const cached = mainObjectiveCache.get(identityInput)?.get(cacheKey);
  if (cached) return cached;
  const primary = maximizeMainFromStart(identityInput, start, set, options);
  const sameStartingVector =
    identityInput.items.length === start.items.length &&
    identityInput.items.every((item, index) => {
      const candidate = start.items[index];
      return (
        candidate?.id === item.id && Math.abs(candidate.planned_grams - item.planned_grams) <= 1e-9
      );
    });
  // A solver/template seed is only one path through the feasible space. The
  // canonical draft itself is a second deterministic seed and can preserve a
  // better single-donor frontier. Compare both after whole-gram execution and
  // keep the larger admissible Main group.
  const direct = sameStartingVector
    ? primary
    : maximizeMainFromStart(identityInput, identityInput, set, options);
  const executableOutcome = (candidate: { input: RecipeInput }) => {
    const practical = practicalizeRecipeCandidate(
      candidate.input,
      set,
      flavourHeldLineIds(candidate.input),
    );
    const input = practical.ok ? practical.audit.executableInput : candidate.input;
    const result = practical.ok ? practical.audit.executableResult : calculateRecipe(input);
    return {
      input,
      mainGrams: mainGroupTotal(identityInput, input),
      hardCount: classifyViolationBands(input).hardMetrics.length,
      score: recipeFitForInput(input, result).score,
      proteinRank: proteinFrontierRank(input, result),
    };
  };
  const betterCandidate = (
    current: { input: RecipeInput; proof: MainFlavourObjectiveProof | null },
    candidate: { input: RecipeInput; proof: MainFlavourObjectiveProof | null },
  ) => {
    const currentOutcome = executableOutcome(current);
    const candidateOutcome = executableOutcome(candidate);
    const keepsBestClass =
      candidateOutcome.hardCount <= currentOutcome.hardCount &&
      candidateOutcome.score !== null &&
      currentOutcome.score !== null &&
      candidateOutcome.score >= currentOutcome.score &&
      (identityInput.category !== 'protein_gelato' ||
        (candidateOutcome.proteinRank !== null &&
          currentOutcome.proteinRank !== null &&
          candidateOutcome.proteinRank >= currentOutcome.proteinRank - 1e-9));
    return keepsBestClass &&
      candidateOutcome.mainGrams > currentOutcome.mainGrams + MAIN_OBJECTIVE_EPSILON_G
      ? candidate
      : current;
  };
  let selected = betterCandidate(primary, direct);
  // Settling the remaining lines can expose another admissible whole-gram
  // step. Repeat the same deterministic frontier until the executable Main
  // total reaches a fixed point; never certify the first local envelope as a
  // global maximum.
  for (let round = 0; round < 2; round += 1) {
    const next = maximizeMainFromStart(identityInput, selected.input, set, options);
    const reseededRaw = maximizeMainFromStart(selected.input, selected.input, set, options);
    const reseeded = reseededRaw.proof
      ? {
          input: reseededRaw.input,
          proof: {
            ...reseededRaw.proof,
            startingMainGrams: mainGroupTotal(identityInput, identityInput),
            attempts: (selected.proof?.attempts ?? 0) + reseededRaw.proof.attempts,
          },
        }
      : reseededRaw;
    const advanced = betterCandidate(selected, betterCandidate(next, reseeded));
    if (advanced === selected) break;
    selected = advanced;
  }

  const practicalSelected = practicalizeRecipeCandidate(
    selected.input,
    set,
    flavourHeldLineIds(selected.input),
  );
  const selectedMains = captureMainIngredientIntent(identityInput);
  if (selected.proof && practicalSelected.ok && selectedMains.length > 0) {
    const selectedExecutable = practicalSelected.audit.executableInput;
    const selectedResult = practicalSelected.audit.executableResult;
    const identityResult = calculateRecipe(identityInput);
    // The formulation/protein pass establishes the best target residual before
    // flavour maximisation.  The discrete whole-gram Main frontier must retain
    // that residual, not merely remain inside the same coarse public score
    // bucket.  Otherwise a higher requested protein target can paradoxically
    // finish with less actual protein while Main keeps increasing.
    const baselineProteinRank =
      identityInput.category === 'protein_gelato'
        ? proteinFrontierRank(selectedExecutable, selectedResult)
        : null;
    const preservesProteinFrontier = (
      candidate: RecipeInput,
      result = calculateRecipe(candidate),
    ): boolean => {
      if (candidate.category !== 'protein_gelato' || baselineProteinRank === null) {
        return true;
      }
      const rank = proteinFrontierRank(candidate, result);
      return rank !== null && rank >= baselineProteinRank - 1e-9;
    };
    const baselineHardCount = Math.min(
      classifyViolationBands(selectedExecutable).hardMetrics.length,
      classifyViolationBands(identityInput).hardMetrics.length,
    );
    const selectedScore = recipeFitForInput(selectedExecutable, selectedResult).score;
    const identityScore = recipeFitForInput(identityInput, identityResult).score;
    const baselineScore =
      selectedScore === null
        ? identityScore
        : identityScore === null
          ? selectedScore
          : Math.max(selectedScore, identityScore);
    const baselineDirectionReached = Math.max(
      assessRecipeDirection(selectedExecutable, selectedResult).reachedAxisCount,
      assessRecipeDirection(identityInput, identityResult).reachedAxisCount,
    );
    const excludedIngredientIds = new Set(options.excludedIngredientIds ?? []);
    const nextExecutableTarget = (
      afterMainGrams: number,
      minimumAdvanceGrams = 1,
    ): number | null => {
      const first = Math.max(
        0,
        Math.floor(afterMainGrams + MAIN_OBJECTIVE_EPSILON_G) +
          Math.max(1, Math.floor(minimumAdvanceGrams)),
      );
      const last = Math.floor(identityInput.target_batch_grams + BATCH_SUM_TOLERANCE_G);
      for (let total = first; total <= last; total += 1) {
        const ratio = resolveMainRatioScale(identityInput, set.byLineId, total);
        if (!ratio.ok) continue;
        const grams = ratio.allocations.map((allocation) => allocation.grams);
        if (grams.every((value) => Math.abs(value - Math.round(value)) <= 1e-7)) {
          return grams.reduce((sum, value) => sum + Math.round(value), 0);
        }
      }
      return null;
    };
    const exactByLineId = new Map(selected.input.items.map((item) => [item.id, item] as const));
    const initialFrontierInput: RecipeInput = {
      ...selectedExecutable,
      items: selectedExecutable.items.map((item) => {
        const exact = exactByLineId.get(item.id);
        return exact && isTemplateControlledStabilizer(item.ingredient)
          ? { ...item, planned_grams: exact.planned_grams }
          : item;
      }),
    };
    let frontierInputs: RecipeInput[] = [initialFrontierInput];
    let frontierMainGrams = mainGroupTotal(identityInput, selectedExecutable);
    let exactAcceptedInput = selected.input;
    let exactAcceptedMainGrams = selected.proof.exactAcceptedMainGrams;
    let firstHigherRejectedGrams: number | null = null;
    let firstHigherRejectedReason: MainFlavourObjectiveProof['firstHigherRejectedReason'] = null;
    let discreteAttempts = 0;
    let executableJumpGrams = 1;
    const proteinUnitFrontier = identityInput.category === 'protein_gelato' && baselineScore === 10;

    while (baselineScore !== null) {
      const desiredMainGrams = nextExecutableTarget(
        frontierMainGrams,
        proteinUnitFrontier ? 1 : executableJumpGrams,
      );
      if (desiredMainGrams === null) break;
      discreteAttempts += 1;
      const ratio = resolveMainRatioScale(identityInput, set.byLineId, desiredMainGrams);
      if (!ratio.ok) {
        firstHigherRejectedGrams = desiredMainGrams;
        firstHigherRejectedReason = 'batch_or_constraints';
        break;
      }
      const mainByLineId = new Map(
        ratio.allocations.map((allocation) => [allocation.lineId, allocation.grams] as const),
      );
      const mainSet: ConstraintSet = {
        byLineId: {
          ...set.byLineId,
          ...Object.fromEntries(
            [...mainByLineId].map(
              ([lineId, grams]) => [lineId, { mode: 'locked', grams }] as const,
            ),
          ),
        },
      };
      const candidates: Array<{ input: RecipeInput; solverSet: ConstraintSet }> = [];
      for (const seed of frontierInputs) {
        const staged: RecipeInput = {
          ...seed,
          items: seed.items.map((item) => {
            const grams = mainByLineId.get(item.id);
            return grams === undefined ? item : { ...item, planned_grams: grams };
          }),
        };
        const solverSet = solverHolds(staged, mainSet);
        const proportional = rescaleBatchToTarget(
          staged,
          solverSet,
          identityInput.target_batch_grams,
        );
        if (proportional.ok) candidates.push({ input: proportional.input, solverSet });
        const batchDelta = plannedSum(staged) - identityInput.target_batch_grams;
        for (const donor of staged.items) {
          if (
            mainByLineId.has(donor.id) ||
            donor.actual_grams !== null ||
            isConstrained(solverSet, donor.id) ||
            excludedIngredientIds.has(canonicalIngredientId(donor.ingredient))
          )
            continue;
          const nextGrams = donor.planned_grams - batchDelta;
          if (!Number.isFinite(nextGrams) || nextGrams < 0) continue;
          candidates.push({
            solverSet,
            input: {
              ...staged,
              items: staged.items.map((item) =>
                item.id === donor.id ? { ...item, planned_grams: nextGrams } : item,
              ),
            },
          });
        }
      }

      const accepted: Array<{
        exactInput: RecipeInput;
        executableInput: RecipeInput;
        score: number;
      }> = [];
      let rejection: MainFlavourObjectiveProof['firstHigherRejectedReason'] =
        'batch_or_constraints';
      const rejectionPriority: Record<
        Exclude<MainFlavourObjectiveProof['firstHigherRejectedReason'], null>,
        number
      > = {
        batch_or_constraints: 0,
        technical_score_class: 1,
        main_identity: 2,
        hard_gate: 3,
        certified_upper_bound: 4,
      };
      const recordRejection = (
        reason: Exclude<MainFlavourObjectiveProof['firstHigherRejectedReason'], null>,
      ) => {
        if (rejection === null || rejectionPriority[reason] > rejectionPriority[rejection]) {
          rejection = reason;
        }
      };
      const directlyAccepted =
        identityInput.category === 'protein_gelato'
          ? candidates.flatMap(({ input: candidate }) => {
              const practical = practicalizeRecipeCandidate(
                candidate,
                set,
                flavourHeldLineIds(candidate),
              );
              if (!practical.ok) return [];
              const executable = practical.audit.executableInput;
              const score = recipeFitForInput(executable, practical.audit.executableResult).score;
              const admissible =
                verifyMainIngredientIdentity(identityInput, executable).ok &&
                verifyConstraintsPreserved(set, executable).ok &&
                classifyViolationBands(executable).hardMetrics.length <= baselineHardCount &&
                score !== null &&
                score >= baselineScore &&
                assessRecipeDirection(executable, practical.audit.executableResult)
                  .reachedAxisCount >= baselineDirectionReached &&
                preservesProteinFrontier(executable, practical.audit.executableResult) &&
                (normalizeFormulationStrategy(
                  identityInput.goals?.formulation_strategy ?? identityInput.mode,
                ) !== 'eco' ||
                  verifyEcoFlavourProtection(identityInput, executable, {
                    productBehaviorSnapshots: options.productBehaviorSnapshots,
                  }).ok) &&
                (executable.category !== 'vegan_gelato' ||
                  (veganRecipeEligibilityIssues(executable.items).length === 0 &&
                    veganProfileConstraintIssues(executable).length === 0));
              return admissible && score !== null
                ? [{ exactInput: candidate, executableInput: executable, score }]
                : [];
            })
          : [];
      accepted.push(...directlyAccepted);
      const unsettledCandidates = directlyAccepted.length === 0 ? candidates : [];
      const settlementCandidates =
        identityInput.category === 'protein_gelato' && unsettledCandidates.length > 1
          ? [...unsettledCandidates]
              .map((candidate, index) => {
                const result = calculateRecipe(candidate.input);
                return {
                  ...candidate,
                  index,
                  hardCount: classifyViolationBands(candidate.input).hardMetrics.length,
                  score: recipeFitForInput(candidate.input, result).score ?? -Infinity,
                };
              })
              .sort(
                (left, right) =>
                  left.hardCount - right.hardCount ||
                  right.score - left.score ||
                  left.index - right.index,
              )
              .slice(0, 1)
          : unsettledCandidates;
      // Protein fitting is itself a verified multidimensional search. Running
      // that identical search for every near-equivalent donor makes one
      // Preview take minutes. Select its deterministic best native candidate
      // once; standard/vegan/sorbet/chocolate still exhaust every donor path.
      for (const { input: candidate, solverSet } of settlementCandidates) {
        const constrainedIngredientIds = new Set(
          candidate.items
            .filter((item) => isConstrained(solverSet, item.id))
            .map((item) => canonicalIngredientId(item.ingredient)),
        );
        const restore = (next: RecipeInput): RecipeInput => {
          const normalized = rescalePreservingMainGroup(
            identityInput,
            next,
            solverSet,
            identityInput.target_batch_grams,
          );
          return normalized.ok ? normalized.input : next;
        };
        const settledCandidate = iterateSolverToFixedPoint(
          identityInput,
          candidate,
          constrainedIngredientIds,
          restore,
          excludedIngredientIds,
          solverSet,
          options.effectivePriceOverrides,
          baselineScore,
          options.productBehaviorSnapshots,
        ).working;
        const practical = practicalizeRecipeCandidate(
          settledCandidate,
          set,
          flavourHeldLineIds(settledCandidate),
        );
        if (!practical.ok) {
          recordRejection('batch_or_constraints');
          continue;
        }
        const executable = practical.audit.executableInput;
        if (
          !verifyMainIngredientIdentity(identityInput, executable).ok ||
          !verifyConstraintsPreserved(set, executable).ok
        ) {
          recordRejection('main_identity');
          continue;
        }
        if (classifyViolationBands(executable).hardMetrics.length > baselineHardCount) {
          recordRejection('hard_gate');
          continue;
        }
        const score = recipeFitForInput(executable, practical.audit.executableResult).score;
        const directionReached = assessRecipeDirection(
          executable,
          practical.audit.executableResult,
        ).reachedAxisCount;
        if (
          score === null ||
          score < baselineScore ||
          directionReached < baselineDirectionReached
        ) {
          recordRejection('technical_score_class');
          continue;
        }
        if (!preservesProteinFrontier(executable, practical.audit.executableResult)) {
          recordRejection('technical_score_class');
          continue;
        }
        if (
          normalizeFormulationStrategy(
            identityInput.goals?.formulation_strategy ?? identityInput.mode,
          ) === 'eco' &&
          !verifyEcoFlavourProtection(identityInput, executable, {
            productBehaviorSnapshots: options.productBehaviorSnapshots,
          }).ok
        ) {
          recordRejection('main_identity');
          continue;
        }
        if (
          executable.category === 'vegan_gelato' &&
          (veganRecipeEligibilityIssues(executable.items).length > 0 ||
            veganProfileConstraintIssues(executable).length > 0)
        ) {
          recordRejection('hard_gate');
          continue;
        }
        accepted.push({
          exactInput: settledCandidate,
          executableInput: executable,
          score,
        });
      }
      if (accepted.length === 0) {
        if (!proteinUnitFrontier && executableJumpGrams > 1) {
          executableJumpGrams = Math.max(1, Math.floor(executableJumpGrams / 2));
          continue;
        }
        firstHigherRejectedGrams = desiredMainGrams;
        firstHigherRejectedReason = rejection;
        break;
      }
      // VEGAN v2 (additive): among candidates that are already accepted at the
      // SAME Main allocation and score identically, prefer the structurally
      // stronger plant system. Pure tie-break — it never rejects a candidate,
      // never changes Main grams or Multi-Main ratios (they are locked for this
      // step), and returns 0 for every non-Vegan profile and for any candidate
      // whose structural evidence is UNKNOWN.
      accepted.sort(
        (left, right) =>
          right.score - left.score ||
          compareVeganStructuralCandidates(left.executableInput, right.executableInput),
      );
      const winner = accepted[0]!;
      // Once the search is on the discrete executable frontier, its accepted
      // proof must reference the same Engine-verified whole-gram vector that
      // the operator can Apply, while the exact template-controlled stabilizer
      // dose remains the internal scientific source for the later approved
      // practical 1.9 g -> 2 g transform. Keeping every fractional precursor
      // produced a misleading 7/10 proof; replacing Tara itself broke its
      // trustless template-dose gate.
      const winnerExactByLineId = new Map(
        winner.exactInput.items.map((item) => [item.id, item] as const),
      );
      exactAcceptedInput = {
        ...winner.executableInput,
        items: winner.executableInput.items.map((item) => {
          const exact = winnerExactByLineId.get(item.id);
          return exact && isTemplateControlledStabilizer(item.ingredient)
            ? { ...item, planned_grams: exact.planned_grams }
            : item;
        }),
      };
      exactAcceptedMainGrams = mainGroupTotal(identityInput, exactAcceptedInput);
      frontierMainGrams = mainGroupTotal(identityInput, winner.executableInput);
      const uniqueFrontiers = new Map<string, RecipeInput>();
      for (const outcome of accepted) {
        const acceptedExactByLineId = new Map(
          outcome.exactInput.items.map((item) => [item.id, item] as const),
        );
        const nextFrontier: RecipeInput = {
          ...outcome.executableInput,
          items: outcome.executableInput.items.map((item) => {
            const exact = acceptedExactByLineId.get(item.id);
            return exact && isTemplateControlledStabilizer(item.ingredient)
              ? { ...item, planned_grams: exact.planned_grams }
              : item;
          }),
        };
        const key = nextFrontier.items
          .map((item) => `${item.id}:${item.planned_grams.toFixed(8)}`)
          .join('|');
        if (!uniqueFrontiers.has(key)) uniqueFrontiers.set(key, nextFrontier);
      }
      frontierInputs = [...uniqueFrontiers.values()].slice(0, 4);
      executableJumpGrams = proteinUnitFrontier
        ? 1
        : Math.min(identityInput.target_batch_grams, executableJumpGrams * 2);
    }

    if (
      frontierMainGrams >
      mainGroupTotal(identityInput, selectedExecutable) + MAIN_OBJECTIVE_EPSILON_G
    ) {
      selected = {
        input: exactAcceptedInput,
        proof: {
          ...selected.proof,
          status: 'maximized',
          exactAcceptedMainGrams,
          executableMainGrams: frontierMainGrams,
          firstHigherRejectedGrams,
          firstHigherRejectedReason,
          technicalScore: recipeFitForInput(exactAcceptedInput, calculateRecipe(exactAcceptedInput))
            .score,
          attempts: selected.proof.attempts + discreteAttempts,
        },
      };
    } else if (selected.proof.status === 'maximized') {
      selected = {
        ...selected,
        proof: {
          ...selected.proof,
          firstHigherRejectedGrams,
          firstHigherRejectedReason,
          attempts: selected.proof.attempts + discreteAttempts,
        },
      };
    }
  }
  const perIdentity = mainObjectiveCache.get(identityInput) ?? new Map();
  perIdentity.set(cacheKey, selected);
  mainObjectiveCache.set(identityInput, perIdentity);
  return selected;
}

function attachMainObjective(
  preview: ConstraintPreview,
  identityInput: RecipeInput,
  proof: MainFlavourObjectiveProof | null,
): void {
  if (!proof) return;
  // The proof must describe the candidate the preview ACTUALLY carries, because
  // the Apply door re-derives both of these from that candidate and refuses any
  // mismatch. `executableMainGrams` was already refreshed here; `technicalScore`
  // was not, which was harmless only while nothing changed the candidate after
  // the Main frontier ran.
  //
  // Protein v2 broke that assumption: `refineProteinFormulation` re-asserts the
  // HIGH PROTEIN claim on the executable candidate inside `finishPreview`, i.e.
  // after the proof was captured. A Multi-Main Protein recipe was measured
  // carrying `technicalScore: 7` against a candidate that had since become a
  // 10 — Mains intact at 120/60, ratio 2.0, zero violations — and Apply refused
  // it as an unverifiable proof. Refreshing the score from the same candidate
  // keeps the door trustless while letting a genuinely better recipe through.
  // The door re-derives this score from `practicalization.audit.exactInput`
  // when practicalization is ready, and only falls back to the executable
  // candidate otherwise. Mirror that choice EXACTLY: scoring the executable
  // whole-gram vector while the door scores the exact one silently invalidates
  // honest proofs whenever rounding moves the recipe across a score boundary.
  // Measured on Protein @ −12 Sweetness −1: proof carried 9 against an exact
  // candidate the door scored 10, and Apply refused a fully valid Preview.
  const scoredCandidate =
    preview.practicalization?.status === 'ready'
      ? preview.practicalization.audit.exactInput
      : preview.proposedInput;
  const score = recipeFitForInput(scoredCandidate, calculateRecipe(scoredCandidate)).score;
  preview.mainObjective = {
    ...proof,
    executableMainGrams: mainGroupTotal(identityInput, preview.proposedInput),
    ...(score === null ? {} : { technicalScore: score }),
  };
}

/**
 * A Direction solve may reach the requested preference band only by crossing a
 * native hard gate. In that case keep the already-established Main-group
 * objective fixed and find the furthest hard-safe point on the same proposed
 * path. This is product-layer orchestration only: every point is recalculated
 * by the unchanged Engine, and no target band or formula is altered.
 */
function bestHardSafeDirectionSegment(
  identityInput: RecipeInput,
  unsafeInput: RecipeInput,
  set: ConstraintSet,
  excludedIngredientIds: ReadonlySet<string>,
): RecipeInput | null {
  if (
    !identityInput.goals?.direction_targets_active ||
    detectViolations(calculateRecipe(unsafeInput)).length === 0
  ) {
    return null;
  }
  // RC-2b (owner authority 2026-08-23): this search used to refuse to engage
  // whenever the STARTING draft already violated a band. That is precisely when
  // a truthful NEAREST matters most — the Vegan −11 starter begins with 2–3
  // violations, so an unreachable hardness preference produced `unsafe_proposal`
  // and NO Preview at all, even though a legal executable candidate existed.
  // Relaxing the guard cannot leak an illegal result: `admissible()` below still
  // demands zero Engine violations on both the candidate AND its practicalized
  // executable, plus batch total, Main identity and every user constraint.
  const mains = captureMainIngredientIntent(identityInput);
  const unsafeByLineId = new Map(unsafeInput.items.map((item) => [item.id, item] as const));
  const targetMainGrams = mainGroupTotal(identityInput, unsafeInput);
  const mainByLineId = new Map(
    mains.map((main) => [
      main.lineId,
      unsafeByLineId.get(main.lineId)?.planned_grams ?? main.grams,
    ]),
  );
  const staged: RecipeInput = {
    ...identityInput,
    items: identityInput.items.map((item) => {
      const grams = mainByLineId.get(item.id);
      return grams === undefined ? item : { ...item, planned_grams: grams };
    }),
  };
  const mainSet: ConstraintSet = {
    byLineId: {
      ...set.byLineId,
      ...Object.fromEntries(
        [...mainByLineId].map(([lineId, grams]) => [lineId, { mode: 'locked', grams }] as const),
      ),
    },
  };
  const solverSet = solverHolds(staged, mainSet);
  const anchors: RecipeInput[] = [];
  const proportional = rescaleBatchToTarget(staged, solverSet, identityInput.target_batch_grams);
  if (proportional.ok) anchors.push(proportional.input);
  const batchDelta = plannedSum(staged) - identityInput.target_batch_grams;
  for (const donor of staged.items) {
    if (
      mainByLineId.has(donor.id) ||
      donor.actual_grams !== null ||
      isConstrained(solverSet, donor.id) ||
      excludedIngredientIds.has(canonicalIngredientId(donor.ingredient))
    ) {
      continue;
    }
    const grams = donor.planned_grams - batchDelta;
    if (!Number.isFinite(grams) || grams < 0) continue;
    anchors.push({
      ...staged,
      items: staged.items.map((item) =>
        item.id === donor.id ? { ...item, planned_grams: grams } : item,
      ),
    });
  }

  const identityDirectionSeverity = recipeDirectionViolations(identityInput).reduce(
    (sum, violation) => sum + violation.severity_points,
    0,
  );
  const identityDirectionViolationCount = recipeDirectionViolations(identityInput).length;
  const exactDirection = hasActiveExactDirectionObjective(identityInput);
  const admissible = (candidate: RecipeInput): boolean => {
    if (
      Math.abs(plannedSum(candidate) - identityInput.target_batch_grams) > BATCH_SUM_TOLERANCE_G ||
      Math.abs(mainGroupTotal(identityInput, candidate) - targetMainGrams) >
        MAIN_OBJECTIVE_EPSILON_G ||
      !verifyMainIngredientIdentity(identityInput, candidate).ok ||
      !verifyConstraintsPreserved(set, candidate).ok ||
      detectViolations(calculateRecipe(candidate)).length > 0
    ) {
      return false;
    }
    const practical = practicalizeRecipeCandidate(candidate, set, flavourHeldLineIds(candidate));
    if (!practical.ok) return false;
    const executable = practical.audit.executableInput;
    return (
      Math.abs(mainGroupTotal(identityInput, executable) - targetMainGrams) <=
        MAIN_OBJECTIVE_EPSILON_G &&
      verifyMainIngredientIdentity(identityInput, executable).ok &&
      verifyConstraintsPreserved(set, executable).ok &&
      detectViolations(practical.audit.executableResult).length === 0
    );
  };
  const interpolate = (anchor: RecipeInput, ratio: number): RecipeInput => ({
    ...anchor,
    items: anchor.items.map((item) => {
      const unsafe = unsafeByLineId.get(item.id);
      if (!unsafe || mainByLineId.has(item.id)) return item;
      return {
        ...item,
        planned_grams: item.planned_grams + (unsafe.planned_grams - item.planned_grams) * ratio,
      };
    }),
  });

  let best: { input: RecipeInput; violations: number; severity: number; ratio: number } | null =
    null;
  for (const anchor of anchors) {
    if (!admissible(anchor)) continue;
    let low = 0;
    let high = 1;
    let accepted = anchor;
    for (let index = 0; index < 18; index += 1) {
      const ratio = (low + high) / 2;
      const candidate = interpolate(anchor, ratio);
      if (admissible(candidate)) {
        low = ratio;
        accepted = candidate;
      } else {
        high = ratio;
      }
    }
    const acceptedViolations = recipeDirectionViolations(accepted);
    const violations = acceptedViolations.length;
    const severity = acceptedViolations.reduce(
      (sum, violation) => sum + violation.severity_points,
      0,
    );
    const improvesIdentity = exactDirection
      ? violations < identityDirectionViolationCount ||
        (violations === identityDirectionViolationCount &&
          severity < identityDirectionSeverity - SEVERITY_EPS)
      : severity < identityDirectionSeverity - SEVERITY_EPS;
    if (
      improvesIdentity &&
      (best === null ||
        (exactDirection
          ? violations < best.violations ||
            (violations === best.violations && severity < best.severity - SEVERITY_EPS) ||
            (violations === best.violations &&
              Math.abs(severity - best.severity) <= SEVERITY_EPS &&
              low > best.ratio)
          : severity < best.severity - SEVERITY_EPS ||
            (Math.abs(severity - best.severity) <= SEVERITY_EPS && low > best.ratio)))
    ) {
      best = { input: accepted, violations, severity, ratio: low };
    }
  }
  return best?.input ?? null;
}

/**
 * Seed a formulation proposal into the canonical solver loop: one row per
 * canonical identity, batch equality restored, then ITERATE to the verified
 * fixed point. Shared by the formulation preview builder AND the
 * nearest-feasible bisection probes (owner Agent 3 — identical machinery, so
 * the bisection is engine-verified by construction).
 */
function iterateFormulationSeed(
  input: RecipeInput,
  set: ConstraintSet,
  proposedInput: RecipeInput,
  options: OptimizePreviewOptions = {},
): ReturnType<typeof iterateSolverToFixedPoint> {
  const solverSet = solverHolds(proposedInput, set);
  const constrainedIngredientIds = new Set(
    proposedInput.items
      .filter((item) => isConstrained(solverSet, item.id))
      .map((item) => canonicalIngredientId(item.ingredient)),
  );
  const restore = (candidate: RecipeInput): RecipeInput => {
    const batchIsExact =
      Math.abs(plannedSum(candidate) - input.target_batch_grams) <= BATCH_SUM_TOLERANCE_G;
    const constraintsAreExact = verifyConstraintsPreserved(solverSet, candidate).ok;
    if (batchIsExact && constraintsAreExact) {
      return candidate;
    }
    const restored = rescalePreservingMainGroup(
      input,
      candidate,
      solverSet,
      input.target_batch_grams,
    );
    return restored.ok ? restored.input : candidate;
  };
  const seeded = restore(
    ensureUniqueLineIds(input, mergeByCanonicalIdentity(input, proposedInput)),
  );
  // Agent R handoff: solver rounds honor the SAME exclusions the seed honored.
  // Owner CURRENT-DRAFT P0: the §17 set rides along so the current-draft
  // candidate vector can never move an exact-locked / range-held line.
  return iterateSolverToFixedPoint(
    input,
    seeded,
    constrainedIngredientIds,
    restore,
    new Set(options.excludedIngredientIds ?? []),
    solverSet,
    options.effectivePriceOverrides,
    null,
    options.productBehaviorSnapshots,
  );
}

/* ── dominant-lock infeasibility (owner Agent 3) ─────────────────────────── */

/** The DOMINANT held constraint: the locked/range/grams-locked line holding the
 * largest grams (deterministic: first line wins a tie). */
function dominantHeldConstraint(
  input: RecipeInput,
  set: ConstraintSet,
): {
  lineId: string;
  ingredientName: string;
  kind: 'locked' | 'range' | 'grams_lock';
  grams: number;
} | null {
  let best: {
    lineId: string;
    ingredientName: string;
    kind: 'locked' | 'range' | 'grams_lock';
    grams: number;
  } | null = null;
  for (const item of input.items) {
    const constraint = set.byLineId[item.id];
    let kind: 'locked' | 'range' | 'grams_lock' | null = null;
    let grams = 0;
    if (constraint?.mode === 'locked') {
      kind = 'locked';
      grams = constraint.grams;
    } else if (constraint?.mode === 'range') {
      kind = 'range';
      grams = constraint.minGrams;
    } else if (item.lock_type === 'grams' && item.planned_grams > 0) {
      kind = 'grams_lock';
      grams = item.planned_grams;
    }
    if (kind === null) continue;
    if (best === null || grams > best.grams) {
      best = { lineId: item.id, ingredientName: item.ingredient.name, kind, grams };
    }
  }
  return best;
}

/** Deterministic bisection budget for the nearest-feasible search. */
export const NEAREST_FEASIBLE_BISECTION_STEPS = 16;

/** Engine-verified feasibility probe: lock the conflicting line at `grams`,
 * run the SAME constrained-formulation machinery, and require the final state
 * to violate NO hard NATIVE band AND to have converged WITHOUT hitting the
 * iteration cap (ACCEPTANCE ADDENDUM 1: a capped run proves nothing, so it can
 * never certify feasibility). PURE and deterministic. */
function lockProbeFeasible(
  input: RecipeInput,
  set: ConstraintSet,
  template: FormulationTemplate,
  options: FormulationOptions,
  lineId: string,
  grams: number,
): boolean {
  const probeInput: RecipeInput = {
    ...input,
    items: input.items.map((item) =>
      item.id === lineId ? { ...item, planned_grams: grams } : item,
    ),
  };
  const probeSet: ConstraintSet = {
    byLineId: { ...set.byLineId, [lineId]: { mode: 'locked', grams } },
  };
  const built = buildFormulationProposal(
    probeInput,
    probeSet,
    template,
    'constrained_reformulation',
    options,
  );
  if (!built.ok) return false;
  if (built.proposal.missingHardRoles.length > 0) return false;
  const iterated = iterateFormulationSeed(
    probeInput,
    probeSet,
    built.proposal.proposedInput,
    options,
  );
  if (iterated.diagnostics.capped) return false;
  return classifyViolationBands(iterated.working).hardMetrics.length === 0;
}

/**
 * NEAREST FEASIBLE LOCK VALUE (owner Agent 3 contract): the maximum grams of
 * the conflicting lock for which a hard-band-feasible constrained formulation
 * exists — computed by DETERMINISTIC bisection between the template's own role
 * target (the verified feasible anchor) and the infeasible lock value, each
 * probe engine-verified through the full pipeline. No invented science: every
 * number returned has been proven feasible by the engine itself. Returns null
 * when no feasible anchor exists (honest "no alternative computable").
 */
function computeNearestFeasibleLockGrams(
  input: RecipeInput,
  set: ConstraintSet,
  template: FormulationTemplate,
  options: FormulationOptions,
  conflict: { lineId: string; grams: number },
): number | null {
  const line = input.items.find((item) => item.id === conflict.lineId);
  if (!line) return null;
  const role = resolveFunctionalRole(line.ingredient);
  const roleTarget = template.roles.find((target) => target.role === role);
  const scale = input.target_batch_grams / template.baseBatchG;
  /**
   * The FEASIBLE ANCHOR the bisection starts from.
   *
   * OWNER FINAL INTEGRATION ADDENDUM item 1 (2026-07-25): after the canonical-
   * family rule, a dairy fruit gelato seeds from an APPROVED milk template that
   * carries no `fruit` role at all, so `roleTarget` is undefined and the search
   * used to bail out with "no computable alternative" — losing the single most
   * useful thing the honest refusal can say. The approved template's own amount
   * for a role it does not contain IS zero, and that is a real, approved,
   * engine-verifiable state (it is literally the approved base recipe), so 0 g
   * is the honest anchor. Nothing is invented: the anchor is only a STARTING
   * point and `lockProbeFeasible` engine-verifies it (and every bisection step)
   * through the full pipeline before any value is ever reported.
   */
  const anchor = roleTarget ? roleTarget.grams * scale : 0;
  if (!(anchor >= 0) || anchor >= conflict.grams) return null;
  const feasible = (grams: number): boolean =>
    lockProbeFeasible(input, set, template, options, conflict.lineId, grams);
  if (!feasible(anchor)) return null;
  let lo = anchor; // proven feasible
  let hi = conflict.grams; // proven infeasible by the caller's outcome
  for (let step = 0; step < NEAREST_FEASIBLE_BISECTION_STEPS; step += 1) {
    const mid = (lo + hi) / 2;
    if (feasible(mid)) lo = mid;
    else hi = mid;
  }
  // Present a stable 0.1 g value — VERIFIED by the engine, never assumed.
  let candidate = Math.floor(lo * 10) / 10;
  for (let attempt = 0; attempt < 3 && candidate > anchor; attempt += 1) {
    if (feasible(candidate)) return candidate;
    candidate = Math.round((candidate - 0.1) * 10) / 10;
  }
  return anchor; // verified feasible above
}

/**
 * FULL FORMULATION preview (owner P0): approved-template seed mapped onto the
 * user's selection → fine-tuned by the EXISTING correction solver → verified.
 * The template provides technological starting proportions; arbitrary draft
 * ratios (8 × 1 g) are never preserved and never proportionally rescaled.
 */
function buildFormulationPreviewInternal(
  input: RecipeInput,
  set: ConstraintSet,
  template: NonNullable<ReturnType<typeof routeFormulationMode>['template']>,
  mode: FormulationMode,
  createdAt: string,
  options: OptimizePreviewOptions,
  /** Owner Phase 6 (NIGHTLY): TRUE when invoked as the template-seeded
   * fallback after a local-corrector failure (provenance marker only). */
  localFallback = false,
): BuildPreviewResult {
  const built = buildFormulationProposal(input, set, template, mode, options);
  if (!built.ok) {
    if (built.code === 'main_ratio_conflict') return built;
    if (built.code === 'main_ingredient_unavailable') return built;
    if (built.code === 'missing_required_role') {
      return {
        ok: false,
        code: 'missing_required_role',
        role: built.role,
        messagePl: built.messagePl,
        roleTrace: built.roleTrace,
      };
    }
    if (built.code === 'no_adjustable_lines') {
      // Owner P0 Phase 9 (truthful messages): the locked sum FITS the target —
      // never claim „zablokowana suma przekracza partię" here.
      return { ok: false, code: 'rescale_no_scalable' };
    }
    return { ok: false, code: 'rescale_locked_sum', minimumBatchGrams: built.lockedSum };
  }
  // Phase 10 — a proposal missing a HARD technological role may never become a
  // preview (soft gaps continue with an honest lower score + recommendations).
  // ORDER (owner Phase 3): this completeness check runs only AFTER user-role
  // resolution, canonical toolbox auto-fill and amount computation — a role is
  // missing only if no approved, not-explicitly-excluded candidate existed.
  if (built.proposal.missingHardRoles.length > 0) {
    return {
      ok: false,
      code: 'missing_required_role',
      role: built.proposal.missingHardRoles[0]!,
      messagePl:
        `Brakuje składnika w twardej roli technologicznej: ` +
        `${built.proposal.missingHardRoles.join(', ')}. ` +
        `Dodaj zatwierdzony składnik tej roli, aby PI mogło ułożyć recepturę.`,
      roleTrace: built.proposal.roleTrace,
    };
  }

  const violationsBefore = violationCount(calculateRecipe(input));

  // One row per canonical identity + batch equality, then fine-tune with the
  // EXISTING bounded correction solver — ITERATED to a verified fixed point
  // (owner P0 NIGHTLY FAILURE 2: template-seed → engine → verified corrections
  // WHILE verified improvement exists; never 1 round by construction).
  // Fallback bands guide the iteration; the honest partial score labelling for
  // provisional profiles is kept unchanged.
  const ownerInulinAbsent = !built.proposal.proposedInput.items.some(
    (item) => canonicalIngredientId(item.ingredient) === 'PI-ING-000456' && item.planned_grams > 0,
  );
  const baseSolverSet = solverHolds(built.proposal.proposedInput, set);
  const solverSet: ConstraintSet = ownerInulinAbsent
    ? {
        byLineId: {
          ...baseSolverSet.byLineId,
          ...Object.fromEntries(
            built.proposal.proposedInput.items
              .filter(
                (item) =>
                  canonicalIngredientId(item.ingredient) === 'PI-ING-000456' &&
                  item.planned_grams <= 0,
              )
              .map((item) => [item.id, { mode: 'locked' as const, grams: 0 }]),
          ),
        },
      }
    : baseSolverSet;
  const solverOptions: OptimizePreviewOptions = ownerInulinAbsent
    ? {
        ...options,
        excludedIngredientIds: [
          ...new Set([...(options.excludedIngredientIds ?? []), 'inulin', 'PI-ING-000456']),
        ],
      }
    : options;
  const iterated = iterateFormulationSeed(
    input,
    solverSet,
    built.proposal.proposedInput,
    solverOptions,
  );
  const manualTarget = projectManualIngredientTarget(input, set, solverOptions, iterated.working);
  const manualTargetInput = manualTarget.proof ? manualTarget.input : iterated.working;
  const mainObjective = maximizeMainFlavourObjective(input, manualTargetInput, set, solverOptions);
  let working = mainObjective.input;
  const solverRounds = iterated.diagnostics.solverInvocations;
  const lastProposal = iterated.lastProposal;

  // An exact Main lock can make the whole recipe technically impossible even
  // when the generic fixed-point loop stops without exhausting its iteration
  // budget. The Main frontier already proved that contract infeasible; never
  // turn the unchanged, off-batch diagnostic vector into a Preview. Relax only
  // the conflicting quantity constraint and rerun the same certified frontier
  // to report the nearest executable Main amount without inventing a value.
  const heldMainProof = mainObjective.proof;
  const heldMainConflict =
    mode === 'constrained_reformulation' &&
    heldMainProof?.status === 'held_by_contract' &&
    !heldMainProof.provenMaximum
      ? dominantHeldConstraint(input, set)
      : null;
  if (heldMainConflict !== null) {
    const relaxedSet: ConstraintSet = {
      byLineId: Object.fromEntries(
        Object.entries(set.byLineId).filter(([lineId]) => lineId !== heldMainConflict.lineId),
      ),
    };
    const relaxedMain = maximizeMainTechnicalObjective(input, relaxedSet, options);
    const nearestFeasibleGrams =
      relaxedMain.proof?.provenMaximum === true
        ? (relaxedMain.input.items.find((item) => item.id === heldMainConflict.lineId)
            ?.planned_grams ?? null)
        : null;
    const residualViolations = detectViolations(calculateRecipe(working));
    const conflictLine = input.items.find((item) => item.id === heldMainConflict.lineId);
    const fruitConflict =
      conflictLine !== undefined && resolveFunctionalRole(conflictLine.ingredient) === 'fruit';
    const sorbetTemplate =
      fruitConflict && input.category !== 'sorbet'
        ? selectFormulationTemplate('sorbet', input.target_temperature_c).template
        : null;
    return {
      ok: false,
      code: 'impossible_under_constraints',
      conflict: heldMainConflict,
      hardViolatedMetrics: classifyViolationBands(working).hardMetrics,
      residualViolatedMetrics: [
        ...new Set(residualViolations.map((violation) => violation.metric)),
      ],
      capReached: false,
      nearestFeasibleGrams,
      alternativeProductType: sorbetTemplate ? 'sorbet' : null,
      solverInvocations: solverRounds,
      iteration: iterated.diagnostics,
      templateId: template.templateId,
      templateStatus: template.status,
    };
  }

  // Acceptance: an UNCONSTRAINED formulation must BEAT the draft's null
  // hypothesis (never merely equal a proportional projection — the 8 × 125 g
  // rule). A CONSTRAINED reformulation is different (owner P0): with exact
  // locks / ranges / exclusions, the constrained optimum may legitimately
  // EQUAL the projection — but ONLY with the explicit authenticity proof
  // (owner Agent 3): the verdict below, the scaling-detector evidence and the
  // attempted-move log ride the preview, and hard NATIVE-band failure after
  // real engine moves becomes the honest `impossible_under_constraints`.
  // SHARED DIRECTION NEAREST — deliberately ranked BEFORE the concession check
  // below. That branch bails out with `no_proposal` and leaves the user on the
  // unchanged draft, describing it as "nearest-achievable"; measured on the
  // Gelato −13 starter at Sweetness 0 the unchanged draft sat at POD 16.3677
  // (distance 1.3677 from [14,15]) while a legal 15.1365 candidate — distance
  // 0.1365 — was reachable from the same draft. Conceding while something
  // strictly nearer exists is precisely the non-nearest NEAREST this fixes.
  const directionRanked = polishDirectionVector(
    input,
    set,
    improveDirectionNearestVector(input, set, working, createdAt, options),
    createdAt,
    options,
  );
  // §13 — NEVER carry a stale Main proof. The Main frontier ran against the
  // pre-ranking candidate and the Apply door re-derives `exactAcceptedMainGrams`
  // and `technicalScore` from whatever the Preview actually carries, so the
  // certified frontier is rebuilt whenever the ranking replaced the candidate.
  const rankedMainObjective =
    directionRanked === working
      ? mainObjective
      : maximizeMainFlavourObjective(input, directionRanked, set, solverOptions);
  working = rankedMainObjective.input;

  const afterViolationList = detectViolations(calculateRecipe(working));
  if (mode !== 'constrained_reformulation' && !beatsBaseline(input, working)) {
    const exactDirectionActive = hasActiveExactDirectionObjective(input);
    const baselineDirectionViolations = exactDirectionActive
      ? recipeDirectionViolations(input)
      : [];
    const nativeSafeDirectionFixedPoint =
      exactDirectionActive &&
      baselineDirectionViolations.length > 0 &&
      detectViolations(calculateRecipe(input)).length === 0;
    if (nativeSafeDirectionFixedPoint) {
      // A complete native-safe draft can route through the approved template
      // when the local exact-Direction search reaches a fixed point (notably
      // the six-line 1000 g starter without Inulin). If that seeded vector is
      // still native-unsafe, this is proof of NO applicable formulation — not
      // an unsafe recipe proposal. Preserve the unchanged safe draft and let
      // the surface report the exact target as nearest-achievable.
      return {
        ok: false,
        code: 'no_proposal',
        violatedMetrics: [
          ...new Set(baselineDirectionViolations.map((violation) => violation.metric)),
        ],
        solverInvocations: solverRounds,
        directionTargetUnreached: true,
        iteration: iterated.diagnostics,
      };
    }
    return {
      ok: false,
      code: 'unsafe_proposal',
      violatedMetrics: [...new Set(afterViolationList.map((v) => v.metric))],
      solverInvocations: solverRounds,
      batchOnly: false,
      iteration: iterated.diagnostics,
    };
  }

  /* ── AUTHENTICITY VERDICT (owner Agent 3 contract) ─────────────────────── */

  // Held lines prove nothing in the proportional-scaling detector. The actual
  // verdict is computed below, once practicalization has established the
  // canonical whole-gram proposal.
  const heldLineIds = new Set(
    working.items
      .filter((item) => isConstrained(solverSet, item.id) || item.lock_type !== 'unlocked')
      .map((item) => item.id),
  );
  const appliedMoves = iterated.diagnostics.rounds.length - 1;
  const bands = classifyViolationBands(working);

  // DOMINANT-LOCK INFEASIBILITY (owner Agent 3) + ACCEPTANCE ADDENDUM (1) —
  // T9 APPLICABILITY GATE: a constrained reformulation whose deterministic
  // move search exhausted its budget WITHOUT ever proving a fixed point
  // (`capped` — the milk-900 / strawberry-900 signature: an asymptotic chase
  // that can never reach the approved ranges under the dominant lock) is
  // NEVER an applicable recipe, WHATEVER the band provenance of the residual
  // violations (`iteration_cap` can NEVER be labelled best-achievable proof).
  // This is the honest `impossible_under_constraints`, carrying the exact
  // conflict, the engine-verified nearest feasible lock value (bisection) and
  // — when the conflicting lock is a fruit role with an approved sorbet
  // template at this temperature — the deterministic product-type alternative.
  //
  // BOUNDARY (addendum 1, deliberately preserved): a VERIFIED fixed point
  // (never the cap) with residual violations is the PROVEN best-achievable
  // state — presented WITH the proof. Hard-NATIVE residuals are then blocked
  // at the Apply door (addendum 3 — diagnostic preview only); soft/provisional
  // residuals stay applicable with explanation.
  // BOUNDARY (owner P1-A): `capped` was introduced for the asymptotic chase
  // that can never reach the APPROVED BANDS under a dominant lock — the
  // milk-900 / strawberry-900 signature above — and that signature ALWAYS
  // leaves residual band violations behind. A capped search whose candidate is
  // fully engine-clean is different: the budget was spent chasing an unreachable
  // DIRECTION PREFERENCE, and Direction is a preference while Main identity,
  // Main ratio, locks, ranges and feasibility are the hard constraints.
  //
  // Such a candidate must still be PRESENTED — deleting it produced the owner
  // 2:1 Multi-Main + range + Direction regression, where a valid banana 300 /
  // strawberry 150 candidate (exact 2:1, inside its range, batch exact, zero
  // violations) was reported as `impossible_under_constraints`. It is presented
  // as the honest nearest-achievable state and, because the cap really did fire,
  // it stays DIAGNOSTIC ONLY: the Apply door's iteration-cap gate is untouched,
  // so a capped preview still cannot commit.
  const cappedCandidateIsEngineClean =
    bands.hardMetrics.length === 0 && afterViolationList.length === 0;
  if (
    mode === 'constrained_reformulation' &&
    iterated.diagnostics.capped &&
    !cappedCandidateIsEngineClean
  ) {
    const conflict = dominantHeldConstraint(input, set);
    const conflictLine = conflict
      ? input.items.find((item) => item.id === conflict.lineId)
      : undefined;
    const fruitConflict =
      conflictLine !== undefined && resolveFunctionalRole(conflictLine.ingredient) === 'fruit';
    const sorbetTemplate =
      fruitConflict && input.category !== 'sorbet'
        ? selectFormulationTemplate('sorbet', input.target_temperature_c).template
        : null;
    return {
      ok: false,
      code: 'impossible_under_constraints',
      conflict,
      hardViolatedMetrics: bands.hardMetrics,
      residualViolatedMetrics: [...new Set(afterViolationList.map((v) => v.metric))],
      capReached: true,
      nearestFeasibleGrams: conflict
        ? computeNearestFeasibleLockGrams(input, set, template, options, conflict)
        : null,
      alternativeProductType: sorbetTemplate ? 'sorbet' : null,
      solverInvocations: solverRounds,
      iteration: iterated.diagnostics,
      templateId: template.templateId,
      templateStatus: template.status,
    };
  }

  // The stabilizer-dose note appears exactly when the FINAL exact-search dose
  // is still the template-inherited value (owner addendum 3).
  const stabilizer = built.proposal.stabilizerDose;
  const stabilizerLine = stabilizer
    ? working.items.find((item) => item.id === stabilizer.lineId)
    : undefined;
  const stabilizerDoseNotePl =
    stabilizer !== null &&
    stabilizer.inherited &&
    stabilizerLine !== undefined &&
    Math.abs(stabilizerLine.planned_grams - stabilizer.scaledTemplateGrams) <= 0.05
      ? STABILIZER_TEMPLATE_DOSE_NOTE_PL
      : null;
  // Agent 1 §5.2 repair: `added[].grams` must report the FINAL post-iteration
  // truth (the diff rows already do) — one Preview, one set of numbers.
  const finalAdded = built.proposal.added.map((addedLine) => {
    const finalLine = working.items.find(
      (item) =>
        canonicalIngredientId(item.ingredient) ===
        canonicalIngredientIdFromSourceId(addedLine.ingredientId),
    );
    return finalLine ? { ...addedLine, grams: finalLine.planned_grams } : addedLine;
  });

  const explanation = lastProposal
    ? buildProposalExplanation(working, set, lastProposal)
    : ((): ConstraintExplanationEntry[] => {
        const lockedNames = lockedIngredientNames(input, set);
        return lockedNames.length > 0
          ? [{ kind: 'locked_unchanged', ingredientNames: lockedNames }]
          : [];
      })();

  // GLOBAL TARGET-MASS INVARIANT. A successful executable proposal must land on
  // `target_batch_grams`. When the draft already satisfies every band AND the
  // active Direction preference, the solver makes no move, so an off-target draft
  // could previously be handed straight back as an ok:true proposal that still
  // missed the batch (fuzz seed 454174848: a 951 g draft against a 1000 g target,
  // returned unchanged; the same draft with Direction inactive reconciled to
  // 1000 g, which is what made the bypass visible). Restore the batch through the
  // SAME normaliser the solver seed uses — it preserves the Main group and the
  // user's intent, so this cannot buy mass by breaking a higher authority.
  const rankedOnTargetBatch = ((): RecipeInput => {
    const candidate = rankedMainObjective.input;
    const target = input.target_batch_grams;
    if (!(target > 0)) return candidate;
    if (Math.abs(plannedSum(candidate) - target) <= BATCH_SUM_TOLERANCE_G) return candidate;
    const restored = rescalePreservingMainGroup(
      input,
      candidate,
      solverHolds(candidate, set),
      target,
    );
    return restored.ok ? restored.input : candidate;
  })();

  const preview = finishPreview(
    'optimize',
    copy.preview.kindLabels.optimize,
    input,
    set,
    rankedOnTargetBatch,
    set,
    violationsBefore,
    explanation,
    createdAt,
  );
  // `finishPreview` practicalizes the exact solver candidate and makes the
  // whole-gram recipe the canonical proposal.  From this point onward every
  // operator-facing verdict must use that same executable input.  Reusing
  // `working` here can otherwise leave a fractional boundary violation in the
  // diagnostic flags even though the presented/applied whole-gram recipe is
  // fully in range.
  const executableBands = classifyViolationBands(preview.proposedInput);
  const executableViolationsAfter = preview.violationsAfter;
  const executableScaling = detectProportionalScaling(
    built.proposal.seedBaselineGrams,
    preview.proposedInput,
    heldLineIds,
  );
  const executableVerdict: FormulationProofVerdict =
    executableViolationsAfter === 0
      ? 'all_bands_in_range'
      : executableScaling.proportional || appliedMoves === 0
        ? 'no_feasible_improvement'
        : 'engine_improved';
  const executableBestEffortReasons: FormulationProof['bestEffortReasons'] = [];
  if (executableBands.bandSource !== 'native' || executableBands.temperatureFallback) {
    executableBestEffortReasons.push('provisional_bands');
  }
  if (template.status !== 'approved') {
    executableBestEffortReasons.push('reference_derived_template');
  }
  if (iterated.diagnostics.capped) executableBestEffortReasons.push('iteration_capped');
  if (executableViolationsAfter > 0 && !iterated.diagnostics.capped) {
    executableBestEffortReasons.push('residual_violations_proven_unfixable');
  }
  const proof: FormulationProof = {
    verdict: executableVerdict,
    improvingMoves: appliedMoves,
    solverInvocations: solverRounds,
    proportionalProjection: executableScaling.proportional,
    sharedScaleFactor: executableScaling.sharedFactor,
    bestEffort: executableBestEffortReasons.length > 0,
    bestEffortReasons: executableBestEffortReasons,
    stabilizerDoseNotePl,
  };
  attachMainObjective(preview, input, rankedMainObjective.proof);
  preview.autoBalance = { batchRescaled: true, solverRounds };
  preview.iteration = iterated.diagnostics;
  preview.formulation = {
    mode,
    templateId: built.proposal.templateId,
    templateStatus: built.proposal.templateStatus,
    added: finalAdded,
    missingRoles: built.proposal.missingRoles,
    recommendations: built.proposal.recommendations,
    keptFixed: built.proposal.keptFixed,
    roleTrace: built.proposal.roleTrace,
    localFallback,
    proof,
  };
  // ACCEPTANCE ADDENDUM (1+3): diagnostic classification of the preview —
  // hard-NATIVE residuals or a capped iteration make it DIAGNOSTIC ONLY (the
  // door re-derives both trustlessly; this marks the presentation honestly).
  preview.hardResidualMetrics = executableBands.hardMetrics;
  // Owner addendum item 2: a non-approved formulation seed is DIAGNOSTIC ONLY,
  // whatever the score — the door refuses it independently.
  const referenceDerived = !isApprovedTemplateId(built.proposal.templateId);
  const proteinResidual =
    preview.proteinFormulation?.applicable === true &&
    !preview.proteinFormulation.qualification.qualified;
  const practicalizationBlocked = preview.practicalization?.status === 'blocked';
  preview.diagnosticOnly =
    practicalizationBlocked ||
    executableBands.hardMetrics.length > 0 ||
    iterated.diagnostics.capped ||
    referenceDerived ||
    proteinResidual;
  preview.diagnosticReason = practicalizationBlocked
    ? 'practicalization_blocked'
    : referenceDerived
      ? 'reference_derived'
      : executableBands.hardMetrics.length > 0
        ? 'hard_residual'
        : iterated.diagnostics.capped
          ? 'iteration_cap'
          : proteinResidual
            ? 'protein_claim_residual'
            : undefined;
  // The full-formulation route must enforce the same executable Direction
  // null-hypothesis as local correction. A native-safe recipe cannot surface
  // an unchanged (or worse) whole-gram Preview merely because the router used
  // an approved template before returning to the exact Direction objective.
  const baselineDirection = recipeDirectionViolations(input);
  if (
    input.category === 'sorbet' &&
    hasActiveExactDirectionObjective(input) &&
    detectViolations(calculateRecipe(input)).length === 0 &&
    baselineDirection.length > 0
  ) {
    const executableDirection = recipeDirectionViolations(preview.proposedInput);
    const baselineSeverity = baselineDirection.reduce(
      (sum, violation) => sum + violation.severity_points,
      0,
    );
    const executableSeverity = executableDirection.reduce(
      (sum, violation) => sum + violation.severity_points,
      0,
    );
    const executableImproves =
      executableDirection.length < baselineDirection.length ||
      (executableDirection.length === baselineDirection.length &&
        executableSeverity < baselineSeverity - SEVERITY_EPS);
    if (!executableImproves) {
      return {
        ok: false,
        code: 'no_proposal',
        violatedMetrics: [...new Set(baselineDirection.map((violation) => violation.metric))],
        solverInvocations: solverRounds,
        directionTargetUnreached: true,
        iteration: iterated.diagnostics,
      };
    }
  }
  return mainSafePreview(input, preview, options.productBehaviorSnapshots);
}

/**
 * Owner CURRENT-DRAFT P0 (Phase 4): assemble the evidence a „no further safe
 * improvement" stop must carry. PURE — it only reports what the optimizer
 * really did; it never re-runs or re-judges anything.
 */
function buildBestSafeEvidence(
  input: RecipeInput,
  set: ConstraintSet,
  iteration: IterationDiagnostics | undefined,
  bands: ReturnType<typeof classifyViolationBands>,
  options: FormulationOptions,
): BestSafeEvidence {
  const vector =
    iteration?.candidateVector ??
    buildDraftCandidateVector(input, set, new Set(options.excludedIngredientIds ?? [])).map(
      (candidate) => ({
        lineId: candidate.lineId,
        ingredientId: candidate.ingredientId,
        ingredientName: candidate.ingredientName,
        currentGrams: candidate.currentGrams,
        increasable: candidate.increasable,
        testedGrams: candidate.testedGrams,
      }),
    );
  return {
    solverInvocations: iteration?.solverInvocations ?? 0,
    draftVectorSearches: iteration?.draftVectorSearches ?? 0,
    iterations: Math.max(0, (iteration?.rounds.length ?? 1) - 1),
    testedCandidates: vector.map((candidate) => ({
      ingredientName: candidate.ingredientName,
      currentGrams: candidate.currentGrams,
      testedFromGrams:
        candidate.testedGrams.length > 0 ? candidate.testedGrams[0]! : candidate.currentGrams,
      testedToGrams:
        candidate.testedGrams.length > 0
          ? candidate.testedGrams[candidate.testedGrams.length - 1]!
          : candidate.currentGrams,
    })),
    limitingMetrics: [...bands.hardMetrics, ...bands.softMetrics],
    provisionalProfile: bands.bandSource !== 'native' || bands.temperatureFallback,
  };
}

/**
 * „Przelicz z PI” (owner P0 — REAL AUTO-BALANCE): recalculate and automatically
 * balance the COMPLETE current recipe. Composes ONLY approved mechanisms — no
 * new math, no science change:
 *   1. batch reconciliation FIRST — a planned recipe off its target batch is
 *      restored through the approved §17.4 `rescaleBatchToTarget` (locked grams
 *      byte-exact; per-100 g concentrations preserved), so a 5 g draft against
 *      a 1000 g target is a solvable recipe, not a dead end;
 *   2. violations on the batch-true recipe → none? `already_clean` (or the
 *      batch-restore preview when step 1 changed something);
 *   3. otherwise ITERATE the canonical solver (`proposeAutoFix`/`applyAutoFix`,
 *      each round Golden-Middle-verified by the engine itself) to a fixed point
 *      (≤ MAX_SOLVER_ROUNDS), merging by canonical identity and restoring the
 *      batch after every round;
 *   4. something changed → verified Preview; NOTHING changed → a PROVEN
 *      failure carrying the solver-invocation count and the exact violated
 *      metrics — never one generic sentence for every input.
 * Never mutates, never persists; §17 locks respected structurally throughout.
 */
/**
 * SORBET EXACT FIVE-STEP DIRECTION — the SHARED candidate boundary (owner
 * 2026-08-22, Main-constrained NEAREST).
 *
 * Order of authority for an active exact Direction objective:
 *   1. the closed-form exact projection (Main, Inulin, stabilizer byte-exact);
 *   2. when it has no admissible/executable solution, the bounded
 *      Main-constrained NEAREST search over the same adjustable roles;
 *   3. only when neither yields a legal improvement, the regular optimizer
 *      paths continue and may report an honest no-correction.
 * A fixed Main is an equality constraint that reduces the search space — it
 * never disables the search. Every candidate still crosses the normal
 * whole-gram, hard-band, constraint, identity and Apply gates; the door
 * re-derives the same deterministic candidate from the trusted draft.
 */
function buildSorbetDirectionCandidatePreview(params: {
  input: RecipeInput;
  working: RecipeInput;
  set: ConstraintSet;
  solverSet: ConstraintSet;
  createdAt: string;
  options: OptimizePreviewOptions;
  violationsBefore: number;
  batchRescaled: boolean;
}): BuildPreviewResult | null {
  const { input, working, set, solverSet, createdAt, options, violationsBefore, batchRescaled } =
    params;
  if (input.category !== 'sorbet' || !hasActiveExactDirectionObjective(input)) return null;
  const directionSeverity = (candidate: ReturnType<typeof recipeDirectionViolations>) =>
    candidate.reduce((sum, violation) => sum + violation.severity_points, 0);
  const beforeDirection = recipeDirectionViolations(input);
  const isAdjustable = (item: RecipeInput['items'][number]): boolean =>
    item.lock_type === 'unlocked' &&
    item.actual_grams === null &&
    (solverSet.byLineId[item.id] === undefined || solverSet.byLineId[item.id]?.mode === 'ai');
  const generators: ReadonlyArray<{
    source: NonNullable<ConstraintPreview['directionCandidateSource']>;
    generate: () => RecipeInput | null;
  }> = [
    {
      source: 'sorbet_exact_projection',
      generate: () => projectSorbetExactDirectionCandidate(working),
    },
    {
      source: 'sorbet_nearest_search',
      generate: () =>
        searchSorbetNearestDirectionCandidate({
          input: working,
          isAdjustable,
          extraAdjustableLineIds: options.rescueSimulationLineIds,
        })?.candidate ?? null,
    },
  ];
  for (const generator of generators) {
    const candidate = generator.generate();
    if (candidate === null || !verifyConstraintsPreserved(solverSet, candidate).ok) continue;
    const changed = candidate.items.some(
      (item, index) =>
        Math.abs(item.planned_grams - (input.items[index]?.planned_grams ?? Number.NaN)) > 1e-9,
    );
    if (!changed) continue;
    const preview = finishPreview(
      'optimize',
      copy.preview.kindLabels.optimize,
      input,
      set,
      candidate,
      set,
      violationsBefore,
      [],
      createdAt,
    );
    const executableResult = calculateRecipe(preview.proposedInput);
    const afterDirection = recipeDirectionViolations(preview.proposedInput);
    const improvesDirection =
      afterDirection.length < beforeDirection.length ||
      (afterDirection.length === beforeDirection.length &&
        directionSeverity(afterDirection) < directionSeverity(beforeDirection) - SEVERITY_EPS);
    if (
      detectViolations(executableResult).length === 0 &&
      !executableResult.warnings.some((warning) => warning.severity === 'critical') &&
      verifyConstraintsPreserved(solverSet, preview.proposedInput).ok &&
      improvesDirection
    ) {
      preview.autoBalance = { batchRescaled, solverRounds: 0 };
      preview.hardResidualMetrics = [];
      preview.diagnosticOnly = false;
      // Both generators keep Main, optional Inulin and stabilizer byte-exact
      // (see sorbetDirectionProjection / sorbetNearestDirectionSearch); the
      // Apply door verifies exactly that and re-derives the candidate.
      preview.mainHeldByExactDirection = true;
      preview.directionCandidateSource = generator.source;
      return mainSafePreview(input, preview, options.productBehaviorSnapshots);
    }
  }
  return null;
}

/** The five Direction selector positions, in canonical order. */
const DIRECTION_LEVELS: readonly RecipeDirectionTarget[] = [-2, -1, 0, 1, 2];

/** How many neighbouring selector positions the NEAREST search may probe per
 * missed axis. Each probe is a full solve, so this directly bounds the cost of
 * every Direction-active Preview. */
const DIRECTION_NEAREST_MAX_PROBES = 3;

/**
 * SHARED DIRECTION NEAREST (owner 2026-08-23).
 *
 * The optimizer reaches its answer by a greedy hill-climb whose only currency
 * is `Σ_metrics (beyond_band / halfWidth)` summed over EVERY technical metric.
 * It accepts strictly-improving moves and never backtracks, so when a requested
 * Direction band cannot be entered, "NEAREST" degenerates into wherever the
 * climb happened to stop — the distance to the band the user actually asked for
 * is never represented anywhere in the selection. A move that closes Direction
 * distance but transiently costs a little on an unrelated metric is rejected,
 * and the search stalls short of candidates it can demonstrably reach.
 *
 * Measured on Protein (starter draft, OPTIMAL) before this search existed:
 *   −11 °C Sweetness +2, band [16,17] → POD 14.7201 (distance 1.2799), while
 *     Sweetness +1 reaches 15.5571 — distance 0.4429 from that SAME band.
 *   −13 °C Sweetness −1, band [13,14] → POD 14.9812, i.e. moved UP and AWAY
 *     from a downward target, while Sweetness −2 reaches 13.9272 — INSIDE the
 *     requested band. ACHIEVED was available and was not returned.
 *
 * The fix does not touch any band, any profile physics or the meaning of the
 * selector. It adds the missing final step: probe the sibling selector
 * positions to GENERATE additional legal candidate vectors, then rank every
 * candidate by its distance to the ORIGINALLY REQUESTED band. Aiming at a
 * neighbouring band is only a way of producing a candidate; scoring is always
 * against what the user asked for.
 *
 * Ordering is strictly lexicographic and Direction never outranks safety:
 *   1. executable / hard-safe            (rejected outright below)
 *   2. Main + Multi-Main ratio, locks, batch, no 0 g row (rejected outright)
 *   3. minimum distance to the requested band  ← the newly explicit term
 *   4. the incumbent wins every tie, so existing technical tie-breaks and the
 *      established candidate stand unless something is STRICTLY nearer.
 *
 * Because the incumbent is only ever replaced by a strictly nearer candidate
 * that independently satisfies every hard contract, a profile whose greedy
 * result was already nearest is returned bit-for-bit unchanged.
 */
function improveDirectionNearestVector(
  input: RecipeInput,
  set: ConstraintSet,
  working: RecipeInput,
  createdAt: string,
  options: OptimizePreviewOptions,
): RecipeInput {
  // Probe runs must not recurse into the search.
  if (options.directionNearestPass === true) return working;
  if (!hasActiveExactDirectionObjective(input)) return working;
  const requested = requestedDirectionBands(input);
  if (requested.length === 0) return working;

  const askedTargets = input.goals?.direction_targets ?? DEFAULT_RECIPE_DIRECTION_TARGETS;
  const probeOptions: OptimizePreviewOptions = { ...options, directionNearestPass: true };

  /**
   * Every hard contract a candidate must satisfy before its Direction distance
   * is allowed to matter at all. The INCUMBENT is held to exactly the same bar
   * as the probes: an incumbent that cannot pass these gates is discarded
   * downstream (`beatsBaseline` refuses a natively unsafe proposal), which
   * leaves the user on the unchanged draft — so it must never be able to
   * silently win the ranking. Measured on the Gelato −13 starter at Sweetness 0:
   * the solver candidate sat exactly in [14,15] but was natively UNSAFE, the
   * preview conceded `no_proposal`, and the user was left on the draft at POD
   * 16.3677 (distance 1.3677) while a legal 15.1365 candidate — distance 0.1365
   * — was reachable from the same draft.
   */
  const legal = (candidate: RecipeInput, mainAnchorGrams: number): boolean =>
    detectViolations(calculateRecipe(candidate)).length === 0 &&
    // Verified with the SAME arguments the Apply door uses, constraints
    // included: a candidate this search accepts must be one Apply accepts.
    verifyMainIngredientIdentity(input, candidate, set.byLineId).ok &&
    verifyConstraintsPreserved(set, candidate).ok &&
    positiveStandardPresencePreserved(input, candidate) &&
    Math.abs(mainGroupTotal(input, candidate) - mainAnchorGrams) <= MAIN_OBJECTIVE_EPSILON_G &&
    Math.abs(plannedSum(candidate) - input.target_batch_grams) <= BATCH_SUM_TOLERANCE_G &&
    !candidate.items.some((item) => item.planned_grams <= 0);

  // The incumbent is the EXACT pre-practicalization vector, so it is judged by
  // the gate that actually decides its fate downstream rather than by the
  // post-practicalization contract applied to the probes: `beatsBaseline` is
  // what refuses a natively unsafe proposal and turns the preview into
  // `no_proposal`, leaving the user on the unchanged draft.
  const incumbentSurvives =
    beatsBaseline(input, working) && positiveStandardPresencePreserved(input, working);
  const draftIsLegal = detectViolations(calculateRecipe(input)).length === 0;
  const targetMainGrams = incumbentSurvives
    ? mainGroupTotal(input, working)
    : mainGroupTotal(input, input);

  /**
   * The BAR a probe has to beat is whatever the user actually ends up with if
   * this search changes nothing — and it must be something ATTAINABLE:
   *   - the incumbent, when it can stand downstream; else
   *   - the unchanged draft, but ONLY when that draft is itself hard-safe; else
   *   - nothing at all.
   *
   * That last case is not hypothetical. Measured on the vanilla internet recipe
   * at −12 °C, Sweetness +2: the incumbent could not stand, the draft was itself
   * hard-violating, and the draft's distance (0.5107) was nevertheless used as
   * the bar — so a perfectly legal probe candidate at 0.5468 "lost" to a recipe
   * nobody can have, the doomed incumbent was returned, and the pipeline fell
   * through to a preference-stripped retry that delivered POD 14.3892 while a
   * legal 15.4532 existed. An unattainable state must never out-rank a legal
   * candidate, so the bar becomes +∞ and the first legal probe wins.
   */
  const UNATTAINABLE: DirectionDistanceMeasure = {
    missedAxes: requested.length,
    total: Number.POSITIVE_INFINITY,
    // Carries a real per-axis shape, not an empty one: the loop below prunes
    // axes that already satisfy their band by reading `perAxis`, so an empty
    // sentinel would silently mark every axis satisfied and skip the search
    // entirely — which is exactly how the vanilla −12 +2 case slipped through.
    perAxis: requested.map((entry) => ({
      axis: entry.axis,
      metric: entry.metric,
      value: null,
      band: entry.band,
      distance: Number.POSITIVE_INFINITY,
    })),
  };
  let best = {
    input: incumbentSurvives ? working : input,
    measure: incumbentSurvives
      ? directionDistance(working, requested)
      : draftIsLegal
        ? directionDistance(input, requested)
        : UNATTAINABLE,
  };
  // A surviving incumbent already inside every requested band is ACHIEVED.
  if (incumbentSurvives && best.measure.missedAxes === 0) return working;

  // A two-axis target can require a two-axis GENERATOR detour. Probing one
  // selector coordinate at a time missed that class completely: Piña Colada
  // at Sweetness +2 / Hardness 0 could only expose its nearer legal vector
  // when a sibling Sweetness AND sibling Hardness were used together to
  // generate it. The resulting grams are still scored solely against the
  // ORIGINAL request. Enumerate the bounded Cartesian neighborhood of the
  // currently missed axes; with the two supported axes and three siblings per
  // axis this is at most 4×4−1 = 15 full probes.
  const missedAxes = requested.filter(
    (axis) => (best.measure.perAxis.find((entry) => entry.axis === axis.axis)?.distance ?? 0) > 0,
  );
  const choices = missedAxes.map((axis) => {
    const asked = askedTargets[axis.axis];
    const siblings = [...DIRECTION_LEVELS]
      .filter((level) => level !== asked)
      .sort((left, right) => Math.abs(left - asked) - Math.abs(right - asked) || left - right)
      .slice(0, DIRECTION_NEAREST_MAX_PROBES);
    return { axis: axis.axis, asked, levels: [asked, ...siblings] };
  });
  const probeTargets: RecipeDirectionTarget[][] = [];
  const enumerateTargets = (index: number, selected: RecipeDirectionTarget[]): void => {
    if (index === choices.length) {
      if (selected.some((level, position) => level !== choices[position]!.asked)) {
        probeTargets.push(selected);
      }
      return;
    }
    for (const level of choices[index]!.levels) {
      enumerateTargets(index + 1, [...selected, level]);
    }
  };
  enumerateTargets(0, []);
  probeTargets.sort(
    (left, right) =>
      left.reduce((sum: number, level, index) => sum + Math.abs(level - choices[index]!.asked), 0) -
        right.reduce(
          (sum: number, level, index) => sum + Math.abs(level - choices[index]!.asked),
          0,
        ) || left.join(',').localeCompare(right.join(',')),
  );
  for (const levels of probeTargets) {
    if (best.measure.missedAxes === 0) break;
    const directionTargets = { ...askedTargets };
    choices.forEach((choice, index) => {
      directionTargets[choice.axis] = levels[index]!;
    });
    const probe = buildOptimizePreview(
      {
        ...input,
        goals: { ...input.goals, direction_targets: directionTargets },
      } as RecipeInput,
      set,
      createdAt,
      probeOptions,
    );
    if (!probe.ok) continue;
    // Rebase onto the ORIGINAL request: a sibling selector position is only a
    // candidate generator and can never replace the user's target identity.
    const candidate: RecipeInput = { ...input, items: probe.preview.proposedInput.items };
    if (!legal(candidate, targetMainGrams)) continue;
    const measure = directionDistance(candidate, requested);
    const order = compareDirectionDistance(measure, best.measure);
    if (order !== null && order < 0) best = { input: candidate, measure };
  }
  return best.input;
}

/**
 * RC-2c (owner authority 2026-08-23) — DIRECTION IS A PREFERENCE, NOT A GATE.
 *
 * When a Direction target is unreachable the search can end on a candidate that
 * still crosses a hard band, and the whole Preview was then discarded
 * (`unsafe_proposal`). But Direction is only a preference: if a legal executable
 * recipe exists once the preference is set aside, the truthful answer is that
 * recipe as NEAREST, not "no Preview at all".
 *
 * This retries ONCE, with the preference removed and everything else identical —
 * same constraints, same locks, same Main, same hard bands, same Vegan
 * envelopes. It can only ever return a result the normal pipeline already
 * considers legal, and it never relaxes a hard constraint to reach a target.
 */
/**
 * FINAL TARGET-MASS BOUNDARY. Every executable `ok:true` Preview leaves the
 * pipeline through `buildOptimizePreview`, so this is the one place that can
 * guarantee the global invariant for every profile and every route:
 *
 *   abs(sum(proposed grams) - target_batch_grams) <= BATCH_SUM_TOLERANCE_G
 *
 * Routes are expected to produce batch-true candidates on their own (they are
 * normalised at the producer). This is the backstop: if one ever does not, the
 * honest answer is a truthful non-success, never a successful Preview the Apply
 * door would have to reject. It never repairs mass here — repairing at the exit
 * would bypass the per-route safety checks that made the candidate acceptable.
 */
function enforceTargetBatchInvariant(
  input: RecipeInput,
  result: BuildPreviewResult,
): BuildPreviewResult {
  if (!result.ok) return result;
  const target = input.target_batch_grams;
  if (!(target > 0)) return result;
  if (Math.abs(plannedSum(result.preview.proposedInput) - target) <= BATCH_SUM_TOLERANCE_G) {
    return result;
  }
  return { ok: false, code: 'no_proposal' };
}

export function buildOptimizePreview(
  input: RecipeInput,
  set: ConstraintSet,
  createdAt: string,
  options: OptimizePreviewOptions = {},
): BuildPreviewResult {
  const direct = buildOptimizePreviewWithDirection(input, set, createdAt, options);
  if (
    direct.ok ||
    // An unreachable preference dead-ends in two distinct ways, and BOTH must
    // degrade to a truthful NEAREST rather than leave the user with no recipe:
    // the search can end on an illegal candidate (`unsafe_proposal`) or find no
    // candidate at all (`no_proposal`). `already_clean` is a real answer and is
    // deliberately not retried.
    (direct.code !== 'unsafe_proposal' && direct.code !== 'no_proposal') ||
    input.goals?.direction_targets_active !== true ||
    // The Rescue advisor's internal simulations only need the DIRECT answer:
    // they measure whether adding one ingredient helps, and a NEAREST fallback
    // would double the pipeline for every simulated candidate without changing
    // the decision. The user-facing call still gets the fallback.
    (options.rescueSimulationLineIds?.length ?? 0) > 0
  ) {
    return enforceTargetBatchInvariant(input, direct);
  }
  // NOTE: this retry is deliberately NOT scoped to drafts that already violate.
  // The 1800-state Vegan Direction matrix found two natively SAFE drafts that
  // still dead-ended — R12 caramel -11 (sweetness -1, softness 0) returning
  // `unsafe_proposal`, and R13 salted caramel -11 (sweetness -1, softness -2)
  // returning `no_proposal` — both with zero starting violations. The retry
  // still only runs when the direct attempt already failed, so healthy previews
  // are unaffected.
  const withoutPreference: RecipeInput = {
    ...input,
    goals: { ...input.goals, direction_targets_active: false },
  };
  const nearest = buildOptimizePreviewWithDirection(withoutPreference, set, createdAt, options);
  if (!nearest.ok) return enforceTargetBatchInvariant(input, direct);
  nearest.preview.directionTargetUnreached = true;
  // REBASE onto the working state the user is actually on. This Preview was
  // built against `withoutPreference`, which differs from `input` only in the
  // Direction goal fields — but `workingStateFingerprint` hashes `goals`, so the
  // Preview carried a base fingerprint for a state that does not exist on the
  // user's screen and the Apply door refused it as `stale_preview`. Every other
  // part of the Preview is derived from the ITEM vectors, which are identical in
  // both inputs, so restoring the original goals and re-deriving the fingerprint
  // is exact rather than cosmetic. Measured on the vanilla internet recipe at
  // −12 °C, Sweetness +2 before the fix: a clean, non-diagnostic Preview that
  // could never be applied.
  nearest.preview.baseFingerprint = workingStateFingerprint(input, set);
  const rebaseGoals = (candidate: RecipeInput): RecipeInput => ({
    ...candidate,
    goals: input.goals,
  });
  nearest.preview.proposedInput = rebaseGoals(nearest.preview.proposedInput);
  if (nearest.preview.practicalization?.status === 'ready') {
    const audit = nearest.preview.practicalization.audit;
    const exactInput = rebaseGoals(audit.exactInput);
    const executableInput = rebaseGoals(audit.executableInput);
    nearest.preview.practicalization = {
      status: 'ready',
      audit: {
        ...audit,
        exactInput,
        exactResult: calculateRecipe(exactInput),
        executableInput,
        executableResult: calculateRecipe(executableInput),
      },
    };
  }
  attachMainObjective(nearest.preview, input, nearest.preview.mainObjective ?? null);
  nearest.preview.directionAssessment = assessRecipeDirection(
    nearest.preview.proposedInput,
    calculateRecipe(nearest.preview.proposedInput),
  );
  return enforceTargetBatchInvariant(input, nearest);
}

function buildOptimizePreviewWithDirection(
  input: RecipeInput,
  set: ConstraintSet,
  createdAt: string,
  options: OptimizePreviewOptions = {},
): BuildPreviewResult {
  if (input.category === 'vegan_gelato') {
    const issues = veganRecipeEligibilityIssues(input.items);
    if (issues.length > 0) {
      const substitutions = veganSubstitutionRecommendations(input.items, issues);
      return {
        ok: false,
        code: 'vegan_ingredient_conflict',
        issues,
        substitutions,
        messagePl:
          'Receptura Wegańska zawiera składniki wymagające usunięcia lub zatwierdzonego zamiennika: ' +
          issues.map((issue) => `${issue.ingredientName} [${issue.status}]`).join(', ') +
          '. Składniki Główne pozostają bez zmian.' +
          veganSubstitutionMessagePl(substitutions),
      };
    }
  }
  if ((options.unavailableMainIngredientIds?.length ?? 0) > 0) {
    const ingredientIds = [...new Set(options.unavailableMainIngredientIds)];
    return {
      ok: false,
      code: 'main_ingredient_unavailable',
      ingredientIds,
      messagePl:
        `Składnik Główny (${ingredientIds.join(', ')}) jest oznaczony jako niedostępny. ` +
        'PI nie usunie go po cichu: wybierz zatwierdzony zamiennik albo przywróć składnik.',
    };
  }
  // OWNER P0 (full formulation) — deterministic MODE ROUTER first: a new/
  // incomplete/arbitrary draft is FORMULATED from the approved template
  // registry (never from the previous version, never by scaling arbitrary
  // values); a complete near-batch draft keeps the existing local-correction
  // path; an unsupported profile × temperature returns an honest structured
  // state. The formulation path interprets ranges as TARGET constraints (a
  // 0 g draft against a 150–250 g range is a solvable request, not an error);
  // the correction path keeps the strict §17 current-grams validation.
  const mainIntent = captureMainIngredientIntent(input);
  const mainTotal = mainIntent.reduce((sum, line) => sum + line.grams, 0);
  const allMainExact =
    mainIntent.length > 0 &&
    mainIntent.every((line) => {
      const constraint = set.byLineId[line.lineId];
      return constraint?.mode === 'locked' || constraint?.mode === 'percent';
    });
  // Protein formulation has a separate, bounded target authority. Preserve
  // its accepted hard conflict when the identity seed alone is larger than
  // the batch; the generic Main frontier must not silently rewrite that
  // profile before the Protein solver can establish a valid starting vector.
  const proteinMainExceedsBatch =
    input.category === 'protein_gelato' &&
    mainIntent.length > 0 &&
    mainTotal > input.target_batch_grams + BATCH_SUM_TOLERANCE_G;
  if (
    (allMainExact && mainTotal > input.target_batch_grams + BATCH_SUM_TOLERANCE_G) ||
    proteinMainExceedsBatch
  ) {
    return {
      ok: false,
      code: 'main_ratio_conflict',
      lineIds: mainIntent.map((line) => line.lineId),
      ingredientNames: mainIntent.map((line) => line.ingredientName),
      messagePl:
        `Składniki Główne ważą ${mainTotal.toFixed(1)} g, więcej niż docelowa partia ` +
        `${input.target_batch_grams.toFixed(1)} g. PI nie zmniejszyło tożsamości receptury po cichu.`,
    };
  }
  // The exact current gram vector is the null hypothesis when the user has not
  // selected a Main ingredient or asked for another explicit target. This gate
  // deliberately runs BEFORE the profile mode router: a complete Vegan,
  // Sorbet or Protein recipe must not be replaced by a generic template merely
  // because that profile owns a full-formulation path. Every product-level hard
  // authority is checked on the unchanged vector first; any unresolved goal,
  // constraint, exclusion, practicalization or Rescue request keeps the normal
  // pipeline in control.
  const preRouteStrategy = normalizeFormulationStrategy(
    input.goals?.formulation_strategy ?? input.mode,
  );
  const currentResult = calculateRecipe(input);
  const currentProtein = assessProteinFormulation(input, currentResult);
  const excludedCanonicalIds = new Set(
    (options.excludedIngredientIds ?? []).map(canonicalIngredientIdFromSourceId),
  );
  const hasPendingManualTarget = input.items.some(
    (item) =>
      item.user_target_grams !== undefined &&
      Number.isFinite(item.user_target_grams) &&
      Math.abs(item.user_target_grams - item.planned_grams) > BATCH_SUM_TOLERANCE_G,
  );
  const hasPresentExcludedIngredient = input.items.some(
    (item) =>
      item.planned_grams > 0 && excludedCanonicalIds.has(canonicalIngredientId(item.ingredient)),
  );
  const buildIdentityPracticalPreview = (): BuildPreviewResult => {
    // The served Pro workbench requires a Preview provenance token before
    // Save/Production. That requirement is not permission to replace an
    // already-valid recipe with a profile template: issue an identity
    // practicalization Preview so Apply can attest the exact x_user vector
    // byte-for-byte. The Apply door re-derives the same identity candidate.
    const preview = finishPreview(
      'optimize',
      copy.preview.kindLabels.optimize,
      input,
      set,
      input,
      set,
      violationCount(currentResult),
      [],
      createdAt,
    );
    preview.practicalizationOnly = true;
    preview.autoBalance = { batchRescaled: false, solverRounds: 0 };
    preview.hardResidualMetrics = [];
    preview.diagnosticOnly = false;
    return mainSafePreview(input, preview, options.productBehaviorSnapshots);
  };
  const exactNoCrownNullHypothesis =
    preRouteStrategy !== 'eco' &&
    mainIntent.length === 0 &&
    (options.rescueSimulationLineIds?.length ?? 0) === 0 &&
    !hasPendingManualTarget &&
    !hasPresentExcludedIngredient &&
    !input.items.some((item) => item.actual_grams !== null) &&
    input.items.every((item) => Number.isInteger(item.planned_grams) && item.planned_grams > 0) &&
    Math.abs(plannedSum(input) - input.target_batch_grams) <= BATCH_SUM_TOLERANCE_G &&
    verifyConstraintsPreserved(set, input).ok &&
    detectViolations(currentResult).length === 0 &&
    !currentResult.warnings.some((warning) => warning.severity === 'critical') &&
    !hasActiveExactDirectionObjective(input) &&
    recipeDirectionViolations(input).length === 0 &&
    ownerInulinPolicyIssues(input).length === 0 &&
    internalStabilizerProfileIssues(input).length === 0 &&
    (input.category !== 'vegan_gelato' || veganProfileConstraintIssues(input).length === 0) &&
    (!currentProtein.applicable || currentProtein.qualification.qualified);
  if (exactNoCrownNullHypothesis) {
    if (options.requirePracticalPreview === true) {
      return buildIdentityPracticalPreview();
    }
    return { ok: false, code: 'already_clean' };
  }
  // Owner 2026-08-22 (Main-constrained NEAREST): a COMPLETE on-batch Sorbet
  // draft with an active exact Direction objective is solved on the SHARED
  // boundary BEFORE the mode router. The served Mapper scaffold routes through
  // the template path (its WATER/SUCROSE rows resolve to other functional
  // roles), which never reached the closed-form projection; a held Main then
  // turned "nearest" into a premature no-correction. Exact projection first,
  // Main-constrained NEAREST second, regular optimizer third.
  if (
    input.category === 'sorbet' &&
    hasActiveExactDirectionObjective(input) &&
    !input.items.some((item) => item.actual_grams !== null) &&
    Math.abs(plannedSum(input) - input.target_batch_grams) <= BATCH_SUM_TOLERANCE_G
  ) {
    const preConstrained = applyConstraintsToRecipe(input, set);
    if (preConstrained.ok) {
      const sorbetDirectionPreview = buildSorbetDirectionCandidatePreview({
        input,
        working: preConstrained.input,
        set,
        solverSet: solverHolds(input, set),
        createdAt,
        options,
        violationsBefore: violationCount(calculateRecipe(preConstrained.input)),
        batchRescaled: false,
      });
      if (sorbetDirectionPreview !== null) return sorbetDirectionPreview;
    }
  }
  const routedDecision = routeFormulationMode(input, set);
  // The ECO null hypothesis fires whenever the router would hand this draft to
  // a TEMPLATE. It used to test `missing_hard_role` specifically — which, while
  // canonical Sucrose and Water mis-resolved, was simply what every complete
  // draft reported. With the roles correct a complete draft reaches the same
  // template route under `profile_owns_formulation_path` instead, so the test
  // is now the route itself. (`composition_requires_formulation` is the other
  // `full_formulation` reason; a hollow draft is off-batch, so the batch
  // equality below excludes it exactly as before.)
  const preRouteResult =
    preRouteStrategy === 'eco' && routedDecision.mode === 'full_formulation'
      ? calculateRecipe(input)
      : null;
  const ecoCurrentDraftOwnsSearch =
    preRouteResult !== null &&
    violationCount(preRouteResult) === 0 &&
    internalStabilizerProfileIssues(input).length === 0 &&
    ownerInulinPolicyIssues(input).length === 0 &&
    !preRouteResult.warnings.some((warning) => warning.severity === 'critical') &&
    Math.abs(plannedSum(input) - input.target_batch_grams) <= BATCH_SUM_TOLERANCE_G &&
    input.items.every(
      (item) =>
        effectiveCostForIngredient(item.ingredient, options.effectivePriceOverrides ?? {})
          .pricePerKg !== null,
    );
  const oversizedAdjustableMain =
    mainIntent.length > 0 &&
    !allMainExact &&
    mainTotal >= input.target_batch_grams - BATCH_SUM_TOLERANCE_G;
  // A complete, technically clean and fully priced ECO draft is its own safe
  // null hypothesis. Let the verified cost sweep inspect that exact recipe
  // before a generic missing-role template can replace it. Incomplete,
  // unpriced or technically unsafe drafts retain the existing formulation
  // route and all stabilizer/template guarantees.
  const decision: typeof routedDecision =
    ecoCurrentDraftOwnsSearch || oversizedAdjustableMain
      ? {
          mode: 'local_correction',
          template: null,
          reasons: [
            ecoCurrentDraftOwnsSearch
              ? 'eco_current_draft_null_hypothesis'
              : 'adjustable_main_above_batch_requires_frontier',
          ],
        }
      : routedDecision;

  // A/B promotion (2026-08-25): for a complete on-batch recipe WITHOUT Main,
  // retain several nearby paths and rank them by the product hierarchy before
  // the historical single-path solver/template commits to one direction. The
  // 136-recipe offline comparison showed materially lower x_user drift at the
  // same hard validity; pure beam search did not match the certified Crown
  // maximum, so every Main/Multi-Main draft deliberately stays on the existing
  // frontier. The same bounded search is also authoritative when an exact
  // Direction target is active: its comparator already ranks hard safety,
  // requested-target fit and only then whole-vector distance from x_user. This
  // closes the historical path where the first target-reaching greedy vector
  // could turn a 2 g flavour line into a 49+ g composition lever even though a
  // 28 g-total-movement, target-reaching vector existed. A failed/refused
  // neighborhood search is only evidence: the established pipeline still runs
  // and keeps every honest fallback.
  const behaviorModule = preRouteStrategy === 'eco' ? 'ECO' : 'OPTIMAL';
  const behaviorRequiredLineIds = productBehaviorRequiredLineIds({ items: input.items });
  const managedBehavior = Object.keys(options.productBehaviorSnapshots ?? {}).length > 0;
  const behaviorReady =
    !managedBehavior ||
    productBehaviorModuleGate(
      options.productBehaviorSnapshots ?? {},
      behaviorModule,
      behaviorRequiredLineIds,
    ).ready;
  const neighborhoodBands = classifyViolationBands(input);
  const neighborhoodEligible =
    decision.mode !== 'unsupported' &&
    neighborhoodBands.bandSource === 'native' &&
    !neighborhoodBands.temperatureFallback &&
    input.goals?.formulation_strategy !== undefined &&
    mainIntent.length === 0 &&
    behaviorReady &&
    !hasPendingManualTarget &&
    !hasPresentExcludedIngredient &&
    (options.rescueSimulationLineIds?.length ?? 0) === 0 &&
    !input.items.some((item) => item.actual_grams !== null) &&
    input.items.every((item) => Number.isInteger(item.planned_grams) && item.planned_grams > 0) &&
    Math.abs(plannedSum(input) - input.target_batch_grams) <= BATCH_SUM_TOLERANCE_G;
  if (neighborhoodEligible) {
    // The promoted search is an alternative candidate generator, not an
    // authority bypass. It must see the same internal Tara/Inulin/user-Main
    // holds as the established solver; otherwise it can stage a Preview the
    // trustless Apply door must reject (served Sorbet regression: Tara 1→2).
    const neighborhoodSolverSet = solverHolds(input, set);
    const neighborhood = experimentalNeighborhoodSearch(input, neighborhoodSolverSet, {
      beamWidth: 3,
      evaluationBudget: 2_500,
      excludedIngredientIds: options.excludedIngredientIds,
      effectivePriceOverrides: options.effectivePriceOverrides,
      externalHardGate: (candidate) =>
        verifyConstraintsPreserved(neighborhoodSolverSet, candidate).ok &&
        positiveStandardPresencePreserved(input, candidate) &&
        requiredLineContractViolations(input, candidate).length === 0 &&
        (preRouteStrategy !== 'eco' ||
          verifyEcoFlavourProtection(input, candidate, {
            productBehaviorSnapshots: options.productBehaviorSnapshots,
          }).ok),
    });
    if (neighborhood.status === 'no_change') {
      // An active Direction request that is already satisfied keeps its
      // established route. That route owns accepted preview/authority semantics
      // for neutral and overlapping bands; the neighborhood is promoted only
      // when it has actually found a better vector.
      if (!hasActiveExactDirectionObjective(input)) {
        if (options.requirePracticalPreview === true) return buildIdentityPracticalPreview();
        return { ok: false, code: 'already_clean' };
      }
    }
    if (neighborhood.status === 'candidate') {
      const lockedNames = lockedIngredientNames(input, set);
      const explanation: ConstraintExplanationEntry[] =
        lockedNames.length > 0 ? [{ kind: 'locked_unchanged', ingredientNames: lockedNames }] : [];
      let preview = finishPreview(
        'optimize',
        copy.preview.kindLabels.optimize,
        input,
        set,
        neighborhood.input,
        set,
        violationCount(currentResult),
        explanation,
        createdAt,
      );
      preview = polishPracticalDirectionPreview(input, set, preview, createdAt, options);
      preview.autoBalance = { batchRescaled: false, solverRounds: 0 };
      preview.hardResidualMetrics = [];
      preview.diagnosticOnly = false;
      // Whole-gram practicalization can move an exact in-memory candidate just
      // outside a narrow Direction band. Preserve the same explicit-consent
      // contract as every other NEAREST route so the served UI can never offer
      // an Apply that the trustless commit door will reject for missing consent.
      if (
        hasActiveExactDirectionObjective(input) &&
        recipeDirectionViolations(preview.proposedInput).length > 0
      ) {
        preview.directionTargetUnreached = true;
      }
      return mainSafePreview(input, preview, options.productBehaviorSnapshots);
    }
  }
  if (decision.mode === 'unsupported') {
    return { ok: false, code: 'unsupported_profile', reason: decision.reasons[0] ?? 'no_template' };
  }
  if (decision.mode !== 'local_correction' && decision.template) {
    return buildFormulationPreviewInternal(
      input,
      set,
      decision.template,
      decision.mode,
      createdAt,
      options,
    );
  }

  // ── from here down the LOCAL corrector owns the draft ──────────────────────
  // Owner rule, already enforced on the formulation path (`ownerInulinAbsent`):
  // PI never silently ADDS canonical Inulin to a recipe that does not carry it
  // — the user selects it explicitly, and PI recommends it instead. The local
  // corrector reaches the same approved toolbox, so it inherits the same
  // exclusion. „Absent" means the LINE is not in the draft at all: a selected
  // Inulin line sitting at 0 g is „chosen but unfilled" under the owner
  // zero-gram rule and must still be fillable, and a draft that already has
  // Inulin stays governed by the owner dose policy.
  // The template path keeps the ORIGINAL options: an approved template that
  // carries a `fiber_body` role is entitled to place Inulin, and it runs its
  // own `ownerInulinAbsent` guard against the seeded proposal.
  const templateOptions = options;
  const ownerInulinAbsentInDraft = !input.items.some(
    (item) => canonicalIngredientId(item.ingredient) === OWNER_INULIN_POLICY.mapperIngredientId,
  );
  if (ownerInulinAbsentInDraft) {
    options = {
      ...options,
      excludedIngredientIds: [
        ...new Set([
          ...(options.excludedIngredientIds ?? []),
          'inulin',
          OWNER_INULIN_POLICY.mapperIngredientId,
        ]),
      ],
    };
  }

  /**
   * Owner Phase 6 (NIGHTLY, live FAILURE A): when the LOCAL corrector cannot
   * improve a COMPLETE UNCONSTRAINED draft, PI no longer stops at the one-line
   * failure. It seeds the approved/reference template for the SAME profile ×
   * temperature with the SAME selected ingredient identities, locks,
   * exclusions, batch and temperature and attempts a full reformulation
   * (user-selected forms/brands are never replaced). If that cannot safely
   * improve either, the outcome is classified by BAND PROVENANCE (Phase 8):
   * remaining violations that sit ONLY on provisional/fallback bands yield the
   * explanatory BEST-SAFE result — fallback bands never hard-reject alone.
   * Any native-band violation keeps the honest local failure unchanged (the
   * beat-the-null gate on native-band profiles stays absolute).
   */
  const withTemplateFallback = (
    failure: Extract<BuildPreviewResult, { ok: false; code: 'no_proposal' | 'unsafe_proposal' }>,
  ): BuildPreviewResult => {
    if (!decision.reasons.includes('substantive_unconstrained_draft')) return failure;
    const lookup = selectFormulationTemplateForRecipe(input);
    if (!lookup.template) return failure;
    const seeded = buildFormulationPreviewInternal(
      input,
      set,
      lookup.template,
      'full_formulation',
      createdAt,
      templateOptions,
      true,
    );
    if (seeded.ok) return seeded;
    const bands = classifyViolationBands(input);
    if (bands.hardMetrics.length === 0 && bands.softMetrics.length > 0) {
      return {
        ok: false,
        code: 'best_safe_result',
        solverInvocations: failure.solverInvocations ?? 0,
        softViolatedMetrics: bands.softMetrics,
        bandSource:
          bands.bandSource === 'category_fallback' ? 'category_fallback' : 'temperature_fallback',
        templateId: lookup.template.templateId,
        templateStatus: lookup.template.status,
        stopReason:
          seeded.code === 'unsafe_proposal' ? 'template_fixed_point' : 'local_no_proposal',
        // Owner Phase 4: the stop must carry its REAL evidence, never template
        // resemblance. Built from the iteration the optimizer really ran.
        evidence: buildBestSafeEvidence(input, set, failure.iteration, bands, options),
        iteration: failure.iteration,
      };
    }
    return failure;
  };

  /**
   * Owner CURRENT-DRAFT P0 (PRIMARY root cause) — THE BATCH-RECONCILIATION
   * DOOR. Before ANY „no further improvement" outcome becomes final, an
   * off-batch draft must still be brought to its target batch. The owner's
   * verified failure was exactly this: Inulin 10 g → 955 g against a 1000 g
   * target → no Preview at all, while PI claimed the recipe „is already the
   * best verified result" — a false statement about a recipe that does not
   * even weigh what was asked for.
   *
   * `isBatchReconciliation` carries the discrimination (near-batch,
   * differentiated, not-worse) so the hollow 8 × 125 g class stays rejected;
   * the preview is labelled `batchReconciliationOnly` so the surface tells the
   * truth: the batch was reconciled and NO further technical improvement was
   * verified.
   */
  const withBatchReconciliation = (
    failure: BuildPreviewResult,
    candidate: RecipeInput,
    iteration: IterationDiagnostics | undefined,
    violationsBefore: number,
  ): BuildPreviewResult => {
    if (failure.ok) return failure;
    if (iteration?.capped === true) return failure;
    if (!isBatchReconciliation(input, candidate)) return failure;
    // Engine-safe only: a hard-native residual would make it diagnostic-only,
    // which cannot help the user reach the target batch — stay honest instead.
    const bands = classifyViolationBands(candidate);
    if (bands.hardMetrics.length > 0) return failure;

    const lockedNames = lockedIngredientNames(input, set);
    const preview = finishPreview(
      'optimize',
      copy.preview.kindLabels.optimize,
      input,
      set,
      candidate,
      set,
      violationsBefore,
      lockedNames.length > 0 ? [{ kind: 'locked_unchanged', ingredientNames: lockedNames }] : [],
      createdAt,
    );
    preview.autoBalance = { batchRescaled: true, solverRounds: iteration?.solverInvocations ?? 0 };
    preview.iteration = iteration;
    preview.batchReconciliationOnly = true;
    preview.batchBeforeGrams = plannedSum(input);
    preview.hardResidualMetrics = bands.hardMetrics;
    preview.diagnosticOnly = false;
    return mainSafePreview(input, preview, options.productBehaviorSnapshots);
  };

  const solverSet = solverHolds(input, set);
  // Apply only the user's visible constraints to the candidate state. The
  // stabilizer hold is internal orchestration state and must never surface as
  // a native/item lock or a visible §17 padlock.
  const constrained = applyConstraintsToRecipe(input, set);
  if (!constrained.ok) {
    return { ok: false, code: 'invalid_constraints', issues: constrained.issues };
  }

  const hasActuals = input.items.some((item) => item.actual_grams !== null);
  const offBatch = (candidate: RecipeInput): boolean =>
    !hasActuals &&
    Math.abs(plannedSum(candidate) - input.target_batch_grams) > BATCH_SUM_TOLERANCE_G;
  const restoreBatch = (candidate: RecipeInput, preserveCandidateMain = true): RecipeInput => {
    const constraintDrift = !hasActuals && !verifyConstraintsPreserved(solverSet, candidate).ok;
    if (!offBatch(candidate) && !constraintDrift) return candidate;
    const restored = rescalePreservingMainGroup(
      input,
      candidate,
      solverSet,
      input.target_batch_grams,
      preserveCandidateMain,
      preserveCandidateMain,
    );
    return restored.ok ? restored.input : candidate;
  };

  // 1. Batch equality is part of the DEFAULT objective — reconcile it first.
  // Current unlocked Main grams are user input, not a lock or a lower bound.
  // The initial batch projection must enter the feasible region before the
  // certified frontier chooses the final Main amount. Solver-produced Main
  // candidates are still held exactly during their own normalization.
  let working = restoreBatch(constrained.input, false);
  const batchRescaled = working !== constrained.input;

  const beforeResult = calculateRecipe(constrained.input);
  const violationsBefore = violationCount(beforeResult);
  const hasCritical = beforeResult.warnings.some((warning) => warning.severity === 'critical');
  // Sorbet exact Direction: the SHARED candidate boundary (exact projection,
  // then the Main-constrained NEAREST search) — see
  // buildSorbetDirectionCandidatePreview. A non-feasible candidate simply
  // falls through to the established optimizer.
  const sorbetDirectionPreview = buildSorbetDirectionCandidatePreview({
    input,
    working,
    set,
    solverSet,
    createdAt,
    options,
    violationsBefore,
    batchRescaled,
  });
  if (sorbetDirectionPreview !== null) return sorbetDirectionPreview;
  const initialProteinTarget = assessProteinFormulation(working);
  const strategy = normalizeFormulationStrategy(input.goals?.formulation_strategy ?? input.mode);
  if (strategy === 'eco') {
    const missingPrices = input.items.filter(
      (item) =>
        effectiveCostForIngredient(item.ingredient, options.effectivePriceOverrides ?? {})
          .pricePerKg === null,
    );
    if (missingPrices.length > 0) {
      return {
        ok: false,
        code: 'missing_prices',
        lineIds: missingPrices.map((item) => item.id),
        ingredientNames: missingPrices.map((item) => item.ingredient.name),
      };
    }

    /**
     * A technically clean current recipe is already the null hypothesis for
     * ECO. Running the technical corrector first can move it out of band before
     * the cost sweep gets a chance to rank safe gram changes. Search the current
     * draft directly instead: every accepted move must keep the exact technical
     * fit, constraints, batch and Main identity/ratio contract. If no cheaper
     * candidate survives the normal Preview practicalization, the honest result
     * is NO_CHANGE_NEEDED, never an unsafe technical proposal.
     */
    const currentDraftUnchanged =
      workingStateFingerprint(working, set) === workingStateFingerprint(input, set);
    const currentNativeSafe =
      violationsBefore === 0 && ownerInulinPolicyIssues(working).length === 0;
    const exactDirectionActive = hasActiveExactDirectionObjective(input);
    const currentDirectionSafe =
      !exactDirectionActive || recipeDirectionViolations(working).length === 0;
    const currentProteinSafe =
      !initialProteinTarget.applicable || initialProteinTarget.qualification.qualified;
    const currentVeganSafe =
      input.category !== 'vegan_gelato' || veganProfileConstraintIssues(input).length === 0;
    if (
      currentDraftUnchanged &&
      currentNativeSafe &&
      currentDirectionSafe &&
      !hasCritical &&
      !batchRescaled &&
      currentProteinSafe &&
      currentVeganSafe
    ) {
      // Preserve the accepted lexicographic contract: an approved Main increase
      // outranks cost pressure in ECO just as it does in OPTIMAL. Cost search is
      // entered only when there is no admissible higher Main point.
      const ecoMainObjective = currentDirectionSafe
        ? maximizeMainFlavourObjective(input, working, set, options)
        : { input: working, proof: null };
      if (
        ecoMainObjective.proof?.status === 'maximized' &&
        Math.abs(
          ecoMainObjective.proof.exactAcceptedMainGrams - ecoMainObjective.proof.startingMainGrams,
        ) > MAIN_OBJECTIVE_EPSILON_G
      ) {
        const preview = finishPreview(
          'optimize',
          copy.preview.kindLabels.optimize,
          input,
          set,
          ecoMainObjective.input,
          set,
          violationsBefore,
          [],
          createdAt,
        );
        attachMainObjective(preview, input, ecoMainObjective.proof);
        preview.hardResidualMetrics = classifyViolationBands(preview.proposedInput).hardMetrics;
        preview.diagnosticOnly = false;
        return mainSafePreview(input, preview, options.productBehaviorSnapshots);
      }

      const priceOverrides = options.effectivePriceOverrides ?? {};
      const baselineCost = effectiveInputCostPerKg(
        applyEffectiveCustomerPrices(input, priceOverrides),
      );
      const swept = sweepEcoDraftCost({
        identityInput: input,
        start: working,
        set: solverSet,
        excludedIngredientIds: new Set(options.excludedIngredientIds ?? []),
        constraints: {
          context: recipeContext(working),
          mode: working.mode,
          allow_main_ingredient_reduction: false,
          machine_capacity_grams: null,
          target_batch_grams: working.target_batch_grams,
        },
        normalize: restoreBatch,
        priceOverrides,
        productBehaviorSnapshots: options.productBehaviorSnapshots,
      });
      if (swept === null) return { ok: false, code: 'already_clean' };

      const lockedNames = lockedIngredientNames(input, set);
      const preview = finishPreview(
        'optimize',
        copy.preview.kindLabels.optimize,
        input,
        set,
        swept.input,
        set,
        violationsBefore,
        lockedNames.length > 0 ? [{ kind: 'locked_unchanged', ingredientNames: lockedNames }] : [],
        createdAt,
      );
      const proposedResult = calculateRecipe(preview.proposedInput);
      const baselineDirectionViolations = recipeDirectionViolations(input);
      const proposedDirectionViolations = recipeDirectionViolations(preview.proposedInput);
      const baselineDirectionSeverity = baselineDirectionViolations.reduce(
        (sum, violation) => sum + violation.severity_points,
        0,
      );
      const proposedDirectionSeverity = proposedDirectionViolations.reduce(
        (sum, violation) => sum + violation.severity_points,
        0,
      );
      const proposedCost = effectiveInputCostPerKg(
        applyEffectiveCustomerPrices(preview.proposedInput, priceOverrides),
      );
      const proposedProtein = assessProteinFormulation(preview.proposedInput, proposedResult);
      const proposedVeganSafe =
        input.category !== 'vegan_gelato' ||
        veganProfileConstraintIssues(preview.proposedInput).length === 0;
      const proposedSafe =
        violationCount(proposedResult) === violationsBefore &&
        Math.abs(totalSeverity(preview.proposedInput) - totalSeverity(input)) <= SEVERITY_EPS &&
        proposedDirectionViolations.length <= baselineDirectionViolations.length &&
        proposedDirectionSeverity <= baselineDirectionSeverity + SEVERITY_EPS &&
        !proposedResult.warnings.some((warning) => warning.severity === 'critical') &&
        verifyConstraintsPreserved(solverSet, preview.proposedInput).ok &&
        (!proposedProtein.applicable || proposedProtein.qualification.qualified) &&
        proposedVeganSafe &&
        baselineCost !== null &&
        proposedCost !== null &&
        proposedCost < baselineCost - SEVERITY_EPS;
      if (!proposedSafe) return { ok: false, code: 'already_clean' };

      // The verified cost sweep never moves the Main group (identity/ratio
      // contract), so the Main frontier proof established above still
      // describes this proposal. Carry it: the Apply door requires a
      // re-verifiable Main proof on every 'optimize' preview with adjustable
      // Mains, and a proof-less swept preview would be refused at Apply even
      // though the Mains are untouched (e.g. an exact-policy Sorbet Multi-Main
      // at its 60 % ceiling in a fully priced ECO draft).
      attachMainObjective(preview, input, ecoMainObjective.proof);
      preview.autoBalance = { batchRescaled: false, solverRounds: 0 };
      preview.hardResidualMetrics = [];
      preview.diagnosticOnly = false;
      return mainSafePreview(input, preview, options.productBehaviorSnapshots);
    }
  }
  if (
    strategy !== 'eco' &&
    recipeDirectionViolations(working).length === 0 &&
    ownerInulinPolicyIssues(working).length === 0 &&
    !hasCritical &&
    !batchRescaled &&
    (!initialProteinTarget.applicable || initialProteinTarget.qualification.qualified)
  ) {
    if (input.category === 'vegan_gelato') {
      const profileIssues = veganProfileConstraintIssues(input);
      if (profileIssues.length > 0) {
        return {
          ok: false,
          code: 'vegan_profile_constraint',
          issues: profileIssues,
          messagePl: veganProfileConstraintMessagePl(profileIssues),
          diagnosticInput: input,
        };
      }
    }
    const cleanMainObjective = maximizeMainFlavourObjective(input, working, set, options);
    if (
      cleanMainObjective.proof?.status === 'maximized' &&
      Math.abs(
        cleanMainObjective.proof.exactAcceptedMainGrams -
          cleanMainObjective.proof.startingMainGrams,
      ) > MAIN_OBJECTIVE_EPSILON_G
    ) {
      const preview = finishPreview(
        'optimize',
        copy.preview.kindLabels.optimize,
        input,
        set,
        cleanMainObjective.input,
        set,
        violationsBefore,
        [],
        createdAt,
      );
      attachMainObjective(preview, input, cleanMainObjective.proof);
      preview.hardResidualMetrics = classifyViolationBands(cleanMainObjective.input).hardMetrics;
      preview.diagnosticOnly = false;
      return mainSafePreview(input, preview, options.productBehaviorSnapshots);
    }
    const practical = practicalizeRecipeCandidate(input, set, flavourHeldLineIds(input));
    if (!practical.ok) {
      return {
        ok: false,
        code: 'practicalization_blocked',
        lineIds: practical.lineIds,
        messagePl: practical.messagePl,
      };
    }
    const needsPracticalPreview =
      workingStateFingerprint(practical.audit.executableInput, set) !==
      workingStateFingerprint(input, set);
    if (needsPracticalPreview) {
      // Whole-gram preparation changed the executable recipe, therefore the
      // user must see and accept the exact diff through the normal Preview.
      const preview = finishPreview(
        'optimize',
        'Przygotuj recepturę do wykonania',
        input,
        set,
        practical.audit.executableInput,
        set,
        violationsBefore,
        [],
        createdAt,
      );
      preview.practicalizationOnly = true;
      attachMainObjective(preview, input, cleanMainObjective.proof);
      return mainSafePreview(input, preview, options.productBehaviorSnapshots);
    }
    return { ok: false, code: 'already_clean' };
  }

  // 2. ITERATE the canonical solver on the batch-true recipe to a VERIFIED
  //    fixed point (owner P0 NIGHTLY FAILURE 2): rounds continue WHILE a
  //    verified improvement exists, up to the deterministic MAX_SOLVER_ROUNDS
  //    guard — the stop reason and the per-round trajectory are reported.
  const constrainedIngredientIds = new Set(
    input.items
      .filter((item) => isConstrained(solverSet, item.id))
      .map((item) => canonicalIngredientId(item.ingredient)),
  );
  // Agent R handoff (never-reintroduce): the LOCAL route's solver rounds honor
  // the canonical draft's explicit exclusions — engine ids AND Mapper ids.
  const iterated = iterateSolverToFixedPoint(
    input,
    working,
    constrainedIngredientIds,
    restoreBatch,
    new Set(options.excludedIngredientIds ?? []),
    solverSet,
    options.effectivePriceOverrides,
    null,
    options.productBehaviorSnapshots,
  );
  const manualTarget = projectManualIngredientTarget(input, set, options, iterated.working);
  const manualTargetInput = manualTarget.proof ? manualTarget.input : iterated.working;
  const mainObjective = maximizeMainFlavourObjective(input, manualTargetInput, set, options);
  working = mainObjective.input;
  const hardSafeDirection = bestHardSafeDirectionSegment(
    constrained.input,
    working,
    set,
    new Set(options.excludedIngredientIds ?? []),
  );
  if (hardSafeDirection) working = hardSafeDirection;
  const lastProposal = iterated.lastProposal;
  const solverRounds = iterated.diagnostics.solverInvocations;
  let violated: string[] = iterated.violated;

  const changed =
    JSON.stringify(working.items.map((i) => [i.id, i.planned_grams])) !==
    JSON.stringify(input.items.map((i) => [i.id, i.planned_grams]));
  if (!changed) {
    const constrainedMain = mainIntent.filter((line) => {
      const constraint = set.byLineId[line.lineId];
      return constraint !== undefined && constraint.mode !== 'ai';
    });
    if (
      constrainedMain.length > 0 &&
      (mainObjective.proof?.status === 'held_by_contract' ||
        mainObjective.proof?.status === 'no_admissible_increase')
    ) {
      return {
        ok: false,
        code: 'main_ratio_conflict',
        lineIds: constrainedMain.map((line) => line.lineId),
        ingredientNames: constrainedMain.map((line) => line.ingredientName),
        messagePl:
          `Blokady lub zakresy składników Głównych ` +
          `(${constrainedMain.map((line) => line.ingredientName).join(', ')}) ` +
          `nie pozwalają zbudować poprawnej receptury dla partii ` +
          `${input.target_batch_grams.toFixed(1)} g. PI nie zmieniło receptury.`,
      };
    }
    const currentHardSafe = classifyViolationBands(working).hardMetrics.length === 0;
    const currentDirectionSafe = recipeDirectionViolations(working).length === 0;
    const currentProtein = assessProteinFormulation(working);
    if (
      currentHardSafe &&
      currentDirectionSafe &&
      (!currentProtein.applicable || currentProtein.qualification.qualified)
    ) {
      return { ok: false, code: 'already_clean' };
    }
    // The PROVEN failure: solver really ran `solverRounds` times and these
    // exact metrics stayed out of band (empty = no violations detectable).
    if (violated.length === 0) {
      violated = [...new Set(recipeDirectionViolations(working).map((v) => v.metric))];
    }
    const fallback = withBatchReconciliation(
      withTemplateFallback({
        ok: false,
        code: 'no_proposal',
        violatedMetrics: violated,
        solverInvocations: solverRounds,
        ...(hasActiveExactDirectionObjective(input) && currentHardSafe && !currentDirectionSafe
          ? { directionTargetUnreached: true }
          : {}),
        iteration: iterated.diagnostics,
      }),
      working,
      iterated.diagnostics,
      violationsBefore,
    );
    // A template/current-batch recovery is more authoritative than a removal
    // suggestion. Never pre-empt a valid fallback with the first positive
    // Standard row merely because it happens to appear first in the draft.
    if (fallback.ok || fallback.code !== 'no_proposal') return fallback;
    const anchoredStandards = input.items.filter(
      (item) =>
        item.lock_type === 'unlocked' &&
        item.actual_grams === null &&
        item.planned_grams > 0 &&
        (item.user_intent_anchor_grams ?? 0) > 0,
    );
    // With several positive Standard anchors the failed search proves only
    // that the complete vector is infeasible; it does not identify which one
    // ingredient must be removed. Preserve the generic proven stop instead of
    // offering an arbitrary destructive action for the first row.
    if (anchoredStandards.length === 1) {
      const anchoredStandard = anchoredStandards[0]!;
      const vector = iterated.diagnostics.candidateVector.find(
        (candidate) => candidate.lineId === anchoredStandard.id,
      );
      const attemptedPositive = vector?.testedGrams.filter((grams) => grams >= 1) ?? [];
      const remaining = detectViolations(calculateRecipe(working))[0];
      const limitingMetric = remaining?.metric ?? violated[0] ?? 'technical_range';
      return {
        ok: false,
        code: 'standard_presence_removal_required',
        lineId: anchoredStandard.id,
        productName: anchoredStandard.ingredient.name,
        currentGrams: anchoredStandard.planned_grams,
        bestAttemptedNonZeroGrams:
          attemptedPositive.length > 0 ? Math.min(...attemptedPositive) : 1,
        limitingMetric,
        acceptedMin: remaining?.band?.min ?? null,
        acceptedMax: remaining?.band?.max ?? null,
        messagePl:
          'Ten składnik trzeba usunąć albo zmienić. ' +
          `PINGÜINO nie znalazło poprawnej receptury z zachowaniem składnika ` +
          `${anchoredStandard.ingredient.name} w ilości co najmniej 1 g.`,
      };
    }
    return fallback;
  }

  // OWNER P0 ACCEPTANCE GATE (definitive-fail repair): a changed candidate is a
  // valid „Przelicz z PI" outcome ONLY when it is scientifically acceptable:
  //   - every hard metric in range, OR
  //   - strictly fewer violations, OR
  //   - a REAL solver action verifiably reduced the engine's weighted severity
  //     (a pure proportional rescale never changes per-100 g severity, so the
  //     8 × 125 g batch-only case — violations 9 → 9, severity unchanged — is
  //     structurally rejected and can never become a Preview).
  const afterViolationList = detectViolations(calculateRecipe(working));
  const violationsAfter = afterViolationList.length;
  const severityBefore = totalSeverity(constrained.input);
  const severityAfter = totalSeverity(working);
  const improved =
    violationsAfter === 0 ||
    violationsAfter < violationsBefore ||
    (lastProposal !== null && severityAfter < severityBefore - SEVERITY_EPS) ||
    (mainObjective.proof?.status === 'maximized' &&
      Math.abs(mainObjective.proof.exactAcceptedMainGrams - mainObjective.proof.startingMainGrams) >
        MAIN_OBJECTIVE_EPSILON_G);
  if (!improved) {
    // Owner Phase 6: same fallback door — a produced-but-rejected local
    // candidate on a complete unconstrained draft tries the template seed;
    // then the CURRENT-DRAFT batch-reconciliation door (owner P0 primary root
    // cause: an off-batch draft is never „the best verified result").
    const currentNativeSafe = detectViolations(calculateRecipe(input)).length === 0;
    const currentDirectionViolations = recipeDirectionViolations(input);
    const currentDirectionUnreached =
      hasActiveExactDirectionObjective(input) && currentDirectionViolations.length > 0;
    return withBatchReconciliation(
      withTemplateFallback({
        ok: false,
        code: currentNativeSafe && currentDirectionUnreached ? 'no_proposal' : 'unsafe_proposal',
        violatedMetrics: [
          ...new Set(
            (currentNativeSafe && currentDirectionUnreached
              ? currentDirectionViolations
              : afterViolationList
            ).map((violation) => violation.metric),
          ),
        ],
        solverInvocations: solverRounds,
        ...(currentNativeSafe && currentDirectionUnreached
          ? { directionTargetUnreached: true }
          : { batchOnly: lastProposal === null }),
        iteration: iterated.diagnostics,
      }),
      working,
      iterated.diagnostics,
      violationsBefore,
    );
  }

  const explanation = lastProposal
    ? buildProposalExplanation(constrained.input, set, lastProposal)
    : ((): ConstraintExplanationEntry[] => {
        const lockedNames = lockedIngredientNames(input, set);
        return lockedNames.length > 0
          ? [{ kind: 'locked_unchanged', ingredientNames: lockedNames }]
          : [];
      })();

  // SHARED DIRECTION NEAREST: rank the final candidate by its distance to the
  // band the user actually requested before it is practicalized into a Preview.
  working = polishDirectionVector(
    input,
    set,
    improveDirectionNearestVector(input, set, working, createdAt, options),
    createdAt,
    options,
  );
  if (!positiveStandardPresencePreserved(input, working)) {
    const restoredPresence = rescalePreservingMainGroup(
      input,
      working,
      set,
      input.target_batch_grams,
    );
    if (restoredPresence.ok) working = restoredPresence.input;
  }

  let preview = finishPreview(
    'optimize',
    copy.preview.kindLabels.optimize,
    input,
    set,
    working,
    set,
    violationsBefore,
    explanation,
    createdAt,
  );
  preview = polishPracticalDirectionPreview(input, set, preview, createdAt, options);
  attachMainObjective(preview, input, mainObjective.proof);
  preview.autoBalance = { batchRescaled, solverRounds };
  preview.iteration = iterated.diagnostics;
  // ACCEPTANCE ADDENDUM (1+3): the local-correction preview carries the same
  // honest diagnostic classification as the formulation path. `finishPreview`
  // may have continued the candidate into a different whole-gram recipe, so
  // this final classification follows the canonical executable input.
  const localBands = classifyViolationBands(preview.proposedInput);
  preview.hardResidualMetrics = localBands.hardMetrics;
  const proteinResidual =
    preview.proteinFormulation?.applicable === true &&
    !preview.proteinFormulation.qualification.qualified;
  const practicalizationBlocked = preview.practicalization?.status === 'blocked';
  preview.diagnosticOnly =
    practicalizationBlocked ||
    localBands.hardMetrics.length > 0 ||
    iterated.diagnostics.capped ||
    proteinResidual;
  preview.diagnosticReason = practicalizationBlocked
    ? 'practicalization_blocked'
    : localBands.hardMetrics.length > 0
      ? 'hard_residual'
      : iterated.diagnostics.capped
        ? 'iteration_cap'
        : proteinResidual
          ? 'protein_claim_residual'
          : undefined;
  // `finishPreview` practicalizes the exact solver vector. Rounding may move
  // a candidate across a narrow five-step target boundary, so re-rank the
  // executable Preview itself (the values Apply will actually write). A
  // native-safe recipe may never be presented as a Direction improvement when
  // the practical vector misses more axes or fails to strictly improve the
  // lexicographic target objective.
  const baselineDirection = recipeDirectionViolations(input);
  if (
    hasActiveExactDirectionObjective(input) &&
    detectViolations(calculateRecipe(input)).length === 0 &&
    baselineDirection.length > 0
  ) {
    const executableDirection = recipeDirectionViolations(preview.proposedInput);
    const baselineSeverity = baselineDirection.reduce(
      (sum, violation) => sum + violation.severity_points,
      0,
    );
    const executableSeverity = executableDirection.reduce(
      (sum, violation) => sum + violation.severity_points,
      0,
    );
    const executableImproves =
      executableDirection.length < baselineDirection.length ||
      (executableDirection.length === baselineDirection.length &&
        executableSeverity < baselineSeverity - SEVERITY_EPS);
    if (!executableImproves) {
      return {
        ok: false,
        code: 'no_proposal',
        violatedMetrics: [...new Set(baselineDirection.map((violation) => violation.metric))],
        solverInvocations: solverRounds,
        directionTargetUnreached: true,
        iteration: iterated.diagnostics,
      };
    }
  }
  // Owner Phase 6 template door, third shape. It already covers a local
  // corrector that produces NOTHING (`no_proposal`) and one whose candidate is
  // rejected (`unsafe_proposal`). A candidate that IMPROVES the draft but still
  // leaves a HARD band out of range is the same failure wearing a different
  // hat: the Preview is diagnostic-only, so nobody can Apply it. On a
  // substantive unconstrained draft, try the approved template for the SAME
  // profile before settling for a Preview that cannot be executed — and keep
  // the local result unless the template one is genuinely applicable.
  //
  // A requested Direction target the executable candidate does not REACH is the
  // same shape again: the Preview is applicable, but PI is handing back NEAREST
  // where an approved formulation of the same profile reaches the target
  // exactly. The template is taken only when it genuinely reaches what the
  // local candidate missed, so this can improve the answer and never degrade it.
  const localDirectionUnreached =
    hasActiveExactDirectionObjective(input) &&
    recipeDirectionViolations(preview.proposedInput).length > 0;
  if (
    decision.reasons.includes('substantive_unconstrained_draft') &&
    ((preview.diagnosticOnly === true && preview.diagnosticReason === 'hard_residual') ||
      localDirectionUnreached)
  ) {
    const lookup = selectFormulationTemplateForRecipe(input);
    if (lookup.template) {
      const seeded = buildFormulationPreviewInternal(
        input,
        set,
        lookup.template,
        'full_formulation',
        createdAt,
        templateOptions,
        true,
      );
      const seededUsable = seeded.ok && seeded.preview.diagnosticOnly !== true;
      const seededReachesDirection =
        seeded.ok && recipeDirectionViolations(seeded.preview.proposedInput).length === 0;
      if (seededUsable && (!localDirectionUnreached || seededReachesDirection)) return seeded;
    }
  }
  return mainSafePreview(input, preview, options.productBehaviorSnapshots);
}

/**
 * Normal RECIPE substitution. The candidate is first swapped into an immutable
 * draft, then the existing deterministic optimizer is allowed to rebalance it.
 * The returned payload is rebased onto the ORIGINAL draft so the normal stale
 * fingerprint, constraints, duplicate, hard-safety and Apply gates remain the
 * only write path.
 */
export function buildSubstitutionPreview(
  input: RecipeInput,
  set: ConstraintSet,
  lineId: string,
  substitute: EngineIngredient,
  authorization: SubstituteAuthorization,
  createdAt: string,
  options: OptimizePreviewOptions = {},
): BuildPreviewResult {
  const original = input.items.find((item) => item.id === lineId);
  if (!original) return { ok: false, code: 'line_missing' };
  const reasons: string[] = [];
  if (input.items.some((item) => item.actual_grams !== null))
    reasons.push('actual_batch_not_recipe');
  if (!isVerifiedRuntimeSubstitute(substitute))
    reasons.push('candidate_not_verified_mapper_reference');
  const substituteFingerprint = substitutionIngredientFingerprint(substitute);
  if (
    !hasVerifiedMapperSubstitutionAuthorization(authorization) ||
    authorization.canonicalId !== canonicalIngredientId(substitute) ||
    authorization.ingredientFingerprint !== substituteFingerprint ||
    authorization.mapperRowFingerprint.length === 0
  ) {
    reasons.push('candidate_authorization_mismatch');
  }
  if (input.category === 'vegan_gelato' && authorization.veganEligibility !== 'VEGAN_VERIFIED') {
    reasons.push('candidate_authorization_not_vegan');
  }
  if (canonicalIngredientId(original.ingredient) === canonicalIngredientId(substitute)) {
    reasons.push('same_canonical_ingredient');
  }
  if (
    isTemplateControlledStabilizer(original.ingredient) ||
    isTemplateControlledStabilizer(substitute)
  ) {
    reasons.push('template_controlled_stabilizer_substitution_unsupported');
  }
  if (
    input.items.some(
      (item) =>
        item.id !== lineId &&
        canonicalIngredientId(item.ingredient) === canonicalIngredientId(substitute),
    )
  ) {
    reasons.push('canonical_duplicate');
  }
  if (resolveFunctionalRole(original.ingredient) !== resolveFunctionalRole(substitute)) {
    reasons.push('different_functional_role');
  }
  if (input.category === 'vegan_gelato') {
    const vegan = substitute.flags?.vegan_eligibility;
    if (vegan !== 'VEGAN_VERIFIED') reasons.push('candidate_not_verified_vegan');
  }
  if (reasons.length > 0) {
    return {
      ok: false,
      code: 'substitution_invalid',
      reasons,
      messagePl: `Brak bezpiecznego zamiennika: ${reasons.join(', ')}.`,
    };
  }

  const swapped: RecipeInput = {
    ...input,
    items: input.items.map((item) =>
      item.id === lineId ? { ...item, ingredient: structuredClone(substitute) } : item,
    ),
  };
  const optimized = buildOptimizePreview(swapped, set, createdAt, options);
  const proposed = optimized.ok
    ? optimized.preview.proposedInput
    : optimized.code === 'already_clean'
      ? swapped
      : null;
  if (!proposed) return optimized;

  const nativeResidual = detectViolations(calculateRecipe(proposed));
  const directionResidual = recipeDirectionViolations(proposed);
  const protein = assessProteinFormulation(proposed);
  const preserved = verifyConstraintsPreserved(set, proposed);
  if (
    nativeResidual.length > 0 ||
    directionResidual.length > 0 ||
    (protein.applicable && !protein.qualification.qualified) ||
    !preserved.ok
  ) {
    return {
      ok: false,
      code: 'substitution_invalid',
      reasons: [
        ...nativeResidual.map((violation) => `hard:${violation.metric}`),
        ...directionResidual.map((violation) => `direction:${violation.metric}`),
        ...(protein.applicable && !protein.qualification.qualified ? ['protein_claim'] : []),
        ...(!preserved.ok ? ['constraint_not_preserved'] : []),
      ],
      messagePl: 'Brak bezpiecznego zamiennika dla bieżących blokad i profilu receptury.',
    };
  }

  const preview = finishPreview(
    'substitution',
    `Zamiana: ${original.ingredient.name} → ${substitute.name}`,
    input,
    set,
    proposed,
    set,
    violationCount(calculateRecipe(input)),
    optimized.ok ? optimized.preview.explanation : [],
    createdAt,
  );
  preview.substitution = {
    lineId,
    fromCanonicalId: canonicalIngredientId(original.ingredient),
    toCanonicalId: canonicalIngredientId(substitute),
    fromName: original.ingredient.name,
    toName: substitute.name,
    changesMainIdentity: original.lock_type === 'main',
    candidateFingerprint: authorization.ingredientFingerprint,
    mapperRowFingerprint: authorization.mapperRowFingerprint,
    allergensFingerprint: authorization.allergensFingerprint,
    veganEligibility: authorization.veganEligibility,
  };
  return { ok: true, preview };
}

/**
 * Explicit removal is deliberately separate from ordinary optimization. A
 * positive visible Standard line may never fall to 0 or disappear during the
 * normal search. Only this user-invoked builder may remove it, after which the
 * canonical optimizer rebalances the remaining recipe with the removed
 * canonical identity excluded for this one proposal.
 */
export function buildExplicitStandardRemovalPreview(
  input: RecipeInput,
  set: ConstraintSet,
  lineId: string,
  createdAt: string,
  options: OptimizePreviewOptions = {},
): BuildPreviewResult {
  const original = input.items.find((item) => item.id === lineId);
  if (!original) return { ok: false, code: 'line_missing' };
  if (
    original.lock_type !== 'unlocked' ||
    original.actual_grams !== null ||
    original.planned_grams <= 0 ||
    (original.user_intent_anchor_grams ?? 0) <= 0 ||
    isConstrained(set, lineId)
  ) {
    return {
      ok: false,
      code: 'unsafe_proposal',
      violatedMetrics: ['standard_presence_removal_not_allowed'],
    };
  }

  const nextSet: ConstraintSet = {
    byLineId: Object.fromEntries(
      Object.entries(set.byLineId).filter(([candidateLineId]) => candidateLineId !== lineId),
    ),
  };
  const pruned: RecipeInput = {
    ...input,
    items: input.items.filter((item) => item.id !== lineId),
  };
  const excludedIngredientIds = [
    ...(options.excludedIngredientIds ?? []),
    canonicalIngredientId(original.ingredient),
  ];
  const optimized = buildOptimizePreview(pruned, nextSet, createdAt, {
    ...options,
    excludedIngredientIds,
  });
  let proposed: RecipeInput | null = optimized.ok ? optimized.preview.proposedInput : null;
  if (!proposed) {
    const restored = rescaleBatchToTarget(pruned, nextSet, input.target_batch_grams);
    if (restored.ok) proposed = restored.input;
  }
  if (!proposed) return optimized;

  const nativeResidual = detectViolations(calculateRecipe(proposed));
  const directionResidual = recipeDirectionViolations(proposed);
  const protein = assessProteinFormulation(proposed);
  const preserved = verifyConstraintsPreserved(nextSet, proposed);
  if (
    nativeResidual.length > 0 ||
    directionResidual.length > 0 ||
    (protein.applicable && !protein.qualification.qualified) ||
    !preserved.ok ||
    Math.abs(plannedSum(proposed) - input.target_batch_grams) > BATCH_SUM_TOLERANCE_G
  ) {
    return {
      ok: false,
      code: 'unsafe_proposal',
      violatedMetrics: [
        ...nativeResidual.map((violation) => violation.metric),
        ...directionResidual.map((violation) => violation.metric),
        ...(protein.applicable && !protein.qualification.qualified ? ['protein_claim'] : []),
        ...(!preserved.ok ? ['constraint_not_preserved'] : []),
        ...(Math.abs(plannedSum(proposed) - input.target_batch_grams) > BATCH_SUM_TOLERANCE_G
          ? ['batch_mass_mismatch']
          : []),
      ],
    };
  }

  const preview = finishPreview(
    'optimize',
    'Usunięcie składnika i ponowne przeliczenie',
    input,
    set,
    proposed,
    nextSet,
    violationCount(calculateRecipe(input)),
    optimized.ok ? optimized.preview.explanation : [],
    createdAt,
  );
  preview.explicitStandardRemoval = {
    lineId,
    canonicalIngredientId: canonicalIngredientId(original.ingredient),
    ingredientFingerprint: substitutionIngredientFingerprint(original.ingredient),
    productName: original.ingredient.name,
    beforeGrams: original.planned_grams,
  };
  // Explicit removal reuses the canonical optimizer. Preserve its Main
  // frontier proof so Apply can independently re-derive the exact same
  // Main-bearing proposal instead of rejecting every consented removal as an
  // unauthorised Main vector.
  if (optimized.ok && optimized.preview.mainObjective) {
    preview.mainObjective = structuredClone(optimized.preview.mainObjective);
  }
  preview.hardResidualMetrics = [];
  preview.diagnosticOnly = false;
  return { ok: true, preview };
}

/**
 * Batch change (§17.4): rescale to the target WITHOUT touching locked grams —
 * `rescaleBatchToTarget` preserves locked/range lines exactly (same float64)
 * and refuses honestly when the preserved mass alone exceeds the new batch.
 */
export function buildBatchRescalePreview(
  input: RecipeInput,
  set: ConstraintSet,
  newBatchGrams: number,
  createdAt: string,
): BuildPreviewResult {
  // Owner P0 (scale safety): the target must be a FINITE POSITIVE number — an
  // empty/zero/NaN/negative scale input can never produce a 0 g preview.
  if (!Number.isFinite(newBatchGrams) || newBatchGrams <= 0) {
    return { ok: false, code: 'rescale_invalid' };
  }
  const batchRatio = newBatchGrams / input.target_batch_grams;
  const isPercentContract = (item: RecipeInput['items'][number]): boolean =>
    set.byLineId[item.id]?.mode === 'percent' ||
    (set.byLineId[item.id] === undefined && item.lock_type === 'percent');
  const fixedLineIds = new Set(
    input.items
      .filter(
        (item) =>
          !isPercentContract(item) &&
          (item.lock_type !== 'unlocked' || isConstrained(set, item.id)),
      )
      .map((item) => item.id),
  );
  const percentageAuthorityScaledInput: RecipeInput = {
    ...input,
    target_batch_grams: newBatchGrams,
    items: input.items.map((item) =>
      !fixedLineIds.has(item.id) &&
      !isPercentContract(item) &&
      (isTemplateControlledStabilizer(item.ingredient) ||
        canonicalIngredientId(item.ingredient) === OWNER_INULIN_POLICY.mapperIngredientId)
        ? { ...item, planned_grams: item.planned_grams * batchRatio }
        : item,
    ),
  };
  // §6: a batch change is an explicit owner control, so a user-held Main is
  // rescaled with the batch rather than pinned to its old absolute grams.
  const batchSolverSet = solverHolds(percentageAuthorityScaledInput, set);
  const rescaled = rescaleBatchToTarget(
    percentageAuthorityScaledInput,
    batchSolverSet,
    newBatchGrams,
  );
  if (!rescaled.ok) {
    switch (rescaled.reason) {
      case 'invalid_constraints':
        return { ok: false, code: 'rescale_invalid' };
      case 'actuals_present':
        return { ok: false, code: 'rescale_actuals' };
      case 'no_scalable_lines':
        return { ok: false, code: 'rescale_no_scalable' };
      case 'locked_sum_exceeds_batch':
        return {
          ok: false,
          code: 'rescale_locked_sum',
          minimumBatchGrams: rescaled.minimumBatchGrams ?? 0,
        };
    }
  }

  const mainIdentity = verifyMainIngredientIdentity(input, rescaled.input);
  if (!mainIdentity.ok) {
    return {
      ok: false,
      code: 'main_ratio_conflict',
      lineIds: [...new Set(mainIdentity.violations.flatMap((violation) => violation.lineIds))],
      ingredientNames: [
        ...new Set(mainIdentity.violations.flatMap((violation) => violation.ingredientNames)),
      ],
      messagePl: mainIdentityViolationMessage(mainIdentity),
    };
  }

  const subMinimumPositiveStandards = input.items.filter((item) => {
    if (
      item.lock_type !== 'unlocked' ||
      item.actual_grams !== null ||
      item.planned_grams <= 0 ||
      (item.user_intent_anchor_grams ?? 0) <= 0
    ) {
      return false;
    }
    const proposed = rescaled.input.items.find((candidate) => candidate.id === item.id);
    return proposed === undefined || proposed.planned_grams < 1;
  });
  if (subMinimumPositiveStandards.length > 0) {
    return {
      ok: false,
      code: 'practicalization_blocked',
      lineIds: subMinimumPositiveStandards.map((item) => item.id),
      messagePl:
        'Przeskalowanie obniżyłoby dodatni składnik Standard poniżej 1 g. Zwiększ partię albo usuń składnik jawnie.',
    };
  }

  const violationsBefore = violationCount(calculateRecipe(input));
  const lockedNames = lockedIngredientNames(input, set);
  const explanation: ConstraintExplanationEntry[] =
    lockedNames.length > 0 ? [{ kind: 'locked_unchanged', ingredientNames: lockedNames }] : [];

  return {
    ok: true,
    preview: finishPreview(
      'batch_rescale',
      copy.preview.kindLabels.batch_rescale,
      input,
      set,
      rescaled.input,
      set,
      violationsBefore,
      explanation,
      createdAt,
    ),
  };
}

export interface SuggestedBoundFix {
  type: 'set_max' | 'set_min';
  lineId: string;
  grams: number;
}

function constraintSetAfterSuggestedFix(
  set: ConstraintSet,
  fix: SuggestedBoundFix,
): ConstraintSet | null {
  if (!Number.isFinite(fix.grams) || fix.grams < 0 || !fix.lineId.trim()) return null;
  const current: IngredientConstraint | undefined = set.byLineId[fix.lineId];
  const nextConstraint: IngredientConstraint =
    current?.mode === 'range'
      ? fix.type === 'set_max'
        ? {
            mode: 'range',
            minGrams: Math.min(current.minGrams, fix.grams),
            maxGrams: fix.grams,
          }
        : {
            mode: 'range',
            minGrams: fix.grams,
            maxGrams: Math.max(current.maxGrams, fix.grams),
          }
      : { mode: 'locked', grams: fix.grams };
  return { byLineId: { ...set.byLineId, [fix.lineId]: nextConstraint } };
}

/**
 * §18.2 „Ustaw X g i przelicz”: apply a GENUINELY COMPUTED feasibility bound
 * to the constrained line (an explicit, user-sanctioned lock change), then let
 * the real solver adjust the rest on top. Falls back to the plain bound change
 * when the solver has nothing further to propose.
 */
export function buildSuggestedFixPreview(
  input: RecipeInput,
  set: ConstraintSet,
  fix: SuggestedBoundFix,
  createdAt: string,
): BuildPreviewResult {
  const line = input.items.find((item) => item.id === fix.lineId);
  if (!line) return { ok: false, code: 'line_missing' };

  const nextSet = constraintSetAfterSuggestedFix(set, fix);
  if (!nextSet) return { ok: false, code: 'apply_failed' };

  const adjustedInput: RecipeInput = {
    ...input,
    items: input.items.map((item) =>
      item.id === fix.lineId ? { ...item, planned_grams: fix.grams } : item,
    ),
  };

  const violationsBefore = violationCount(calculateRecipe(input));

  // „…i przelicz”: solver pass on top of the adjusted lock (locks respected).
  // Agent 1 §5.3 repair: the no-solver fallback is normalized back to the
  // target batch through the approved §17.4 rescale (locked grams byte-kept) —
  // a `suggested_fix` preview is no longer the only path that could carry an
  // off-batch proposal past the door (the door now gates it too).
  const optimized = buildOptimizePreview(adjustedInput, nextSet, createdAt);
  const fallbackInput = ((): RecipeInput => {
    if (
      Math.abs(plannedSum(adjustedInput) - adjustedInput.target_batch_grams) <=
      BATCH_SUM_TOLERANCE_G
    ) {
      return adjustedInput;
    }
    const restored = rescaleBatchToTarget(adjustedInput, nextSet, adjustedInput.target_batch_grams);
    return restored.ok ? restored.input : adjustedInput;
  })();
  const proposedInput = optimized.ok ? optimized.preview.proposedInput : fallbackInput;
  const mainIdentity = verifyMainIngredientIdentity(input, proposedInput);
  if (!mainIdentity.ok) {
    return {
      ok: false,
      code: 'main_ratio_conflict',
      lineIds: [...new Set(mainIdentity.violations.flatMap((violation) => violation.lineIds))],
      ingredientNames: [
        ...new Set(mainIdentity.violations.flatMap((violation) => violation.ingredientNames)),
      ],
      messagePl: mainIdentityViolationMessage(mainIdentity),
    };
  }
  const explanation = optimized.ok
    ? optimized.preview.explanation
    : ((): ConstraintExplanationEntry[] => {
        const lockedNames = lockedIngredientNames(adjustedInput, nextSet);
        return lockedNames.length > 0
          ? [{ kind: 'locked_unchanged', ingredientNames: lockedNames }]
          : [];
      })();

  return {
    ok: true,
    preview: {
      ...finishPreview(
        'suggested_fix',
        copy.preview.kindLabels.suggested_fix,
        input,
        set,
        proposedInput,
        nextSet,
        violationsBefore,
        explanation,
        createdAt,
      ),
      suggestedFix: { ...fix },
    },
  };
}

/* ── §20.1 history record ────────────────────────────────────────────────── */

export type ScorePresentationSource = 'CURRENT_RECIPE' | 'PREVIEW' | 'APPLIED_RECIPE';

export type RecalculationTerminalState =
  | { state: 'WORKING' }
  | { state: 'TIMEOUT'; messagePl: string }
  | { state: 'ERROR'; messagePl: string }
  | { state: 'CANCELLED' }
  | { state: 'PREVIEW_READY' }
  | { state: 'NO_CHANGE_NEEDED' }
  | { state: 'BEST_ACHIEVABLE' }
  | { state: 'SETTINGS_CONFIRMATION_REQUIRED' }
  | { state: 'LOCK_CHANGE_REQUIRED'; code: 'impossible_under_constraints' }
  | { state: 'PRODUCT_GRAMS_REQUIRED'; code: 'missing_required_role'; lineIds: string[] }
  | {
      state: 'PRODUCT_DATA_REQUIRED' | 'MAPPER_BINDING_REQUIRED';
      code: 'product_behavior_invalid';
      lineIds: string[];
    }
  | {
      state: 'BLOCKED_WITH_EXACT_ACTION';
      code: Exclude<BuildPreviewResult, { ok: true }>['code'];
      messagePl?: string;
      action?: 'choose_product' | 'return_to_recipe';
    };

/** Session-only presentation state captured immediately before Apply. It
 * stores the Preview input and its provenance, never a copied score number.
 * Undo may restore it only after revalidating both working-state and
 * ProductBehavior fingerprints against the restored recipe. */
export interface AppliedPresentationSnapshot {
  scoreSource: ScorePresentationSource;
  preview: ConstraintPreview;
  terminal: RecalculationTerminalState;
  awaitingRecalculation: boolean;
  baseFingerprint: string;
  proposedFingerprint: string;
  baseProductBehaviorFingerprint: string;
  proposedProductBehaviorFingerprint: string;
  substitutionConsent: SubstitutionConsent | null;
  substitutionAuthorization: SubstitutionSessionAuthorization | null;
  proposalProductBehaviorAuthorization: ProposalProductBehaviorAuthorization | null;
  explicitStandardRemovalConsent: ExplicitStandardRemovalConsent | null;
  directionConsent: DirectionBestAchievableConsent | null;
  suggestedFixAuthorization: SuggestedFixSessionAuthorization | null;
}

export interface AppliedChangeRecord {
  id: string;
  at: string;
  kind: PreviewKind;
  titlePl: string;
  /** §20.1 context: mode + serving temperature (rendered with U+2212). */
  mode: RecipeInput['mode'];
  temperatureC: number;
  engineVersion: string;
  configVersion: string;
  before: {
    input: RecipeInput;
    constraints: ConstraintSet;
    excludedIngredientIds: readonly string[];
    productBehaviorSnapshots?: Record<string, ProductBehaviorSnapshot>;
    /** Current whole-gram authority before Apply. Undo restores this exact
     * evidence so readiness derives from the restored fingerprint. */
    practicalRecipeAudit?: PracticalRecipeSavedAudit | null;
    /** Session-only score/Preview provenance. Omitted for legacy history. */
    presentation?: AppliedPresentationSnapshot;
  };
  after: {
    input: RecipeInput;
    constraints: ConstraintSet;
    excludedIngredientIds: readonly string[];
    productBehaviorSnapshots?: Record<string, ProductBehaviorSnapshot>;
  };
  lines: PreviewLineDiff[];
  explanation: ConstraintExplanationEntry[];
  violationsBefore: number;
  violationsAfter: number;
  /** Owner A6 (complete Undo/history): the applied formulation's provenance —
   * template id + toolbox-added markers ride the record (undo needs no page
   * state to explain what PI added). Absent for non-formulation applies. */
  formulation?: {
    mode: FormulationMode;
    templateId: string;
    added: FormulationAddedLine[];
    localFallback: boolean;
  };
  /** Session history audit: the exact Engine candidate that preceded the
   * whole-gram executable input stored in `after.input`. */
  practicalization?: {
    modelVersion: typeof PRACTICAL_RECIPE_MODEL_VERSION;
    exactInput: RecipeInput;
    lines: PracticalRecipeAudit['lines'];
  };
}

/* ── the ONLY door ───────────────────────────────────────────────────────── */

export type BlockedApply =
  | { code: 'stale_preview'; messagePl: string }
  | { code: 'invalid_lines'; messagePl: string; lineNames: string[] }
  | { code: 'ingredient_identity_violated'; messagePl: string; lineNames: string[] }
  | { code: 'physical_actual_violated'; messagePl: string; lineNames: string[] }
  | { code: 'substitution_invalid'; messagePl: string; reasons: string[] }
  | { code: 'excluded_ingredients'; messagePl: string; ingredientNames: string[] }
  | {
      code: 'vegan_ingredients_invalid';
      messagePl: string;
      issues: VeganRecipeEligibilityIssue[];
    }
  | {
      code: 'vegan_profile_constraint_invalid';
      messagePl: string;
      issues: VeganProfileConstraintIssue[];
    }
  | {
      code: 'constraints_violated';
      messagePl: string;
      violations: ConstraintPreservationViolation[];
    }
  /** Owner P0 Phase 6: the proposal would introduce a duplicate canonical ingredient. */
  | { code: 'duplicate_lines'; messagePl: string; ingredientNames: string[] }
  /** Owner P0 multi-main: no applicable proposal may remove, zero, demote or
   * ratio-drift a positive Main identity from the draft it was built for. */
  | {
      code: 'main_identity_violated';
      messagePl: string;
      violations: MainIdentityViolation[];
    }
  | {
      code: 'product_behavior_invalid';
      messagePl: string;
      violations: MainEnvelopeViolation[];
    }
  | {
      code: 'eco_flavour_floor_violated';
      messagePl: string;
      violations: EcoFlavourViolation[];
    }
  | { code: 'direction_consent_required'; messagePl: string }
  /** Owner P0 Phase 5: proposed planned sum breaks the target-batch invariant. */
  | { code: 'batch_total_mismatch'; messagePl: string; proposedSum: number; targetBatch: number }
  /** Owner P0 (definitive fail): an optimize proposal that does not improve an
   * out-of-band recipe (e.g. batch-only rescale, 9 → 9) is never appliable. */
  | {
      code: 'unsafe_proposal';
      messagePl: string;
      violationsBefore: number;
      violationsAfter: number;
    }
  /** ACCEPTANCE ADDENDUM (1): a preview whose iteration hit the deterministic
   * cap is DIAGNOSTIC ONLY — `iteration_cap` can NEVER be labelled
   * best-achievable proof, so Apply is structurally disabled at this door. */
  | { code: 'iteration_cap_diagnostic'; messagePl: string }
  /** ACCEPTANCE ADDENDUM (3): residual violations on NATIVE approved bands
   * (hard by `violationBands` provenance) make the preview DIAGNOSTIC ONLY —
   * re-derived TRUSTLESSLY from the proposed input at this door, never from
   * preview-carried flags. Soft/provisional residuals stay applicable. */
  | { code: 'hard_residual_violations'; messagePl: string; hardMetrics: string[] }
  /** OWNER FINAL INTEGRATION ADDENDUM item 2 (2026-07-25): the formulation
   * provenance is a NON-APPROVED template (reference-derived, or an id that
   * exists in no registry at all). Reference data may be diagnostic, test-only
   * or an internal seed — it may NEVER become an applicable production recipe,
   * however the search ended and however exactly the batch matches. Re-derived
   * at this door from the template id in the proposal against the registry's
   * OWN status — never from `preview.formulation.templateStatus`. */
  | { code: 'reference_derived_provenance'; messagePl: string; templateId: string }
  | {
      code: 'practicalization_invalid';
      messagePl: string;
      reason: string;
    };

export type CommitPreviewResult =
  | { ok: true; verified: VerifiedApply }
  | ({ ok: false } & BlockedApply);

function productBehaviorIdentityViolation(
  input: RecipeInput,
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
): MainEnvelopeViolation | null {
  const lineIds = input.items
    .filter((item) => {
      const snapshot = snapshots[item.id];
      if (!snapshot) return false;
      const canonicalId = canonicalIngredientId(item.ingredient);
      if (snapshot.mapperIngredientId !== null && snapshot.mapperIngredientId !== canonicalId)
        return true;
      if (snapshot.source === 'catalog_import') {
        const productToken = `catalog:${snapshot.productId}`;
        return (
          item.ingredient.id !== productToken &&
          !item.ingredient.private_product_id?.startsWith(`${productToken}:version:`)
        );
      }
      if (
        snapshot.source === 'ocr' ||
        snapshot.source === 'manual' ||
        snapshot.source === 'internal_subproduct'
      ) {
        return item.ingredient.private_product_id !== snapshot.productId;
      }
      return false;
    })
    .map((item) => item.id);
  return lineIds.length === 0
    ? null
    : {
        code: 'product_behavior_identity_mismatch',
        lineIds,
        messagePl: 'Snapshot zachowania produktu nie odpowiada aktualnej tożsamości składnika.',
      };
}

/** Binds a successful Preview to immutable product/version/policy authority
 * and rejects the rounded vector before it can be shown as applicable. */
export function bindProductBehaviorToPreview(
  result: BuildPreviewResult,
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
  baseSnapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>> = snapshots,
  technicalOnlyMainLineIds: readonly string[] = [],
): BuildPreviewResult {
  if (!result.ok) return result;
  // This function is also the deterministic formulation seam used by Engine
  // regression fixtures. Runtime callers use the server-authority wrappers in
  // constraintStudioStore; when snapshots are present here they must be
  // enforced exactly, but an empty map must not make the pure Engine service
  // dependent on session/database state.
  const managed = Object.keys(snapshots).length > 0;
  if (!managed) return result;
  const behaviorModule =
    normalizeFormulationStrategy(
      result.preview.proposedInput.goals?.formulation_strategy ?? result.preview.proposedInput.mode,
    ) === 'eco'
      ? 'ECO'
      : 'OPTIMAL';
  const identityViolation = productBehaviorIdentityViolation(
    result.preview.proposedInput,
    snapshots,
  );
  if (identityViolation) {
    return {
      ok: false,
      code: 'product_behavior_invalid',
      violations: [identityViolation],
      messagePl: identityViolation.messagePl,
    };
  }
  const authority = evaluateRecipeConstraintAuthority({
    recipe: result.preview.proposedInput,
    snapshots,
    module: behaviorModule,
    technicalOnlyMainLineIds,
  });
  const authorityBlocking = authority.issues.filter(
    (issue) =>
      issue.source === 'owner_policy' ||
      issue.source === 'main' ||
      issue.source === 'product_behavior' ||
      (issue.source === 'profile' &&
        (issue.code === 'profile_evidence_missing' || issue.code === 'profile_not_eligible')),
  );
  if (authorityBlocking.length > 0) {
    const violations: MainEnvelopeViolation[] = authorityBlocking.map((issue) => ({
      code: issue.source === 'main' ? issue.code : 'product_behavior_missing',
      lineIds: issue.lineIds,
      messagePl: issue.messagePl,
    }));
    // The verdict above was computed on `result.preview.proposedInput` — the candidate the solver
    // built — NOT on the recipe the user is looking at. Reporting its percentage unqualified is how
    // the app came to tell an owner „Grupa Main ma 0.2%" about a draft whose canonical combined
    // Main share is 16 %. Both numbers were true; only one of them was about their recipe.
    const firstMessage = violations[0]?.messagePl;
    return {
      ok: false,
      code: 'product_behavior_invalid',
      violations,
      messagePl: firstMessage
        ? copy.blocked.rejectedProposalAuthority(firstMessage)
        : 'Nie udało się potwierdzić zachowania produktu w tej recepturze.',
    };
  }
  result.preview.productBehaviorFingerprint = productBehaviorSnapshotFingerprint(snapshots);
  result.preview.baseProductBehaviorFingerprint = productBehaviorSnapshotFingerprint(baseSnapshots);
  return result;
}

const violatedIngredientNames = (
  preview: ConstraintPreview,
  violations: readonly ConstraintPreservationViolation[],
): string[] => {
  const nameByLineId = new Map(preview.lines.map((line) => [line.lineId, line.name]));
  return violations.map((violation) => nameByLineId.get(violation.lineId) ?? violation.lineId);
};

/**
 * Preview may change formulation and target batch only. The scientific/product
 * context it was verified under must be exactly the current context: otherwise
 * a forged payload could validate grams under an easier profile and then write
 * those grams into the unchanged current profile.
 */
function sameVerifiedRecipeContext(current: RecipeInput, proposed: RecipeInput): boolean {
  return (
    proposed.mode === current.mode &&
    proposed.category === current.category &&
    Object.is(proposed.target_temperature_c, current.target_temperature_c) &&
    Object.is(proposed.machine_capacity_grams, current.machine_capacity_grams) &&
    JSON.stringify(proposed.goals ?? null) === JSON.stringify(current.goals ?? null)
  );
}

/**
 * A PI proposal may change grams, never ingredient truth. Existing lines keep
 * their complete canonical/composition fingerprint. The sole exception is the
 * exact substitution line, whose Mapper session proof is verified separately
 * below. New lines must byte-match one of the frozen, canonical formulation
 * toolbox payloads; self-declared `is_verified` flags are not authority.
 */
function ingredientIdentityIntegrityViolations(
  current: RecipeInput,
  preview: ConstraintPreview,
  authorizedRemovalLineId?: string,
  omittedUnusedLineIds: ReadonlySet<string> = new Set(),
): string[] {
  const proposedByLineId = new Map(preview.proposedInput.items.map((item) => [item.id, item]));
  const currentIds = new Set(current.items.map((item) => item.id));
  const authorizedSubstitutionLineId =
    preview.kind === 'substitution' ? preview.substitution?.lineId : undefined;
  const violations: string[] = [];

  for (const existing of current.items) {
    const proposed = proposedByLineId.get(existing.id);
    if (!proposed) {
      if (existing.id === authorizedRemovalLineId || omittedUnusedLineIds.has(existing.id)) {
        continue;
      }
      violations.push(existing.ingredient.name);
      continue;
    }
    if (existing.id === authorizedSubstitutionLineId) continue;
    if (
      canonicalIngredientId(existing.ingredient) !== canonicalIngredientId(proposed.ingredient) ||
      substitutionIngredientFingerprint(existing.ingredient) !==
        substitutionIngredientFingerprint(proposed.ingredient)
    ) {
      violations.push(existing.ingredient.name);
    }
  }

  for (const added of preview.proposedInput.items.filter((item) => !currentIds.has(item.id))) {
    const exactApproved = approvedFormulationToolboxIngredients(added.ingredient.id).some(
      (approved) =>
        canonicalIngredientId(approved) === canonicalIngredientId(added.ingredient) &&
        (substitutionIngredientFingerprint(approved) ===
          substitutionIngredientFingerprint(added.ingredient) ||
          substitutionIngredientFingerprint(normalizeIngredientIdentity(approved)) ===
            substitutionIngredientFingerprint(added.ingredient)),
    );
    if (!exactApproved) violations.push(added.ingredient.name || added.id);
  }

  return [...new Set(violations)];
}

/**
 * Preview/Apply may reformulate the future plan, but it is never an authority
 * for physical production facts. Existing actuals are immutable, a line that
 * was not physically added cannot acquire an actual through a forged preview,
 * and a solver-added line must start unlocked and without an actual. A Preview
 * is never an authority for lock transitions: every existing line keeps its
 * current native lock. The identity and planned mass of an already-added line
 * are immutable as well.
 */
function physicalActualIntegrityViolations(current: RecipeInput, proposed: RecipeInput): string[] {
  const currentByLineId = new Map(current.items.map((item) => [item.id, item]));
  const violations: string[] = [];

  for (const item of proposed.items) {
    const existing = currentByLineId.get(item.id);
    if (!existing) {
      if (item.actual_grams !== null || item.lock_type !== 'unlocked') {
        violations.push(item.ingredient.name || item.id);
      }
      continue;
    }

    const actualChanged = !Object.is(item.actual_grams, existing.actual_grams);
    const lockChanged = item.lock_type !== existing.lock_type;
    const existingIsPhysical =
      existing.actual_grams !== null || existing.lock_type === 'already_added';
    const physicalLineChanged =
      existingIsPhysical &&
      (!Object.is(item.planned_grams, existing.planned_grams) ||
        canonicalIngredientId(item.ingredient) !== canonicalIngredientId(existing.ingredient) ||
        substitutionIngredientFingerprint(item.ingredient) !==
          substitutionIngredientFingerprint(existing.ingredient));
    if (actualChanged || lockChanged || physicalLineChanged) {
      violations.push(existing.ingredient.name || existing.id);
    }
  }

  return [...new Set(violations)];
}

/**
 * A verified, applicable recipe change. PRIVATE constructor: the only way to
 * obtain an instance is `VerifiedApply.commit` (aliased `commitPreview`),
 * which ALWAYS runs `verifyConstraintsPreserved` — so an Apply path that
 * skips the check is structurally impossible (see module header).
 */
export class VerifiedApply {
  private constructor(
    /** Deep-cloned working state — safe to write to the recipe store. */
    readonly input: RecipeInput,
    readonly constraints: ConstraintSet,
    readonly record: AppliedChangeRecord,
    readonly productBehaviorSnapshots: Record<string, ProductBehaviorSnapshot>,
  ) {}

  static commit(
    current: RecipeInput,
    currentConstraints: ConstraintSet,
    preview: ConstraintPreview,
    at: string,
    id: string,
    /** Owner P0 (complete Undo): current exclusions ride the §20.1 snapshot. */
    excludedIngredientIds: readonly string[] = [],
    /** Owner P0 NIGHTLY (Phase 3): the CURRENT monotonic draft revision. When
     * both the preview and the caller carry a revision, a mismatch is a stale
     * preview — the additional monotonic guard next to the fingerprint. */
    currentDraftRevision?: number,
    substitutionConsent?: SubstitutionConsent | null,
    substitutionAuthorization?: SubstitutionSessionAuthorization | null,
    directionConsent?: DirectionBestAchievableConsent | null,
    suggestedFixAuthorization?: SuggestedFixSessionAuthorization | null,
    currentProductBehaviorSnapshots: Readonly<
      Record<string, ProductBehaviorSnapshot | undefined>
    > = {},
    technicalOnlyMainLineIds: readonly string[] = [],
    proposalAuthorization?: ProposalProductBehaviorAuthorization | null,
    explicitRemovalConsent?: ExplicitStandardRemovalConsent | null,
    /** Build-only pipeline inputs the staged preview was built with (owner
     * price index for ECO ranking, unavailable-Main declarations, the Pro
     * practical-preview gate). The Apply door rebuilds the deterministic Main
     * frontier with the SAME inputs; otherwise an honest ECO preview ranked
     * with the owner's prices can never be reproduced and is refused. */
    rebuildOptions: Pick<
      OptimizePreviewOptions,
      'effectivePriceOverrides' | 'unavailableMainIngredientIds' | 'requirePracticalPreview'
    > = {},
  ): CommitPreviewResult {
    // Phase 3 monotonic guard: a preview built for an earlier draft revision
    // never applies, whatever the fingerprint says.
    if (
      preview.baseDraftRevision !== undefined &&
      currentDraftRevision !== undefined &&
      preview.baseDraftRevision !== currentDraftRevision
    ) {
      return { ok: false, code: 'stale_preview', messagePl: copy.blocked.stale };
    }
    // §19.2: a preview never applies onto a state it was not built for.
    if (workingStateFingerprint(current, currentConstraints) !== preview.baseFingerprint) {
      return { ok: false, code: 'stale_preview', messagePl: copy.blocked.stale };
    }
    const expectedBaseBehaviorFingerprint =
      preview.baseProductBehaviorFingerprint ?? preview.productBehaviorFingerprint;
    if (
      expectedBaseBehaviorFingerprint !== undefined &&
      productBehaviorSnapshotFingerprint(currentProductBehaviorSnapshots) !==
        expectedBaseBehaviorFingerprint
    ) {
      return { ok: false, code: 'stale_preview', messagePl: copy.blocked.stale };
    }
    if (!sameVerifiedRecipeContext(current, preview.proposedInput)) {
      return { ok: false, code: 'stale_preview', messagePl: copy.blocked.stale };
    }

    // `nextConstraints` is part of an untrusted Preview payload. Normal
    // optimize/rescale/substitution routes must preserve the authenticated
    // current set byte-for-byte. The one intentional transition — a suggested
    // bound fix — is accepted only with a session authorization bound to the
    // same base fingerprint and is independently re-derived here.
    let verifiedNextConstraints = currentConstraints;
    let authorizedRemovalLineId: string | undefined;
    if (preview.kind === 'suggested_fix') {
      const proof = preview.suggestedFix;
      const authorized = suggestedFixAuthorization;
      if (
        proof === undefined ||
        authorized == null ||
        authorized.baseFingerprint !== preview.baseFingerprint ||
        proof.type !== authorized.type ||
        proof.lineId !== authorized.lineId ||
        !Object.is(proof.grams, authorized.grams)
      ) {
        return { ok: false, code: 'stale_preview', messagePl: copy.blocked.stale };
      }
      const rederived = constraintSetAfterSuggestedFix(currentConstraints, proof);
      if (rederived === null || !sameConstraintSet(preview.nextConstraints, rederived)) {
        return { ok: false, code: 'stale_preview', messagePl: copy.blocked.stale };
      }
      verifiedNextConstraints = rederived;
    } else if (preview.explicitStandardRemoval !== undefined) {
      const proof = preview.explicitStandardRemoval;
      const consent = explicitRemovalConsent;
      const currentLine = current.items.find((item) => item.id === proof.lineId);
      const rederivedNextConstraints: ConstraintSet = {
        byLineId: Object.fromEntries(
          Object.entries(currentConstraints.byLineId).filter(([lineId]) => lineId !== proof.lineId),
        ),
      };
      const authorized =
        consent != null &&
        consent.baseFingerprint === preview.baseFingerprint &&
        consent.proposedFingerprint ===
          workingStateFingerprint(preview.proposedInput, preview.nextConstraints) &&
        consent.lineId === proof.lineId &&
        consent.canonicalIngredientId === proof.canonicalIngredientId &&
        consent.ingredientFingerprint === proof.ingredientFingerprint &&
        Object.is(consent.beforeGrams, proof.beforeGrams) &&
        currentLine !== undefined &&
        currentLine.lock_type === 'unlocked' &&
        currentLine.actual_grams === null &&
        currentLine.planned_grams > 0 &&
        (currentLine.user_intent_anchor_grams ?? 0) > 0 &&
        Object.is(currentLine.planned_grams, proof.beforeGrams) &&
        canonicalIngredientId(currentLine.ingredient) === proof.canonicalIngredientId &&
        substitutionIngredientFingerprint(currentLine.ingredient) === proof.ingredientFingerprint &&
        !preview.proposedInput.items.some((item) => item.id === proof.lineId) &&
        sameConstraintSet(preview.nextConstraints, rederivedNextConstraints);
      if (!authorized) {
        return { ok: false, code: 'stale_preview', messagePl: copy.blocked.stale };
      }
      verifiedNextConstraints = rederivedNextConstraints;
      authorizedRemovalLineId = proof.lineId;
    } else if (!sameConstraintSet(preview.nextConstraints, currentConstraints)) {
      return { ok: false, code: 'stale_preview', messagePl: copy.blocked.stale };
    }

    // Owner 2026-08-11 practical recipe contract. The Preview carries the
    // exact Engine candidate only as audit provenance; Apply independently
    // rebuilds the whole-gram candidate and demands byte-identical input.
    // Removing or forging this proof cannot turn rounding into an authority.
    let exactCandidate = preview.proposedInput;
    let practicalizationRecheckFailure: Extract<CommitPreviewResult, { ok: false }> | null = null;
    if (preview.practicalization?.status === 'blocked') {
      return {
        ok: false,
        code: 'practicalization_invalid',
        reason: preview.practicalization.failure.code,
        messagePl: preview.practicalization.failure.messagePl,
      };
    }
    if (preview.practicalization?.status === 'ready') {
      const audit = preview.practicalization.audit;
      if (
        audit.modelVersion !== PRACTICAL_RECIPE_MODEL_VERSION ||
        !sameVerifiedRecipeContext(current, audit.exactInput)
      ) {
        practicalizationRecheckFailure = {
          ok: false,
          code: 'practicalization_invalid',
          reason: 'model_or_context_mismatch',
          messagePl:
            'Apply zablokowany: kandydat pełnych gramów nie odpowiada bieżącej recepturze.',
        };
      }
      const rederived = practicalizeRecipeCandidate(
        audit.exactInput,
        verifiedNextConstraints,
        flavourHeldLineIds(audit.exactInput),
      );
      if (
        !rederived.ok ||
        JSON.stringify(rederived.audit.executableInput) !== JSON.stringify(preview.proposedInput) ||
        JSON.stringify(rederived.audit.executableInput) !== JSON.stringify(audit.executableInput)
      ) {
        practicalizationRecheckFailure = {
          ok: false,
          code: 'practicalization_invalid',
          reason: rederived.ok ? 'candidate_fingerprint_mismatch' : rederived.code,
          messagePl:
            'Apply zablokowany: nie udało się ponownie potwierdzić tej samej receptury w pełnych gramach.',
        };
      }
      exactCandidate = audit.exactInput;
    }

    // Trustless payload validation: stable line/canonical ids, finite
    // non-negative planned/actual grams and a successful Engine evaluation.
    const invalidLineNames = preview.proposedInput.items
      .filter(
        (item) =>
          typeof item.id !== 'string' ||
          !item.id.trim() ||
          typeof item.ingredient?.id !== 'string' ||
          !item.ingredient.id.trim() ||
          !canonicalIngredientId(item.ingredient).trim() ||
          !Number.isFinite(item.planned_grams) ||
          item.planned_grams < 0 ||
          (item.actual_grams !== null &&
            (!Number.isFinite(item.actual_grams) || item.actual_grams < 0)),
      )
      .map((item) => item.ingredient.name || item.id);
    if (invalidLineNames.length > 0) {
      return {
        ok: false,
        code: 'invalid_lines',
        messagePl: copy.blocked.invalidLines(invalidLineNames),
        lineNames: invalidLineNames,
      };
    }
    // Owner zero-gram executable invariant: an optional line the Engine
    // resolved to 0 g is OMITTED from the executable recipe (practicalization
    // never keeps an explicit 0 g optional row, and the Main frontier works on
    // that executable vector). Such an absence is not a removal. The door
    // accepts it ONLY for a CURRENT line that is an optional unlocked Standard
    // line — no lock, role, physical mass or unavailability tombstone (the
    // anchored-presence gate below still refuses any positively anchored line)
    // — and only on a Preview whose whole-gram projection is rechecked below.
    // Trust-wise this equals the 0 g proposal the door always accepted for
    // exactly these lines; every protected line keeps the identity contract.
    const proposedLineIds = new Set(preview.proposedInput.items.map((item) => item.id));
    const omittedUnusedLineIds = new Set(
      preview.practicalization?.status === 'ready'
        ? current.items
            .filter(
              (item) =>
                !proposedLineIds.has(item.id) &&
                isOmittableUnusedLine(current, currentConstraints, item),
            )
            .map((item) => item.id)
        : [],
    );
    const identityViolations = ingredientIdentityIntegrityViolations(
      current,
      preview,
      authorizedRemovalLineId,
      omittedUnusedLineIds,
    );
    if (identityViolations.length > 0) {
      return {
        ok: false,
        code: 'ingredient_identity_violated',
        messagePl:
          'Apply zablokowany: propozycja zmienia tożsamość lub profil składnika bez zatwierdzonego źródła Mapper/toolbox.',
        lineNames: identityViolations,
      };
    }
    const physicalActualViolations = physicalActualIntegrityViolations(
      current,
      preview.proposedInput,
    );
    if (physicalActualViolations.length > 0) {
      return {
        ok: false,
        code: 'physical_actual_violated',
        messagePl:
          'Apply zablokowany: Preview nie może zmieniać ilości ani tożsamości materiału już znajdującego się w naczyniu.',
        lineNames: physicalActualViolations,
      };
    }
    if (preview.kind === 'substitution' && preview.substitution !== undefined) {
      const currentLine = current.items.find((item) => item.id === preview.substitution?.lineId);
      const proposedLine = preview.proposedInput.items.find(
        (item) => item.id === preview.substitution?.lineId,
      );
      if (
        (currentLine && isTemplateControlledStabilizer(currentLine.ingredient)) ||
        (proposedLine && isTemplateControlledStabilizer(proposedLine.ingredient))
      ) {
        return {
          ok: false,
          code: 'substitution_invalid',
          reasons: ['template_controlled_stabilizer_substitution_unsupported'],
          messagePl:
            'Zamiana stabilizatora jest zablokowana: brak zatwierdzonego przelicznika aktywności i dawki dla tej pary składników.',
        };
      }
    }
    // Preserve the accepted, more-specific runaway-target diagnosis before
    // ingredient-level contract gates inspect the forged composition.
    if (
      (preview.kind === 'optimize' ||
        preview.kind === 'suggested_fix' ||
        preview.kind === 'substitution') &&
      preview.proposedInput.target_batch_grams !== current.target_batch_grams
    ) {
      return {
        ok: false,
        code: 'batch_total_mismatch',
        messagePl: copy.blocked.batchMismatch(
          preview.proposedInput.target_batch_grams,
          current.target_batch_grams,
        ),
        proposedSum: preview.proposedInput.target_batch_grams,
        targetBatch: current.target_batch_grams,
      };
    }
    const earlyPreserved = verifyConstraintsPreserved(
      verifiedNextConstraints,
      preview.proposedInput,
    );
    if (!earlyPreserved.ok) {
      return {
        ok: false,
        code: 'constraints_violated',
        messagePl: copy.blocked.constraintsViolated(
          violatedIngredientNames(preview, earlyPreserved.violations),
        ),
        violations: earlyPreserved.violations,
      };
    }
    const earlyHasActuals = preview.proposedInput.items.some((item) => item.actual_grams !== null);
    if (!earlyHasActuals) {
      const proposedSum = plannedSum(preview.proposedInput);
      const targetBatch = preview.proposedInput.target_batch_grams;
      if (Math.abs(proposedSum - targetBatch) > BATCH_SUM_TOLERANCE_G) {
        return {
          ok: false,
          code: 'batch_total_mismatch',
          messagePl: copy.blocked.batchMismatch(proposedSum, targetBatch),
          proposedSum,
          targetBatch,
        };
      }
    }
    const stabilizerFixedLineIds = new Set(
      current.items
        .filter(
          (item) =>
            currentConstraints.byLineId[item.id]?.mode !== 'percent' &&
            !(currentConstraints.byLineId[item.id] === undefined && item.lock_type === 'percent') &&
            (item.lock_type !== 'unlocked' || isConstrained(currentConstraints, item.id)),
        )
        .map((item) => item.id),
    );
    const formulationSeed = (() => {
      if (preview.kind !== 'optimize' || preview.formulation === undefined) return undefined;
      const template = findFormulationTemplateById(preview.formulation.templateId);
      if (template?.status !== 'approved') return undefined;
      const routedTemplate = selectFormulationTemplateForRecipe(current).template;
      if (routedTemplate?.templateId !== template.templateId) return undefined;
      const stabilizerRole = template.roles.find((role) => role.role === 'stabilizer');
      if (!stabilizerRole || !(template.baseBatchG > 0)) return undefined;
      const approvedSeedIngredients = stabilizerRole.toolboxId
        ? approvedFormulationToolboxIngredients(stabilizerRole.toolboxId)
        : [];
      const currentStabilizerLineIds = current.items
        .filter(
          (item) =>
            isTemplateControlledStabilizer(item.ingredient) &&
            approvedSeedIngredients.some(
              (approved) =>
                canonicalIngredientId(approved) === canonicalIngredientId(item.ingredient),
            ),
        )
        .map((item) => item.id);
      const approvedAddedLineIds = exactCandidate.items
        .filter((item) => {
          if (!isTemplateControlledStabilizer(item.ingredient)) return false;
          if (current.items.some((existing) => existing.id === item.id)) return false;
          if (!stabilizerRole.toolboxId) return false;
          return approvedSeedIngredients.some(
            (approved) =>
              canonicalIngredientId(approved) === canonicalIngredientId(item.ingredient) &&
              (substitutionIngredientFingerprint(approved) ===
                substitutionIngredientFingerprint(item.ingredient) ||
                substitutionIngredientFingerprint(normalizeIngredientIdentity(approved)) ===
                  substitutionIngredientFingerprint(item.ingredient)),
          );
        })
        .map((item) => item.id);
      return {
        totalGrams:
          exactCandidate.category === 'sorbet'
            ? sorbetStabilizerWholeGramBand(exactCandidate.target_batch_grams).preferredGrams
            : stabilizerRole.grams * (exactCandidate.target_batch_grams / template.baseBatchG),
        allowedLineIds: new Set([...currentStabilizerLineIds, ...approvedAddedLineIds]),
      };
    })();
    const stabilizerViolations = templateControlledStabilizerViolations(
      current,
      exactCandidate,
      preview.kind === 'batch_rescale' && current.target_batch_grams > 0
        ? {
            proportionalBatchRatio: exactCandidate.target_batch_grams / current.target_batch_grams,
            fixedLineIds: stabilizerFixedLineIds,
          }
        : { approvedFormulationSeed: formulationSeed },
    );
    if (stabilizerViolations.length > 0) {
      const violations: ConstraintPreservationViolation[] = stabilizerViolations.map(
        (violation) => ({
          lineId: violation.lineId,
          code: violation.code === 'line_missing' ? 'line_missing' : 'locked_grams_changed',
        }),
      );
      return {
        ok: false,
        code: 'constraints_violated',
        messagePl: copy.blocked.constraintsViolated(
          stabilizerViolations.map((violation) => violation.ingredientName),
        ),
        violations,
      };
    }
    const practicalStabilizerViolations: ConstraintPreservationViolation[] = [];
    const proposedByLineIdForPractical = new Map(
      preview.proposedInput.items.map((item) => [item.id, item]),
    );
    for (const exactLine of exactCandidate.items.filter(
      (item) =>
        isTemplateControlledStabilizer(item.ingredient) && Math.round(item.planned_grams) > 0,
    )) {
      const practicalLine = proposedByLineIdForPractical.get(exactLine.id);
      if (
        !practicalLine ||
        canonicalIngredientId(practicalLine.ingredient) !==
          canonicalIngredientId(exactLine.ingredient) ||
        !Object.is(practicalLine.planned_grams, Math.round(exactLine.planned_grams))
      ) {
        practicalStabilizerViolations.push({
          lineId: exactLine.id,
          code: practicalLine ? 'locked_grams_changed' : 'line_missing',
        });
      }
    }
    if (practicalStabilizerViolations.length > 0) {
      return {
        ok: false,
        code: 'constraints_violated',
        messagePl: copy.blocked.constraintsViolated(
          practicalStabilizerViolations.map(
            (violation) =>
              exactCandidate.items.find((item) => item.id === violation.lineId)?.ingredient.name ??
              violation.lineId,
          ),
        ),
        violations: practicalStabilizerViolations,
      };
    }
    const practicalRequiredViolations: ConstraintPreservationViolation[] = [];
    for (const exactLine of exactCandidate.items.filter((item) => item.lock_type === 'required')) {
      const practicalLine = proposedByLineIdForPractical.get(exactLine.id);
      if (
        !practicalLine ||
        practicalLine.lock_type !== 'required' ||
        canonicalIngredientId(practicalLine.ingredient) !==
          canonicalIngredientId(exactLine.ingredient) ||
        !Object.is(practicalLine.planned_grams, exactLine.planned_grams)
      ) {
        practicalRequiredViolations.push({
          lineId: exactLine.id,
          code: practicalLine ? 'locked_grams_changed' : 'line_missing',
        });
      }
    }
    if (practicalRequiredViolations.length > 0) {
      return {
        ok: false,
        code: 'constraints_violated',
        messagePl: copy.blocked.constraintsViolated(
          practicalRequiredViolations.map(
            (violation) =>
              exactCandidate.items.find((item) => item.id === violation.lineId)?.ingredient.name ??
              violation.lineId,
          ),
        ),
        violations: practicalRequiredViolations,
      };
    }
    try {
      const result = calculateRecipe(preview.proposedInput);
      if (!Number.isFinite(result.total_batch_g)) throw new Error('non_finite_engine_total');
      const direction = assessRecipeDirection(preview.proposedInput, result);
      if (direction.active && direction.supportedAxisCount > 0 && !direction.reached) {
        const consentValid =
          directionConsent?.baseFingerprint === preview.baseFingerprint &&
          directionConsent.targetFingerprint === directionTargetFingerprint(current) &&
          directionConsent.candidateFingerprint ===
            workingStateFingerprint(preview.proposedInput, verifiedNextConstraints);
        if (!consentValid) {
          return {
            ok: false,
            code: 'direction_consent_required',
            messagePl:
              'Apply zablokowany: najbliższy bezpieczny profil wymaga jawnego potwierdzenia użytkownika.',
          };
        }
      }
    } catch {
      const lineNames = preview.proposedInput.items.map((item) => item.ingredient.name);
      return {
        ok: false,
        code: 'invalid_lines',
        messagePl: copy.blocked.invalidLines(lineNames),
        lineNames,
      };
    }

    if (preview.proposedInput.category === 'vegan_gelato') {
      const veganIssues = veganRecipeEligibilityIssues(preview.proposedInput.items);
      if (veganIssues.length > 0) {
        return {
          ok: false,
          code: 'vegan_ingredients_invalid',
          messagePl:
            'Apply zablokowany: receptura Wegańska zawiera składniki bez potwierdzonej zgodności Vegan: ' +
            veganIssues.map((issue) => `${issue.ingredientName} [${issue.status}]`).join(', '),
          issues: veganIssues,
        };
      }
      const profileIssues = veganProfileConstraintIssues(preview.proposedInput);
      if (profileIssues.length > 0) {
        return {
          ok: false,
          code: 'vegan_profile_constraint_invalid',
          messagePl: `Apply zablokowany: ${veganProfileConstraintMessagePl(profileIssues)}`,
          issues: profileIssues,
        };
      }
    }

    const excludedCanonicalIds = new Set(
      excludedIngredientIds.map(canonicalIngredientIdFromSourceId),
    );
    const excludedNames = preview.proposedInput.items
      .filter((item) => excludedCanonicalIds.has(canonicalIngredientId(item.ingredient)))
      .map((item) => item.ingredient.name);
    if (excludedNames.length > 0) {
      return {
        ok: false,
        code: 'excluded_ingredients',
        messagePl: copy.blocked.excludedIngredients(excludedNames),
        ingredientNames: excludedNames,
      };
    }

    // Engine-native `required` is a hard line contract. Normal solver paths
    // already keep every non-unlocked line; the Apply door repeats that truth
    // from the current draft so a forged payload cannot remove, rename or
    // change a Required line behind the UI.
    const requiredViolations: ConstraintPreservationViolation[] = [];
    const positivePresenceViolations: ConstraintPreservationViolation[] = [];
    for (const anchored of current.items.filter(
      (item) =>
        item.lock_type === 'unlocked' &&
        (item.user_intent_anchor_grams ?? 0) > 0 &&
        item.planned_grams > 0,
    )) {
      if (anchored.id === authorizedRemovalLineId) continue;
      // An exact substitution intentionally changes the canonical identity of
      // this one positive Standard line. Its dedicated Mapper authorization,
      // ProductBehavior snapshot and candidate fingerprint are verified below;
      // treating it as an unapproved removal here would mask that trust gate.
      if (preview.kind === 'substitution' && anchored.id === preview.substitution?.lineId) {
        continue;
      }
      const proposed = preview.proposedInput.items.find((item) => item.id === anchored.id);
      if (
        !proposed ||
        canonicalIngredientId(proposed.ingredient) !== canonicalIngredientId(anchored.ingredient) ||
        proposed.planned_grams < 1
      ) {
        positivePresenceViolations.push({
          lineId: anchored.id,
          code: proposed ? 'locked_grams_changed' : 'line_missing',
        });
      }
    }
    if (positivePresenceViolations.length > 0) {
      const names = positivePresenceViolations.map(
        (violation) =>
          current.items.find((item) => item.id === violation.lineId)?.ingredient.name ??
          violation.lineId,
      );
      return {
        ok: false,
        code: 'constraints_violated',
        messagePl:
          'Apply zablokowany: dodatni składnik Standard nie może zostać usunięty bez jawnej zgody: ' +
          names.join(', '),
        violations: positivePresenceViolations,
      };
    }
    for (const required of current.items.filter((item) => item.lock_type === 'required')) {
      const proposed = preview.proposedInput.items.find((item) => item.id === required.id);
      if (!proposed) {
        requiredViolations.push({ lineId: required.id, code: 'line_missing' });
        continue;
      }
      if (
        canonicalIngredientId(proposed.ingredient) !== canonicalIngredientId(required.ingredient) ||
        !Object.is(proposed.planned_grams, required.planned_grams) ||
        proposed.lock_type !== 'required'
      ) {
        requiredViolations.push({ lineId: required.id, code: 'locked_grams_changed' });
      }
    }
    if (requiredViolations.length > 0) {
      return {
        ok: false,
        code: 'constraints_violated',
        messagePl: copy.blocked.constraintsViolated(
          requiredViolations.map(
            (violation) =>
              current.items.find((item) => item.id === violation.lineId)?.ingredient.name ??
              violation.lineId,
          ),
        ),
        violations: requiredViolations,
      };
    }

    // MULTI-MAIN IDENTITY GATE — intentionally BEFORE batch/integrity scoring:
    // a mathematically neat batch is irrelevant if it is a different flavour.
    // Re-derived from the current input and the actual payload; no preview flag
    // is trusted and every Preview/Apply route passes through this door.
    const substitution = preview.substitution;
    let verifiedProductBehaviorSnapshots: Record<string, ProductBehaviorSnapshot> =
      Object.fromEntries(
        Object.entries(currentProductBehaviorSnapshots)
          .filter((entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined)
          .map(([lineId, snapshot]) => [lineId, structuredClone(snapshot)]),
      );
    if (proposalAuthorization) {
      const proposalAuthorized =
        proposalAuthorization.baseFingerprint === preview.baseFingerprint &&
        proposalAuthorization.proposedFingerprint ===
          workingStateFingerprint(preview.proposedInput, preview.nextConstraints) &&
        proposalAuthorization.baseProductBehaviorFingerprint ===
          productBehaviorSnapshotFingerprint(currentProductBehaviorSnapshots) &&
        proposalAuthorization.proposedProductBehaviorFingerprint ===
          productBehaviorSnapshotFingerprint(proposalAuthorization.snapshots) &&
        preview.productBehaviorFingerprint ===
          proposalAuthorization.proposedProductBehaviorFingerprint;
      if (!proposalAuthorized) {
        return { ok: false, code: 'stale_preview', messagePl: copy.blocked.stale };
      }
      verifiedProductBehaviorSnapshots = structuredClone(proposalAuthorization.snapshots);
    }
    let mainIdentityBase = current;
    if (preview.kind === 'substitution') {
      const currentLine = substitution
        ? current.items.find((item) => item.id === substitution.lineId)
        : undefined;
      const proposedLine = substitution
        ? preview.proposedInput.items.find((item) => item.id === substitution.lineId)
        : undefined;
      const proofValid =
        substitution !== undefined &&
        currentLine !== undefined &&
        proposedLine !== undefined &&
        canonicalIngredientId(currentLine.ingredient) === substitution.fromCanonicalId &&
        canonicalIngredientId(proposedLine.ingredient) === substitution.toCanonicalId &&
        substitution.fromCanonicalId !== substitution.toCanonicalId &&
        isVerifiedRuntimeSubstitute(proposedLine.ingredient) &&
        resolveFunctionalRole(currentLine.ingredient) ===
          resolveFunctionalRole(proposedLine.ingredient) &&
        substitution.changesMainIdentity === (currentLine.lock_type === 'main') &&
        substitution.candidateFingerprint ===
          substitutionIngredientFingerprint(proposedLine.ingredient);
      const authorizationValid =
        proofValid &&
        substitutionAuthorization?.baseFingerprint === preview.baseFingerprint &&
        hasVerifiedMapperSubstitutionAuthorization(substitutionAuthorization.mapperAuthorization) &&
        substitutionAuthorization.lineId === substitution.lineId &&
        substitutionAuthorization.fromCanonicalId === substitution.fromCanonicalId &&
        substitutionAuthorization.toCanonicalId === substitution.toCanonicalId &&
        substitutionAuthorization.mapperAuthorization.canonicalId === substitution.toCanonicalId &&
        substitutionAuthorization.mapperAuthorization.ingredientFingerprint ===
          substitution.candidateFingerprint &&
        substitutionAuthorization.mapperAuthorization.mapperRowFingerprint ===
          substitution.mapperRowFingerprint &&
        substitutionAuthorization.mapperAuthorization.allergensFingerprint ===
          substitution.allergensFingerprint &&
        substitutionAuthorization.mapperAuthorization.veganEligibility ===
          substitution.veganEligibility &&
        substitutionAuthorization.productBehaviorSnapshot.lineId === substitution.lineId &&
        substitutionAuthorization.productBehaviorSnapshot.processScope === 'BASE_FORMULATION' &&
        substitutionAuthorization.productBehaviorSnapshot.mapperIngredientId ===
          substitution.toCanonicalId &&
        substitutionAuthorization.productBehaviorSnapshot.moduleEligibility.SUBSTITUTION ===
          'eligible' &&
        substitutionAuthorization.productBehaviorSnapshot.moduleEligibility.BASE_RECIPE ===
          'eligible';
      if (!authorizationValid) {
        return {
          ok: false,
          code: 'main_identity_violated',
          messagePl:
            'Apply zablokowany: zamiennik nie ma aktualnego potwierdzenia z katalogu Mapper.',
          violations: [],
        };
      }
      verifiedProductBehaviorSnapshots = {
        ...verifiedProductBehaviorSnapshots,
        ...structuredClone(substitutionAuthorization.proposalProductBehaviorSnapshots),
        [substitution.lineId]: structuredClone(substitutionAuthorization.productBehaviorSnapshot),
      };
      if (substitution.changesMainIdentity) {
        const consentValid =
          substitutionConsent?.baseFingerprint === preview.baseFingerprint &&
          substitutionConsent.lineId === substitution.lineId &&
          substitutionConsent.fromCanonicalId === substitution.fromCanonicalId &&
          substitutionConsent.toCanonicalId === substitution.toCanonicalId;
        if (!consentValid) {
          return {
            ok: false,
            code: 'main_identity_violated',
            messagePl:
              'Apply zablokowany: zamiana składnika Głównego wymaga jawnego potwierdzenia zmiany smaku.',
            violations: [],
          };
        }
        mainIdentityBase = {
          ...current,
          items: current.items.map((item) =>
            item.id === substitution.lineId
              ? { ...item, ingredient: proposedLine.ingredient }
              : item,
          ),
        };
      }
    } else if (substitution !== undefined) {
      return { ok: false, code: 'stale_preview', messagePl: copy.blocked.stale };
    }
    if (
      preview.productBehaviorFingerprint !== undefined &&
      productBehaviorSnapshotFingerprint(verifiedProductBehaviorSnapshots) !==
        preview.productBehaviorFingerprint
    ) {
      return { ok: false, code: 'stale_preview', messagePl: copy.blocked.stale };
    }
    const mainIdentity = verifyMainIngredientIdentity(
      mainIdentityBase,
      preview.proposedInput,
      currentConstraints.byLineId,
    );
    if (!mainIdentity.ok) {
      return {
        ok: false,
        code: 'main_identity_violated',
        messagePl: mainIdentityViolationMessage(mainIdentity),
        violations: mainIdentity.violations,
      };
    }
    const managedProductBehavior = Object.keys(verifiedProductBehaviorSnapshots).length > 0;
    if (managedProductBehavior) {
      const authority = evaluateRecipeConstraintAuthority({
        recipe: preview.proposedInput,
        snapshots: verifiedProductBehaviorSnapshots,
        module:
          normalizeFormulationStrategy(current.goals?.formulation_strategy ?? current.mode) ===
          'eco'
            ? 'ECO'
            : 'OPTIMAL',
        technicalOnlyMainLineIds,
      });
      const identityViolation = productBehaviorIdentityViolation(
        preview.proposedInput,
        verifiedProductBehaviorSnapshots,
      );
      if (identityViolation) {
        return {
          ok: false,
          code: 'product_behavior_invalid',
          violations: [identityViolation],
          messagePl: identityViolation.messagePl,
        };
      }
      const terminalIssues = authority.issues.filter(
        (issue) =>
          issue.source === 'main' ||
          issue.source === 'product_behavior' ||
          issue.source === 'profile' ||
          issue.source === 'owner_policy',
      );
      if (terminalIssues.length > 0) {
        const violations: MainEnvelopeViolation[] = terminalIssues.map((issue) => ({
          code: issue.source === 'main' ? issue.code : 'product_behavior_missing',
          lineIds: issue.lineIds,
          messagePl: issue.messagePl,
        }));
        return {
          ok: false,
          code: 'product_behavior_invalid',
          violations,
          messagePl:
            violations[0]?.messagePl ??
            'Apply zablokowany: receptura nie spełnia pełnej weryfikacji profilu.',
        };
      }
    }
    const currentMainGrams = mainGroupTotal(mainIdentityBase, mainIdentityBase);
    const exactMainGrams = mainGroupTotal(mainIdentityBase, exactCandidate);
    const executableMainGrams = mainGroupTotal(mainIdentityBase, preview.proposedInput);
    const adjustableMainIntent = hasAdjustablePositiveMainIntent(
      mainIdentityBase,
      currentConstraints,
    );
    // Sorbet exact five-step Direction (served QA 2026-08-22): the closed-form
    // projection moves only the canonical adjustable roles and keeps every Main
    // line byte-exact, so there is no Main frontier to certify — the Main
    // maximisation frontier treats an unreached exact Direction target as a
    // hard gate and could never issue a proof for an honest nearest-achievable
    // Preview. The door instead requires the byte-exact Main group AND a
    // deterministic reproduction of the same exact candidate from the trusted
    // current draft. Any other optimize Preview keeps the full proof contract.
    const mainHeldByExactDirection =
      preview.kind === 'optimize' &&
      preview.mainHeldByExactDirection === true &&
      mainGroupLinesByteIdentical(mainIdentityBase, preview.proposedInput);
    const requiresMainProof =
      preview.kind === 'optimize' && adjustableMainIntent && !mainHeldByExactDirection;
    if (mainHeldByExactDirection && adjustableMainIntent) {
      const rebuilt = buildOptimizePreview(current, currentConstraints, preview.createdAt, {
        ...rebuildOptions,
        excludedIngredientIds,
        // Reproduce the same generation boundary as Preview: the CURRENT
        // recipe authority shapes candidate search; the separately verified
        // proposal authority authorizes the complete resulting vector. Feeding
        // proposal snapshots back into generation can choose a different
        // support vector and falsely reject an otherwise byte-identical proof.
        productBehaviorSnapshots: currentProductBehaviorSnapshots,
        technicalOnlyMainLineIds,
      });
      const rebuiltMatches =
        rebuilt.ok &&
        rebuilt.preview.mainHeldByExactDirection === true &&
        workingStateFingerprint(rebuilt.preview.proposedInput, rebuilt.preview.nextConstraints) ===
          workingStateFingerprint(preview.proposedInput, preview.nextConstraints);
      if (!rebuiltMatches) {
        return {
          ok: false,
          code: 'main_identity_violated',
          messagePl:
            'Apply zablokowany: propozycja nie odtwarza dokładnie zweryfikowanego poziomu składnika Głównego.',
          violations: [],
        };
      }
    }
    if (requiresMainProof) {
      const proof = preview.mainObjective;
      const exactScore = recipeFitForInput(exactCandidate, calculateRecipe(exactCandidate)).score;
      const exactMaximumProof =
        proof?.status === 'maximized' &&
        proof.provenMaximum === true &&
        proof.proofKind === 'linear_relaxation' &&
        Number.isInteger(proof.certifiedUpperBoundGrams) &&
        (proof.certifiedUpperBoundGrams ?? 0) >= proof.executableMainGrams &&
        Number.isInteger(proof.searchUpperBoundGrams) &&
        (proof.searchUpperBoundGrams ?? 0) >= proof.executableMainGrams &&
        proof.testedHigherCandidateCount ===
          (proof.searchUpperBoundGrams ?? proof.executableMainGrams) - proof.executableMainGrams &&
        Math.abs(proof.startingMainGrams - currentMainGrams) <= MAIN_OBJECTIVE_EPSILON_G &&
        Math.abs(proof.exactAcceptedMainGrams - exactMainGrams) <= MAIN_OBJECTIVE_EPSILON_G &&
        Math.abs(proof.executableMainGrams - executableMainGrams) <= MAIN_OBJECTIVE_EPSILON_G &&
        proof.technicalScore === exactScore &&
        proof.firstHigherRejectedGrams === proof.executableMainGrams + 1 &&
        proof.firstHigherRejectedReason !== null &&
        (proof.limitingTechnicalRules?.length ?? 0) > 0;
      const boundedBestProof =
        (proof?.status === 'best_achievable' || proof?.status === 'no_admissible_increase') &&
        proof.provenMaximum === false &&
        (proof.proofKind === 'linear_relaxation' || proof.proofKind === 'heuristic_search') &&
        Number.isInteger(proof.searchUpperBoundGrams) &&
        (proof.searchUpperBoundGrams ?? 0) >= proof.executableMainGrams &&
        typeof proof.testedHigherCandidateCount === 'number' &&
        Number.isInteger(proof.testedHigherCandidateCount) &&
        proof.testedHigherCandidateCount >= 0 &&
        proof.testedHigherCandidateCount <=
          (proof.searchUpperBoundGrams ?? proof.executableMainGrams) - proof.executableMainGrams &&
        Math.abs(proof.startingMainGrams - currentMainGrams) <= MAIN_OBJECTIVE_EPSILON_G &&
        Math.abs(proof.exactAcceptedMainGrams - exactMainGrams) <= MAIN_OBJECTIVE_EPSILON_G &&
        Math.abs(proof.executableMainGrams - executableMainGrams) <= MAIN_OBJECTIVE_EPSILON_G &&
        proof.technicalScore === exactScore &&
        (proof.limitingTechnicalRules?.length ?? 0) > 0;
      const proofValid = exactMaximumProof || boundedBestProof;
      if (!proofValid) {
        return {
          ok: false,
          code: 'main_identity_violated',
          messagePl:
            'Apply zablokowany: nie udało się ponownie potwierdzić dowodu maksymalizacji lub ograniczonego wyniku BEST składnika Głównego.',
          violations: [],
        };
      }
      // A self-consistent proof is not enough: rebuild the deterministic Main
      // frontier from the current trusted draft. This closes forged or stale
      // exact proofs and also prevents an honest BEST_ACHIEVABLE preview from
      // being replaced by a different, attacker-selected lower-bound vector.
      const rebuilt = authorizedRemovalLineId
        ? buildExplicitStandardRemovalPreview(
            current,
            currentConstraints,
            authorizedRemovalLineId,
            preview.createdAt,
            {
              ...rebuildOptions,
              excludedIngredientIds,
              productBehaviorSnapshots: currentProductBehaviorSnapshots,
              technicalOnlyMainLineIds,
            },
          )
        : buildOptimizePreview(current, currentConstraints, preview.createdAt, {
            ...rebuildOptions,
            excludedIngredientIds,
            productBehaviorSnapshots: currentProductBehaviorSnapshots,
            technicalOnlyMainLineIds,
          });
      const rebuiltProof = rebuilt.ok ? rebuilt.preview.mainObjective : undefined;
      const recomputedExecutableMainGrams = rebuilt.ok
        ? mainGroupTotal(mainIdentityBase, rebuilt.preview.proposedInput)
        : currentMainGrams;
      const rebuiltMatches =
        rebuilt.ok &&
        rebuiltProof?.status === proof?.status &&
        rebuiltProof.provenMaximum === proof?.provenMaximum &&
        rebuiltProof.proofKind === proof?.proofKind &&
        rebuiltProof.certifiedUpperBoundGrams === proof?.certifiedUpperBoundGrams &&
        Math.abs(recomputedExecutableMainGrams - executableMainGrams) <= MAIN_OBJECTIVE_EPSILON_G &&
        rebuiltProof.searchUpperBoundGrams === proof?.searchUpperBoundGrams &&
        rebuiltProof.testedHigherCandidateCount === proof?.testedHigherCandidateCount &&
        rebuiltProof.firstHigherRejectedGrams === proof?.firstHigherRejectedGrams &&
        rebuiltProof.firstHigherRejectedReason === proof?.firstHigherRejectedReason &&
        JSON.stringify(rebuiltProof.limitingTechnicalRules ?? []) ===
          JSON.stringify(proof?.limitingTechnicalRules ?? []) &&
        workingStateFingerprint(rebuilt.preview.proposedInput, rebuilt.preview.nextConstraints) ===
          workingStateFingerprint(preview.proposedInput, preview.nextConstraints);
      if (!rebuiltMatches) {
        return {
          ok: false,
          code: 'main_identity_violated',
          messagePl:
            'Apply zablokowany: propozycja nie odtwarza dokładnie zweryfikowanego poziomu składnika Głównego.',
          violations: [],
        };
      }
    }
    if (
      normalizeFormulationStrategy(current.goals?.formulation_strategy ?? current.mode) === 'eco'
    ) {
      const flavour = verifyEcoFlavourProtection(current, preview.proposedInput, {
        productBehaviorSnapshots: verifiedProductBehaviorSnapshots,
      });
      if (!flavour.ok) {
        return {
          ok: false,
          code: 'eco_flavour_floor_violated',
          messagePl:
            'Apply zablokowany: propozycja ECO narusza tożsamość składnika smakowego lub proporcję grupy Głównej.',
          violations: flavour.violations,
        };
      }
    }

    if (preview.formulation?.roleTrace.some((row) => row.hard && row.outcome === 'missing_hard')) {
      return {
        ok: false,
        code: 'invalid_lines',
        messagePl: copy.blocked.invalidLines(['required_role']),
        lineNames: ['required_role'],
      };
    }

    // Owner P0 Phase 6 — DUPLICATE INVARIANT: applying must be structurally
    // impossible when the proposal would introduce a new plannable duplicate
    // of any canonical ingredient identity (or a duplicate line id).
    // Batch equality is the first proposal-integrity verdict. The exact owner
    // payload (1193.7 g vs 1000 g) therefore returns the required
    // `batch_total_mismatch` even when the malformed payload also duplicates
    // a canonical Milk line.
    const earlyProposedHasActuals = preview.proposedInput.items.some(
      (item) => item.actual_grams !== null,
    );
    if (!earlyProposedHasActuals) {
      const proposedSum = plannedSum(preview.proposedInput);
      const targetBatch = preview.proposedInput.target_batch_grams;
      if (Math.abs(proposedSum - targetBatch) > BATCH_SUM_TOLERANCE_G) {
        return {
          ok: false,
          code: 'batch_total_mismatch',
          messagePl: copy.blocked.batchMismatch(proposedSum, targetBatch),
          proposedSum,
          targetBatch,
        };
      }
    }

    const lineIds = new Set<string>();
    let duplicateLineId = false;
    for (const item of preview.proposedInput.items) {
      if (lineIds.has(item.id)) {
        duplicateLineId = true;
        break;
      }
      lineIds.add(item.id);
    }
    const canonicalDuplicates = findCanonicalDuplicateIngredients(preview.proposedInput);
    if (duplicateLineId || canonicalDuplicates.length > 0) {
      return {
        ok: false,
        code: 'duplicate_lines',
        messagePl: copy.blocked.duplicates(canonicalDuplicates),
        ingredientNames: canonicalDuplicates,
      };
    }

    // Owner P0 (scale safety): a batch-rescale preview whose target is not a
    // finite positive number (the 944.6 g → 0 g corruption) is unappliable.
    if (
      preview.kind === 'batch_rescale' &&
      (!Number.isFinite(preview.proposedInput.target_batch_grams) ||
        preview.proposedInput.target_batch_grams <= 0)
    ) {
      return {
        ok: false,
        code: 'batch_total_mismatch',
        messagePl: copy.blocked.batchMismatch(
          preview.proposedInput.target_batch_grams,
          current.target_batch_grams,
        ),
        proposedSum: preview.proposedInput.target_batch_grams,
        targetBatch: current.target_batch_grams,
      };
    }

    // Owner P0 Phase 10 — RUNAWAY GUARD (optimize/formulation AND suggested-fix
    // — Agent 1 §5.3; the explicit „Przeskaluj partię" action legitimately
    // changes the target): the proposed TARGET batch must be the CURRENT target
    // batch — a stale/multiplied target (the 111,000 g class of failure) is
    // structurally unappliable.
    const batchGatedKind =
      preview.kind === 'optimize' ||
      preview.kind === 'suggested_fix' ||
      preview.kind === 'substitution';
    if (batchGatedKind && preview.proposedInput.target_batch_grams !== current.target_batch_grams) {
      return {
        ok: false,
        code: 'batch_total_mismatch',
        messagePl: copy.blocked.batchMismatch(
          preview.proposedInput.target_batch_grams,
          current.target_batch_grams,
        ),
        proposedSum: preview.proposedInput.target_batch_grams,
        targetBatch: current.target_batch_grams,
      };
    }

    // Owner P0 Phase 5 — BATCH INVARIANT (planned recipes, optimize path AND
    // suggested-fix — Agent 1 §5.3: the §18.2 fallback previously bypassed it):
    // a 1000 g recipe stays 1000 g; a 2937.9 g result can never be applied.
    // The batch rejection is the more specific message, so it runs first.
    const proposedHasActuals = preview.proposedInput.items.some(
      (item) => item.actual_grams !== null,
    );
    if (!proposedHasActuals) {
      const proposedSum = plannedSum(preview.proposedInput);
      const targetBatch = preview.proposedInput.target_batch_grams;
      if (Math.abs(proposedSum - targetBatch) > BATCH_SUM_TOLERANCE_G) {
        return {
          ok: false,
          code: 'batch_total_mismatch',
          messagePl: copy.blocked.batchMismatch(proposedSum, targetBatch),
          proposedSum,
          targetBatch,
        };
      }
    }

    // Owner Agent 3 — AUTHENTICITY PROOF CONSISTENCY (closes the constrained
    // exemption that masked zero-move projections): a formulation preview must
    // carry its proof and iteration diagnostics, an `engine_improved` verdict
    // must be backed by ≥1 really-applied round, and `all_bands_in_range` is
    // re-verified trustlessly on the actual proposed input. A projection can
    // therefore only ever apply as the EXPLICIT `no_feasible_improvement`
    // best-effort state — never disguised as an optimized formulation.
    if (preview.kind === 'optimize' && preview.formulation !== undefined) {
      const proof = preview.formulation.proof;
      const iteration = preview.iteration;
      const proofBroken =
        proof === undefined ||
        iteration === undefined ||
        (proof.verdict === 'engine_improved' && iteration.rounds.length <= 1) ||
        (proof.verdict === 'all_bands_in_range' &&
          detectViolations(calculateRecipe(preview.proposedInput)).length > 0);
      if (proofBroken) {
        return {
          ok: false,
          code: 'unsafe_proposal',
          messagePl: copy.blocked.unsafeProposal,
          violationsBefore: detectViolations(calculateRecipe(current)).length,
          violationsAfter: detectViolations(calculateRecipe(preview.proposedInput)).length,
        };
      }
    }

    // OWNER FINAL INTEGRATION ADDENDUM item 2 (2026-07-25) — REFERENCE-DERIVED
    // PROVENANCE GATE. A preview whose formulation seed is not an APPROVED
    // template can never commit: reference data may be diagnostic, test-only or
    // an internal search seed, but a reference-derived formula may NEVER be
    // accepted as applicable merely because the search stopped or the batch
    // equals the target. TRUSTLESS: the status is re-read from the registry by
    // the template id the proposal carries — `preview.formulation.templateStatus`
    // is never consulted, and an id that exists in NO registry is not approved
    // either. (After addendum item 1 this is unreachable at runtime by TWO
    // independent structural facts; the door is the last one.)
    if (preview.kind === 'optimize' && preview.formulation !== undefined) {
      const templateId = preview.formulation.templateId;
      const routedTemplateId = selectFormulationTemplateForRecipe(current).template?.templateId;
      if (!isApprovedTemplateId(templateId) || routedTemplateId !== templateId) {
        return {
          ok: false,
          code: 'reference_derived_provenance',
          messagePl: copy.blocked.referenceDerivedProvenance(templateId),
          templateId,
        };
      }
    }

    // ACCEPTANCE ADDENDUM (1) — ITERATION-CAP GATE: a solver/formulation
    // preview whose iteration diagnostics show the deterministic cap fired is
    // NEVER applicable — `iteration_cap` can never be labelled best-achievable
    // proof. (Formulation previews without iteration diagnostics are already
    // rejected by the proof-consistency gate above.)
    if (
      preview.kind === 'optimize' &&
      (preview.iteration?.capped === true || preview.iteration?.stopReason === 'iteration_cap')
    ) {
      return {
        ok: false,
        code: 'iteration_cap_diagnostic',
        messagePl: copy.blocked.iterationCapDiagnostic,
      };
    }

    // ACCEPTANCE ADDENDUM (3) — HARD-RESIDUAL GATE, recomputed TRUSTLESSLY
    // from the proposed input (never from preview-carried flags): residual
    // violations classified HARD by native/approved band provenance
    // (`classifyViolationBands`) make the preview DIAGNOSTIC ONLY — Apply is
    // structurally disabled with the exact metric list. Soft/provisional
    // residuals stay applicable with explanation (frozen semantics). This
    // SUPERSEDES the earlier accept-with-explanation freeze for hard-native
    // residuals (owner addendum, 2026-07-24).
    if (preview.kind === 'optimize' || preview.kind === 'substitution') {
      const doorBands = classifyViolationBands(preview.proposedInput);
      if (doorBands.hardMetrics.length > 0) {
        return {
          ok: false,
          code: 'hard_residual_violations',
          messagePl: copy.blocked.hardResiduals(doorBands.hardMetrics),
          hardMetrics: doorBands.hardMetrics,
        };
      }
    }

    // Native hard-residual diagnostics remain more authoritative than a
    // derived whole-gram fingerprint mismatch. Both fail closed; this order
    // preserves the accepted operator-facing reason.
    if (practicalizationRecheckFailure !== null) return practicalizationRecheckFailure;

    if (
      (preview.kind === 'optimize' || preview.kind === 'substitution') &&
      current.category === 'protein_gelato'
    ) {
      // Protein v2 Apply door: there is no user-selected target to preserve.
      // The candidate must remain a Protein product — natively hard-safe AND
      // still earning the HIGH PROTEIN claim.
      const proposedTarget = assessProteinFormulation(preview.proposedInput);
      const profilePreserved = preview.proposedInput.category === 'protein_gelato';
      if (
        !profilePreserved ||
        !proposedTarget.hardSafe ||
        !proposedTarget.qualification.qualified
      ) {
        return {
          ok: false,
          code: 'unsafe_proposal',
          messagePl:
            'Apply zablokowany: kandydat Protein nie spełnia deklaracji „wysoka zawartość białka” w natywnie bezpiecznej recepturze.',
          violationsBefore: detectViolations(calculateRecipe(current)).length,
          violationsAfter: detectViolations(calculateRecipe(preview.proposedInput)).length,
        };
      }
    }

    // Owner P0 (definitive fail) — IMPROVEMENT INVARIANT, recomputed TRUSTLESSLY
    // from the actual inputs (never from preview-carried numbers): an optimize
    // proposal that leaves the recipe out of band without reducing the violation
    // count OR the engine's weighted severity (the 8 × 125 g case: 9 → 9,
    // severity unchanged) is structurally unappliable, whatever produced it.
    if (preview.kind === 'optimize') {
      // Beat-the-null check: the 8 × 125 g class of proposal IS the null
      // hypothesis for its draft and can never pass; a genuinely improved
      // formulation/correction always does (or the recipe is fully in range).
      // Owner P0 (constrained reformulation): when the CURRENT constraint set
      // carries explicit hard constraints (recomputed here, never read from the
      // preview), the constrained optimum may legitimately equal the null — the
      // gates above (locks byte-exact, batch equality, duplicates) protect it
      // and residual violations surface as the honest best-achievable score.
      // The owner's 8 × 125 g failure had ZERO constraints, so it stays gated.
      const hardConstrained =
        Object.values(currentConstraints.byLineId).some((c) => c.mode !== 'ai') ||
        current.items.some((item) => item.lock_type !== 'unlocked');
      // Owner CURRENT-DRAFT P0: a VERIFIED batch reconciliation of a
      // near-batch, differentiated draft is a legitimate outcome even without
      // a technical improvement — reaching the hard batch equality is part of
      // the objective. Re-derived TRUSTLESSLY here from `current` +
      // `proposedInput` (never from `preview.batchReconciliationOnly`), and
      // deliberately narrow so the hollow 8 × 125 g class stays gated.
      const reconciliation = isBatchReconciliation(current, preview.proposedInput);
      const practicalizationOnly =
        preview.practicalization?.status === 'ready' &&
        JSON.stringify(preview.practicalization.audit.exactInput) === JSON.stringify(current) &&
        JSON.stringify(preview.practicalization.audit.executableInput) ===
          JSON.stringify(preview.proposedInput);
      if (
        !hardConstrained &&
        !reconciliation &&
        !practicalizationOnly &&
        !beatsBaseline(current, preview.proposedInput)
      ) {
        return {
          ok: false,
          code: 'unsafe_proposal',
          messagePl: copy.blocked.unsafeProposal,
          violationsBefore: detectViolations(calculateRecipe(current)).length,
          violationsAfter: detectViolations(calculateRecipe(preview.proposedInput)).length,
        };
      }
    }

    if (preview.practicalization === undefined) {
      return {
        ok: false,
        code: 'practicalization_invalid',
        reason: 'missing_proof',
        messagePl:
          'Apply zablokowany: Preview nie zawiera zweryfikowanej receptury wykonawczej w pełnych gramach.',
      };
    }

    // Omitted unused lines leave the executable recipe together with their
    // product-behavior snapshot: the APPLIED authority set binds only to lines
    // that still exist (Base lines of the proposal plus post-process toppings).
    // Every verification above ran on the complete verified set.
    const appliedProductBehaviorSnapshots: Record<string, ProductBehaviorSnapshot> =
      omittedUnusedLineIds.size === 0
        ? verifiedProductBehaviorSnapshots
        : Object.fromEntries(
            Object.entries(verifiedProductBehaviorSnapshots).filter(
              ([lineId, snapshot]) =>
                !omittedUnusedLineIds.has(lineId) || snapshot.processScope === 'POST_PROCESS_ADDON',
            ),
          );
    const record: AppliedChangeRecord = {
      id,
      at,
      kind: preview.kind,
      titlePl: preview.titlePl,
      mode: current.mode,
      temperatureC: current.target_temperature_c,
      engineVersion: preview.engineVersion,
      configVersion: preview.configVersion,
      before: {
        input: structuredClone(current),
        constraints: currentConstraints,
        excludedIngredientIds: [...excludedIngredientIds],
        productBehaviorSnapshots: structuredClone(
          Object.fromEntries(
            Object.entries(currentProductBehaviorSnapshots).filter(
              (entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined,
            ),
          ),
        ),
      },
      after: {
        input: structuredClone(preview.proposedInput),
        constraints: verifiedNextConstraints,
        excludedIngredientIds: [...excludedIngredientIds],
        productBehaviorSnapshots: structuredClone(appliedProductBehaviorSnapshots),
      },
      lines: preview.lines,
      explanation: preview.explanation,
      violationsBefore: preview.violationsBefore,
      violationsAfter: preview.violationsAfter,
      ...(preview.formulation
        ? {
            formulation: {
              mode: preview.formulation.mode,
              templateId: preview.formulation.templateId,
              added: structuredClone(preview.formulation.added),
              localFallback: preview.formulation.localFallback === true,
            },
          }
        : {}),
      ...(preview.practicalization.status === 'ready'
        ? {
            practicalization: {
              modelVersion: preview.practicalization.audit.modelVersion,
              exactInput: structuredClone(preview.practicalization.audit.exactInput),
              lines: structuredClone(preview.practicalization.audit.lines),
            },
          }
        : {}),
    };

    return {
      ok: true,
      verified: new VerifiedApply(
        structuredClone(preview.proposedInput),
        verifiedNextConstraints,
        record,
        structuredClone(appliedProductBehaviorSnapshots),
      ),
    };
  }
}

/** The pipeline door — see `VerifiedApply.commit`. */
export const commitPreview = VerifiedApply.commit.bind(VerifiedApply);
