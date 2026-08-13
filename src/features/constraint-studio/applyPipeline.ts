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
  type RecipeInput,
  type RecipeResult,
} from '@/engine';
import { recipeContext } from '@/features/studio/buildRecipeInput';
import {
  buildRecipeDirectionPlan,
  recipeDirectionViolations,
} from '@/features/recipe-direction/recipeDirectionTargets';
import {
  assessRecipeDirection,
  type RecipeDirectionAssessment,
} from '@/features/recipe-direction/recipeDirectionAssessment';
import {
  buildDraftCandidateVector,
  describeDraftAdjustment,
  sweepDraftCandidateVector,
  type DraftSweepResult,
} from './draftCandidateVector';
import { sweepEcoDraftCost } from './ecoDraftCostSweep';
import type { CustomerPriceIndex } from '@/features/pro-core/effectiveRecipePricing';
import { normalizeFormulationStrategy } from '@/features/formulation-strategy/strategy';
import {
  verifyEcoFlavourProtection,
  type EcoFlavourViolation,
} from '@/features/formulation-strategy/flavourFloor';
import {
  applyConstraintsToRecipe,
  buildProposalExplanation,
  BATCH_SUM_TOLERANCE_G,
  rescaleBatchToTarget,
  verifyConstraintsPreserved,
  type ConstraintExplanationEntry,
  type ConstraintPreservationViolation,
  type ConstraintSet,
  type ConstraintValidationIssue,
  type IngredientConstraint,
} from '@/features/recipe-constraints';
import { constraintStudioCopy as copy } from './constraintStudioCopy';
import {
  approvedFormulationToolboxIngredients,
  buildFormulationProposal,
  routeFormulationMode,
  type FormulationAddedLine,
  type FormulationMode,
  type FormulationOptions,
  type FormulationRecommendation,
  type FormulationRoleTraceRow,
} from '@/features/formulation/formulate';
import { resolveFunctionalRole, type FunctionalRole } from '@/features/formulation/ingredientRoles';
import {
  isVerifiedRuntimeSubstitute,
  hasVerifiedMapperSubstitutionAuthorization,
  substitutionIngredientFingerprint,
} from '@/features/ingredient-builder/recipeSubstitution';
import type { SubstituteAuthorization } from '@/features/ingredient-builder/ingredientTableUx';
import {
  detectProportionalScaling,
  type ProportionalScalingReport,
} from '@/features/formulation/proportionalScaling';
import {
  isTemplateControlledStabilizer,
  templateControlledStabilizerViolations,
  violatesApprovedStabilizerDosage,
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
  productBehaviorModuleGate,
  productBehaviorSnapshotFingerprint,
  verifyMainEnvelope,
  type MainEnvelopeViolation,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import { recipeFitForInput } from '@/features/protein-gelato/proteinTarget';
import {
  canonicalDuplicateIds,
  canonicalIngredientId,
  canonicalIngredientIdFromSourceId,
  ingredientProvenance,
} from '@/data/ingredients/canonicalIngredientIdentity';
import {
  veganRecipeEligibilityIssues,
  type VeganRecipeEligibilityIssue,
} from '@/data/ingredients/veganEligibility';
import {
  veganProfileConstraintIssues,
  veganProfileConstraintMessagePl,
  type VeganProfileConstraintIssue,
} from '@/features/formulation/veganProfileConstraints';
import {
  veganSubstitutionMessagePl,
  veganSubstitutionRecommendations,
  type VeganSubstitutionRecommendation,
} from '@/features/formulation/veganSubstitutions';
import {
  assessProteinTarget,
  fitProteinTarget,
  type ProteinTargetAssessment,
} from '@/features/protein-gelato/proteinTarget';
import {
  practicalizeRecipeCandidate,
  PRACTICAL_RECIPE_MODEL_VERSION,
  type PracticalRecipeAudit,
  type PracticalRecipeResult,
} from '@/features/practical-recipe/practicalRecipe';

/** Build-only commercial inputs. They rank ECO candidates in memory and are
 * deliberately absent from RecipeInput, Preview payloads and saved versions. */
export interface OptimizePreviewOptions extends FormulationOptions {
  effectivePriceOverrides?: CustomerPriceIndex;
  /** Immutable per-line product/version/policy authority. Engine formulas do
   * not read it; product orchestration and the Apply trust door do. */
  productBehaviorSnapshots?: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  /** Pro workbench provenance gate: even a clean, already-integer recipe must
   * pass through the canonical Preview → Apply door before Save/Production. */
  requirePracticalPreview?: boolean;
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
  /** The native-safe Protein candidate moved closer to the persisted target. */
  proteinTargetImproved?: boolean;
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
  const beforeProtein = assessProteinTarget(before);
  const afterProtein = assessProteinTarget(after);
  const proteinTargetImproved =
    beforeProtein.applicable &&
    afterProtein.applicable &&
    beforeProtein.targetPercent === afterProtein.targetPercent &&
    beforeProtein.absoluteResidualPp !== null &&
    afterProtein.absoluteResidualPp !== null &&
    afterProtein.hardSafe &&
    afterProtein.absoluteResidualPp < beforeProtein.absoluteResidualPp - 1e-9;
  const engineImproved = nativeImproved || proteinTargetImproved;

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
    proteinTargetImproved,
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

export interface ConstraintPreview {
  kind: PreviewKind;
  titlePl: string;
  /** Exact identity swap; the Apply door re-derives every field. */
  substitution?: SubstitutionPreviewProof;
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
  /**
   * Owner P0 NIGHTLY (live FAILURE 1, Phase 3): the monotonic `draftRevision`
   * this preview was built for (stamped by the store). `commitPreview` rejects
   * a revision mismatch — the additional monotonic guard NEXT TO the
   * fingerprint guard, so a preview can never apply onto a later draft.
   */
  baseDraftRevision?: number;
  /** Owner P0 NIGHTLY (FAILURE 2): honest iteration diagnostics — count,
   * per-round violation/severity trajectory and the exact stop reason. */
  /** Protein product-layer target vs actual on the staged candidate. */
  proteinTarget?: ProteinTargetAssessment;
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
  iteration?: IterationDiagnostics;
  /** ACCEPTANCE ADDENDUM (3): residual violations on NATIVE approved bands in
   * the PROPOSED state (classified by `classifyViolationBands` provenance).
   * Non-empty ⇒ the preview is DIAGNOSTIC ONLY. The `commitPreview` door
   * re-derives this trustlessly from `proposedInput` — never from this field. */
  hardResidualMetrics?: string[];
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
    | 'protein_target_residual'
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
  status: 'maximized' | 'held_by_contract' | 'no_admissible_increase';
  startingMainGrams: number;
  exactAcceptedMainGrams: number;
  executableMainGrams: number;
  firstHigherRejectedGrams: number | null;
  firstHigherRejectedReason:
    | 'batch_or_constraints'
    | 'hard_gate'
    | 'technical_score_class'
    | 'main_identity'
    | null;
  technicalScore: number | null;
  attempts: number;
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
  if (!isNearTargetBatch(current)) return false; // (2)
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
  const seenIds = new Set<string>();
  const keepLineByIngredient = new Map<string, string>();
  const merged: { item: (typeof proposed.items)[number]; extraGrams: number }[] = [];
  let changed = false;

  for (const item of proposed.items) {
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

  if (!changed) return proposed;
  return {
    ...proposed,
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
): ReturnType<typeof rescaleBatchToTarget> {
  const constrainedCandidate = applyConstraintMassesPreservingLockTypes(candidate, set);
  const byLineId = { ...set.byLineId };
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
  return rescaleBatchToTarget(constrainedCandidate, { byLineId }, targetBatchGrams);
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
  /** Owner P0 (Przelicz z PI): a no-proposal failure carries the PROOF — the solver
   * really ran (invocation count) and these exact metrics stayed out of band. */
  | {
      ok: false;
      code: 'no_proposal';
      violatedMetrics?: string[];
      solverInvocations?: number;
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

function mainSafePreview(input: RecipeInput, preview: ConstraintPreview): BuildPreviewResult {
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
    const flavour = verifyEcoFlavourProtection(input, preview.proposedInput);
    if (!flavour.ok) {
      return {
        ok: false,
        code: 'main_ratio_conflict',
        lineIds: [...new Set(flavour.violations.map((violation) => violation.lineId))],
        ingredientNames: [
          ...new Set(flavour.violations.map((violation) => violation.ingredientName)),
        ],
        messagePl:
          'ECO zablokowane: propozycja narusza tożsamość smaku, Flavour Floor lub proporcję Main.',
      };
    }
  }
  const identity = verifyMainIngredientIdentity(input, preview.proposedInput);
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
  const practical = practicalizeRecipeCandidate(proposedInput, nextConstraints);
  const executableInput = practical.ok ? practical.audit.executableInput : proposedInput;
  const afterResult = practical.ok
    ? practical.audit.executableResult
    : calculateRecipe(proposedInput);
  return {
    kind,
    titlePl,
    // Owner addendum item 4: computed HERE, from the two inputs, for EVERY
    // preview builder — there is no path that can produce a preview without it.
    outcomeClassification: classifyPreviewOutcome(baseInput, executableInput),
    baseFingerprint: workingStateFingerprint(baseInput, baseSet),
    proposedInput: executableInput,
    nextConstraints,
    proteinTarget: assessProteinTarget(executableInput, afterResult),
    directionAssessment: assessRecipeDirection(executableInput, afterResult),
    lines: buildLineDiffs(baseInput, executableInput, nextConstraints),
    violationsBefore,
    violationsAfter: violationCount(afterResult),
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
      violatesApprovedStabilizerDosage(current, action),
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
export const MAX_SOLVER_ROUNDS = 12;

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
  | 'protein_target_reached'
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
  proteinTarget?: ProteinTargetAssessment;
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
  probeLowerProteinTargets = true,
  minimumProteinScore: number | null = null,
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
  const solverSet = withTemplateControlledStabilizerLocks(start, set);
  const measure = (candidate: RecipeInput): { violations: number; severityPoints: number } => {
    const list = recipeDirectionViolations(candidate);
    return {
      violations: list.length,
      severityPoints: list.reduce((sum, violation) => sum + violation.severity_points, 0),
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
        const targetFit = fitProteinTarget(
          working,
          solverSet,
          [...excludedIngredientIds],
          probeLowerProteinTargets,
        );
        if (targetFit.changed) {
          // The Main frontier only needs to prove preservation of the already
          // selected Protein score class. `fitProteinTarget` has already run
          // its complete product-layer search from this candidate; once that
          // result reaches the required class, repeating the same search from
          // successive partial states cannot improve the lexicographic Main
          // decision. Normal Protein formulation keeps the historical
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
            move: `protein-target ${targetFit.sourceLineId ?? 'source'} ↔ ${targetFit.balancingLineId ?? 'balance'}`,
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
            stopReason = targetFit.assessment.reached
              ? 'protein_target_reached'
              : 'protein_best_achievable';
            break;
          }
          continue;
        }
        stopReason = targetFit.assessment.reached
          ? 'protein_target_reached'
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
      } as const;
      const normalize = (candidate: RecipeInput) =>
        restore(ensureUniqueLineIds(base, mergeByCanonicalIdentity(base, candidate)));

      if (normalizeFormulationStrategy(base.goals?.formulation_strategy ?? base.mode) === 'eco') {
        return sweepEcoDraftCost({
          identityInput: base,
          start: working,
          set: solverSet,
          excludedIngredientIds,
          constraints,
          normalize,
          priceOverrides,
        });
      }
      return sweepDraftCandidateVector({
        start: working,
        set: solverSet,
        excludedIngredientIds,
        constraints,
        normalize,
        measure,
        startMeasure: current,
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
    const improved =
      next.violations < current.violations ||
      next.severityPoints < current.severityPoints - SEVERITY_EPS;
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
      proteinTarget: assessProteinTarget(working),
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
      reason:
        | 'batch_or_constraints'
        | 'hard_gate'
        | 'technical_score_class'
        | 'main_identity';
    };

const mainGroupTotal = (identityInput: RecipeInput, candidate: RecipeInput): number => {
  const byLineId = new Map(candidate.items.map((item) => [item.id, item] as const));
  return captureMainIngredientIntent(identityInput).reduce(
    (sum, main) => sum + (byLineId.get(main.lineId)?.planned_grams ?? 0),
    0,
  );
};

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

  // The proof's starting point is always the CURRENT canonical draft, not a
  // template/solver seed. A formulation seed may already carry a different
  // Main mass; reporting that as "starting" would make a valid Preview
  // impossible to re-verify at the trustless Apply door.
  const startingMainGrams = mainGroupTotal(identityInput, identityInput);
  const searchStartingMainGrams = mainGroupTotal(identityInput, start);
  const baselineResult = calculateRecipe(start);
  const identityResult = calculateRecipe(identityInput);
  const startProtein = assessProteinTarget(start, baselineResult);
  const identityProtein = assessProteinTarget(identityInput, identityResult);
  const baselineProteinResidual =
    start.category !== 'protein_gelato'
      ? null
      : Math.min(
          startProtein.absoluteResidualPp ?? Infinity,
          identityProtein.absoluteResidualPp ?? Infinity,
        );
  const preservesProteinFrontier = (
    candidate: RecipeInput,
    result = calculateRecipe(candidate),
  ): boolean => {
    if (candidate.category !== 'protein_gelato' || baselineProteinResidual === null) return true;
    const residual = assessProteinTarget(candidate, result).absoluteResidualPp;
    return residual !== null && residual <= baselineProteinResidual + 1e-9;
  };
  const startScore = recipeFitForInput(start, baselineResult).score;
  const identityScore = recipeFitForInput(identityInput, identityResult).score;
  const startHardCount = classifyViolationBands(start).hardMetrics.length;
  const identityHardCount = classifyViolationBands(identityInput).hardMetrics.length;
  // Lexicographic rule: a different solver/template seed must never define a
  // lower "best class" than the current draft already proves achievable.
  // Main optimisation is allowed only inside a native-hard-safe class.
  const baselineHardCount = Math.min(startHardCount, identityHardCount);
  const baselineScore: number | null =
    startScore === null
      ? identityScore
      : identityScore === null
        ? startScore
        : Math.max(startScore, identityScore);
  const baselineDirectionReached = assessRecipeDirection(start, baselineResult).reachedAxisCount;
  if (
    !(startingMainGrams > 0) ||
    !(searchStartingMainGrams > 0) ||
    baselineScore === null ||
    baselineHardCount > 0
  ) {
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
    const practical = practicalizeRecipeCandidate(candidate, set);
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
      ) !== 'eco' || verifyEcoFlavourProtection(identityInput, executable).ok;
    const veganValid =
      executable.category !== 'vegan_gelato' ||
      (veganRecipeEligibilityIssues(executable.items).length === 0 &&
        veganProfileConstraintIssues(executable).length === 0);
    return identity.ok &&
      constraints.ok &&
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
    const requestedMainGrams = ratio.mains.reduce(
      (sum, main) => sum + main.grams * ratio.scaleFactor,
      0,
    );
    const mainByLineId = new Map(
      ratio.mains.map((main) => [main.lineId, main.grams * ratio.scaleFactor] as const),
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
    const solverSet = withTemplateControlledStabilizerLocks(staged, mainSet);
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
        if (Math.abs(plannedSum(candidate) - identityInput.target_batch_grams) <= BATCH_SUM_TOLERANCE_G) {
          candidates.push(candidate);
        }
      }
    }

    let rejection: Extract<MainObjectiveProbe, { ok: false }>['reason'] =
      'batch_or_constraints';
    let best: Extract<MainObjectiveProbe, { ok: true }> | null = null;
    for (const settled of candidates) {
      const identity = verifyMainIngredientIdentity(identityInput, settled);
      const constraints = verifyConstraintsPreserved(set, settled);
      if (!identity.ok || !constraints.ok) {
        rejection = 'main_identity';
        continue;
      }
      if (
        normalizeFormulationStrategy(
          identityInput.goals?.formulation_strategy ?? identityInput.mode,
        ) === 'eco' &&
        !verifyEcoFlavourProtection(identityInput, settled).ok
      ) {
        rejection = 'main_identity';
        continue;
      }
      if (
        settled.category === 'vegan_gelato' &&
        (veganRecipeEligibilityIssues(settled.items).length > 0 ||
          veganProfileConstraintIssues(settled).length > 0)
      ) {
        rejection = 'hard_gate';
        continue;
      }
      const hardCount = classifyViolationBands(settled).hardMetrics.length;
      if (hardCount > baselineHardCount) {
        rejection = 'hard_gate';
        continue;
      }
      const settledResult = calculateRecipe(settled);
      const score = recipeFitForInput(settled, settledResult).score;
      const directionReached = assessRecipeDirection(
        settled,
        settledResult,
      ).reachedAxisCount;
      if (score === null || score < baselineScore) {
        rejection = 'technical_score_class';
        continue;
      }
      if (directionReached < baselineDirectionReached) {
        rejection = 'technical_score_class';
        continue;
      }
      if (!preservesProteinFrontier(settled, settledResult)) {
        rejection = 'technical_score_class';
        continue;
      }
      const practicalScore = practicalScoreIfAdmissible(settled);
      if (practicalScore === null) {
        rejection = 'technical_score_class';
        continue;
      }
      const accepted = {
        ok: true as const,
        input: settled,
        mainGrams: mainGroupTotal(identityInput, settled),
        score: practicalScore,
      };
      if (best === null || (accepted.score ?? -Infinity) > (best.score ?? -Infinity)) best = accepted;
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
    const solverSet = withTemplateControlledStabilizerLocks(candidate, mainSet);
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
    ).working;
  };
  const settleIfAdmissible = (candidate: RecipeInput): RecipeInput => {
    const settled = settleRemainingLines(candidate);
    const identity = verifyMainIngredientIdentity(identityInput, settled);
    const constraints = verifyConstraintsPreserved(set, settled);
    const hardCount = classifyViolationBands(settled).hardMetrics.length;
    const settledResult = calculateRecipe(settled);
    const score = recipeFitForInput(settled, settledResult).score;
    const directionReached = assessRecipeDirection(
      settled,
      settledResult,
    ).reachedAxisCount;
    const ecoValid =
      normalizeFormulationStrategy(identityInput.goals?.formulation_strategy ?? identityInput.mode) !==
        'eco' || verifyEcoFlavourProtection(identityInput, settled).ok;
    const veganValid =
      settled.category !== 'vegan_gelato' ||
      (veganRecipeEligibilityIssues(settled.items).length === 0 &&
        veganProfileConstraintIssues(settled).length === 0);
    const practicalScore = practicalScoreIfAdmissible(settled);
    return identity.ok &&
      constraints.ok &&
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
  });
  const upper = probe(behaviorCeiling ?? identityInput.target_batch_grams);
  if (upper.ok && upper.mainGrams <= searchStartingMainGrams + MAIN_OBJECTIVE_EPSILON_G) {
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

function maximizeMainFlavourObjective(
  identityInput: RecipeInput,
  start: RecipeInput,
  set: ConstraintSet,
  options: OptimizePreviewOptions,
): { input: RecipeInput; proof: MainFlavourObjectiveProof | null } {
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
        candidate?.id === item.id &&
        Math.abs(candidate.planned_grams - item.planned_grams) <= 1e-9
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
    const practical = practicalizeRecipeCandidate(candidate.input, set);
    const input = practical.ok ? practical.audit.executableInput : candidate.input;
    const result = practical.ok ? practical.audit.executableResult : calculateRecipe(input);
    return {
      input,
      mainGrams: mainGroupTotal(identityInput, input),
      hardCount: classifyViolationBands(input).hardMetrics.length,
      score: recipeFitForInput(input, result).score,
      proteinResidual: assessProteinTarget(input, result).absoluteResidualPp,
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
        (candidateOutcome.proteinResidual !== null &&
          currentOutcome.proteinResidual !== null &&
          candidateOutcome.proteinResidual <= currentOutcome.proteinResidual + 1e-9));
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

  const practicalSelected = practicalizeRecipeCandidate(selected.input, set);
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
    const baselineProteinResidual =
      identityInput.category === 'protein_gelato'
        ? assessProteinTarget(selectedExecutable, selectedResult).absoluteResidualPp
        : null;
    const preservesProteinFrontier = (
      candidate: RecipeInput,
      result = calculateRecipe(candidate),
    ): boolean => {
      if (candidate.category !== 'protein_gelato' || baselineProteinResidual === null) {
        return true;
      }
      const residual = assessProteinTarget(candidate, result).absoluteResidualPp;
      return residual !== null && residual <= baselineProteinResidual + 1e-9;
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
      assessRecipeDirection(
      selectedExecutable,
      selectedResult,
      ).reachedAxisCount,
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
        const grams = ratio.mains.map((main) => main.grams * ratio.scaleFactor);
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
    const proteinUnitFrontier =
      identityInput.category === 'protein_gelato' && baselineScore === 10;

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
        ratio.mains.map((main) => [main.lineId, main.grams * ratio.scaleFactor] as const),
      );
      const mainSet: ConstraintSet = {
        byLineId: {
          ...set.byLineId,
          ...Object.fromEntries(
            [...mainByLineId].map(([lineId, grams]) => [lineId, { mode: 'locked', grams }] as const),
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
        const solverSet = withTemplateControlledStabilizerLocks(staged, mainSet);
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
          ) continue;
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
      };
      const recordRejection = (
        reason: Exclude<MainFlavourObjectiveProof['firstHigherRejectedReason'], null>,
      ) => {
        if (rejection === null || rejectionPriority[reason] > rejectionPriority[rejection]) {
          rejection = reason;
        }
      };
      const directlyAccepted = identityInput.category === 'protein_gelato' ? candidates.flatMap(({ input: candidate }) => {
        const practical = practicalizeRecipeCandidate(candidate, set);
        if (!practical.ok) return [];
        const executable = practical.audit.executableInput;
        const score = recipeFitForInput(executable, practical.audit.executableResult).score;
        const admissible =
          verifyMainIngredientIdentity(identityInput, executable).ok &&
          verifyConstraintsPreserved(set, executable).ok &&
          classifyViolationBands(executable).hardMetrics.length <= baselineHardCount &&
          score !== null &&
          score >= baselineScore &&
          assessRecipeDirection(executable, practical.audit.executableResult).reachedAxisCount >=
            baselineDirectionReached &&
          preservesProteinFrontier(executable, practical.audit.executableResult) &&
          (normalizeFormulationStrategy(
            identityInput.goals?.formulation_strategy ?? identityInput.mode,
          ) !== 'eco' || verifyEcoFlavourProtection(identityInput, executable).ok) &&
          (executable.category !== 'vegan_gelato' ||
            (veganRecipeEligibilityIssues(executable.items).length === 0 &&
              veganProfileConstraintIssues(executable).length === 0));
        return admissible && score !== null
          ? [{ exactInput: candidate, executableInput: executable, score }]
          : [];
      }) : [];
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
          false,
          baselineScore,
        ).working;
        const practical = practicalizeRecipeCandidate(settledCandidate, set);
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
          !verifyEcoFlavourProtection(identityInput, executable).ok
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
      accepted.sort((left, right) => right.score - left.score);
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

    if (frontierMainGrams > mainGroupTotal(identityInput, selectedExecutable) + MAIN_OBJECTIVE_EPSILON_G) {
      selected = {
        input: exactAcceptedInput,
        proof: {
          ...selected.proof,
          status: 'maximized',
          exactAcceptedMainGrams,
          executableMainGrams: frontierMainGrams,
          firstHigherRejectedGrams,
          firstHigherRejectedReason,
          technicalScore: recipeFitForInput(
            exactAcceptedInput,
            calculateRecipe(exactAcceptedInput),
          ).score,
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
  preview.mainObjective = {
    ...proof,
    executableMainGrams: mainGroupTotal(identityInput, preview.proposedInput),
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
    detectViolations(calculateRecipe(identityInput)).length > 0 ||
    detectViolations(calculateRecipe(unsafeInput)).length === 0
  ) {
    return null;
  }
  const mains = captureMainIngredientIntent(identityInput);
  const unsafeByLineId = new Map(unsafeInput.items.map((item) => [item.id, item] as const));
  const targetMainGrams = mainGroupTotal(identityInput, unsafeInput);
  const mainByLineId = new Map(
    mains.map((main) => [main.lineId, unsafeByLineId.get(main.lineId)?.planned_grams ?? main.grams]),
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
  const solverSet = withTemplateControlledStabilizerLocks(staged, mainSet);
  const anchors: RecipeInput[] = [];
  const proportional = rescaleBatchToTarget(
    staged,
    solverSet,
    identityInput.target_batch_grams,
  );
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
  const admissible = (candidate: RecipeInput): boolean => {
    if (
      Math.abs(plannedSum(candidate) - identityInput.target_batch_grams) >
        BATCH_SUM_TOLERANCE_G ||
      Math.abs(mainGroupTotal(identityInput, candidate) - targetMainGrams) >
        MAIN_OBJECTIVE_EPSILON_G ||
      !verifyMainIngredientIdentity(identityInput, candidate).ok ||
      !verifyConstraintsPreserved(set, candidate).ok ||
      detectViolations(calculateRecipe(candidate)).length > 0
    ) {
      return false;
    }
    const practical = practicalizeRecipeCandidate(candidate, set);
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
        planned_grams:
          item.planned_grams + (unsafe.planned_grams - item.planned_grams) * ratio,
      };
    }),
  });

  let best: { input: RecipeInput; severity: number; ratio: number } | null = null;
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
    const severity = recipeDirectionViolations(accepted).reduce(
      (sum, violation) => sum + violation.severity_points,
      0,
    );
    if (
      severity < identityDirectionSeverity - SEVERITY_EPS &&
      (best === null || severity < best.severity - SEVERITY_EPS ||
        (Math.abs(severity - best.severity) <= SEVERITY_EPS && low > best.ratio))
    ) {
      best = { input: accepted, severity, ratio: low };
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
  const solverSet = withTemplateControlledStabilizerLocks(proposedInput, set);
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
  const solverSet = withTemplateControlledStabilizerLocks(built.proposal.proposedInput, set);
  const iterated = iterateFormulationSeed(input, solverSet, built.proposal.proposedInput, options);
  const mainObjective = maximizeMainFlavourObjective(input, iterated.working, set, options);
  const working = mainObjective.input;
  const solverRounds = iterated.diagnostics.solverInvocations;
  const lastProposal = iterated.lastProposal;

  // Acceptance: an UNCONSTRAINED formulation must BEAT the draft's null
  // hypothesis (never merely equal a proportional projection — the 8 × 125 g
  // rule). A CONSTRAINED reformulation is different (owner P0): with exact
  // locks / ranges / exclusions, the constrained optimum may legitimately
  // EQUAL the projection — but ONLY with the explicit authenticity proof
  // (owner Agent 3): the verdict below, the scaling-detector evidence and the
  // attempted-move log ride the preview, and hard NATIVE-band failure after
  // real engine moves becomes the honest `impossible_under_constraints`.
  const afterViolationList = detectViolations(calculateRecipe(working));
  if (mode !== 'constrained_reformulation' && !beatsBaseline(input, working)) {
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

  // Scaling detector: is the FINAL state a shared-factor projection of the
  // pre-normalization seed baseline? (Held lines prove nothing — excluded.)
  const heldLineIds = new Set(
    working.items
      .filter((item) => isConstrained(solverSet, item.id) || item.lock_type !== 'unlocked')
      .map((item) => item.id),
  );
  const scaling: ProportionalScalingReport = detectProportionalScaling(
    built.proposal.seedBaselineGrams,
    working,
    heldLineIds,
  );
  const appliedMoves = iterated.diagnostics.rounds.length - 1;
  const violationsAfterCount = afterViolationList.length;
  const verdict: FormulationProofVerdict =
    violationsAfterCount === 0
      ? 'all_bands_in_range'
      : scaling.proportional || appliedMoves === 0
        ? 'no_feasible_improvement'
        : 'engine_improved';
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
  if (mode === 'constrained_reformulation' && iterated.diagnostics.capped) {
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

  // Best-effort labelling (owner Agent 3 + addendum): provisional/fallback
  // bands or a reference-derived template NEVER claim optimality; a capped
  // iteration never claims a proven fixed point; a proven-unfixable residual
  // is named as such. The stabilizer-dose note appears exactly when the FINAL
  // dose is still the template-inherited value (owner addendum 3).
  const provisionalBands = bands.bandSource !== 'native' || bands.temperatureFallback;
  const bestEffortReasons: FormulationProof['bestEffortReasons'] = [];
  if (provisionalBands) bestEffortReasons.push('provisional_bands');
  if (template.status !== 'approved') bestEffortReasons.push('reference_derived_template');
  if (iterated.diagnostics.capped) bestEffortReasons.push('iteration_capped');
  // A VERIFIED fixed point (never the cap) proves the residual violations are
  // unfixable by any permitted move — the accept-with-explanation label.
  if (violationsAfterCount > 0 && !iterated.diagnostics.capped) {
    bestEffortReasons.push('residual_violations_proven_unfixable');
  }
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
  const proof: FormulationProof = {
    verdict,
    improvingMoves: appliedMoves,
    solverInvocations: solverRounds,
    proportionalProjection: scaling.proportional,
    sharedScaleFactor: scaling.sharedFactor,
    bestEffort: bestEffortReasons.length > 0,
    bestEffortReasons,
    stabilizerDoseNotePl,
  };

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

  const preview = finishPreview(
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
  attachMainObjective(preview, input, mainObjective.proof);
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
  preview.hardResidualMetrics = bands.hardMetrics;
  // Owner addendum item 2: a non-approved formulation seed is DIAGNOSTIC ONLY,
  // whatever the score — the door refuses it independently.
  const referenceDerived = !isApprovedTemplateId(built.proposal.templateId);
  const proteinResidual =
    preview.proteinTarget?.applicable === true && !preview.proteinTarget.reached;
  preview.diagnosticOnly =
    bands.hardMetrics.length > 0 ||
    iterated.diagnostics.capped ||
    referenceDerived ||
    proteinResidual;
  preview.diagnosticReason = referenceDerived
    ? 'reference_derived'
    : bands.hardMetrics.length > 0
      ? 'hard_residual'
      : iterated.diagnostics.capped
        ? 'iteration_cap'
        : proteinResidual
          ? 'protein_target_residual'
          : undefined;
  return mainSafePreview(input, preview);
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
export function buildOptimizePreview(
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
  if (mainTotal > input.target_batch_grams + BATCH_SUM_TOLERANCE_G) {
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
  const decision = routeFormulationMode(input, set);
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
      options,
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
    return mainSafePreview(input, preview);
  };

  const solverSet = withTemplateControlledStabilizerLocks(input, set);
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
  const restoreBatch = (candidate: RecipeInput): RecipeInput => {
    const constraintDrift = !hasActuals && !verifyConstraintsPreserved(solverSet, candidate).ok;
    if (!offBatch(candidate) && !constraintDrift) return candidate;
    const restored = rescalePreservingMainGroup(
      input,
      candidate,
      solverSet,
      input.target_batch_grams,
    );
    return restored.ok ? restored.input : candidate;
  };

  // 1. Batch equality is part of the DEFAULT objective — reconcile it first.
  let working = restoreBatch(constrained.input);
  const batchRescaled = working !== constrained.input;

  const beforeResult = calculateRecipe(constrained.input);
  const violationsBefore = violationCount(beforeResult);
  const hasCritical = beforeResult.warnings.some((warning) => warning.severity === 'critical');
  const initialProteinTarget = assessProteinTarget(working);
  const strategy = normalizeFormulationStrategy(input.goals?.formulation_strategy ?? input.mode);
  if (
    strategy !== 'eco' &&
    recipeDirectionViolations(working).length === 0 &&
    !hasCritical &&
    !batchRescaled &&
    (!initialProteinTarget.applicable || initialProteinTarget.reached)
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
      cleanMainObjective.proof.exactAcceptedMainGrams >
        cleanMainObjective.proof.startingMainGrams + MAIN_OBJECTIVE_EPSILON_G
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
      return mainSafePreview(input, preview);
    }
    const practical = practicalizeRecipeCandidate(input, set);
    const needsPracticalPreview =
      options.requirePracticalPreview === true ||
      !practical.ok ||
      JSON.stringify(practical.audit.executableInput) !== JSON.stringify(input);
    if (needsPracticalPreview) {
      // A clean, already-integer Pro draft still needs the SAME Preview →
      // Apply provenance before Save/Production.  A zero-diff Preview is
      // deliberate executable validation, not a second apply route.
      const preview = finishPreview(
        'optimize',
        options.requirePracticalPreview === true
          ? 'Zweryfikuj recepturę wykonawczą'
          : 'Przygotuj recepturę do wykonania',
        input,
        set,
        input,
        set,
        violationsBefore,
        [],
        createdAt,
      );
      preview.practicalizationOnly = true;
      attachMainObjective(preview, input, cleanMainObjective.proof);
      return mainSafePreview(input, preview);
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
  );
  const mainObjective = maximizeMainFlavourObjective(input, iterated.working, set, options);
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
    // The PROVEN failure: solver really ran `solverRounds` times and these
    // exact metrics stayed out of band (empty = no violations detectable).
    if (violated.length === 0) {
      violated = [...new Set(recipeDirectionViolations(working).map((v) => v.metric))];
    }
    // Owner Phase 6: a complete unconstrained draft gets the template-seeded
    // fallback before the failure is final (never a bare one-line stop); the
    // CURRENT-DRAFT batch-reconciliation door is the last word (owner P0).
    return withBatchReconciliation(
      withTemplateFallback({
        ok: false,
        code: 'no_proposal',
        violatedMetrics: violated,
        solverInvocations: solverRounds,
        iteration: iterated.diagnostics,
      }),
      working,
      iterated.diagnostics,
      violationsBefore,
    );
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
      mainObjective.proof.exactAcceptedMainGrams >
        mainObjective.proof.startingMainGrams + MAIN_OBJECTIVE_EPSILON_G);
  if (!improved) {
    // Owner Phase 6: same fallback door — a produced-but-rejected local
    // candidate on a complete unconstrained draft tries the template seed;
    // then the CURRENT-DRAFT batch-reconciliation door (owner P0 primary root
    // cause: an off-batch draft is never „the best verified result").
    return withBatchReconciliation(
      withTemplateFallback({
        ok: false,
        code: 'unsafe_proposal',
        violatedMetrics: [...new Set(afterViolationList.map((v) => v.metric))],
        solverInvocations: solverRounds,
        batchOnly: lastProposal === null,
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

  const preview = finishPreview(
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
  attachMainObjective(preview, input, mainObjective.proof);
  preview.autoBalance = { batchRescaled, solverRounds };
  preview.iteration = iterated.diagnostics;
  // ACCEPTANCE ADDENDUM (1+3): the local-correction preview carries the same
  // honest diagnostic classification as the formulation path.
  const localBands = classifyViolationBands(working);
  preview.hardResidualMetrics = localBands.hardMetrics;
  const proteinResidual =
    preview.proteinTarget?.applicable === true && !preview.proteinTarget.reached;
  preview.diagnosticOnly =
    localBands.hardMetrics.length > 0 || iterated.diagnostics.capped || proteinResidual;
  preview.diagnosticReason =
    localBands.hardMetrics.length > 0
      ? 'hard_residual'
      : iterated.diagnostics.capped
        ? 'iteration_cap'
        : proteinResidual
          ? 'protein_target_residual'
          : undefined;
  return mainSafePreview(input, preview);
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
  const protein = assessProteinTarget(proposed);
  const preserved = verifyConstraintsPreserved(set, proposed);
  if (
    nativeResidual.length > 0 ||
    directionResidual.length > 0 ||
    (protein.applicable && !protein.reached) ||
    !preserved.ok
  ) {
    return {
      ok: false,
      code: 'substitution_invalid',
      reasons: [
        ...nativeResidual.map((violation) => `hard:${violation.metric}`),
        ...directionResidual.map((violation) => `direction:${violation.metric}`),
        ...(protein.applicable && !protein.reached ? ['protein_target'] : []),
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
  const stabilizerScaledInput: RecipeInput = {
    ...input,
    items: input.items.map((item) =>
      !fixedLineIds.has(item.id) &&
      !isPercentContract(item) &&
      isTemplateControlledStabilizer(item.ingredient)
        ? { ...item, planned_grams: item.planned_grams * batchRatio }
        : item,
    ),
  };
  const batchSolverSet = withTemplateControlledStabilizerLocks(stabilizerScaledInput, set);
  const rescaled = rescaleBatchToTarget(stabilizerScaledInput, batchSolverSet, newBatchGrams);
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
  };
  after: {
    input: RecipeInput;
    constraints: ConstraintSet;
    excludedIngredientIds: readonly string[];
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
      if (
        snapshot.mapperIngredientId !== null &&
        snapshot.mapperIngredientId !== canonicalId
      ) return true;
      if (snapshot.source === 'catalog_import') {
        const productToken = `catalog:${snapshot.productId}`;
        return item.ingredient.id !== productToken &&
          !item.ingredient.private_product_id?.startsWith(`${productToken}:version:`);
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
        messagePl:
          'Snapshot zachowania produktu nie odpowiada aktualnej toÅ¼samoÅ›ci skÅ‚adnika.',
      };
}

/** Binds a successful Preview to immutable product/version/policy authority
 * and rejects the rounded vector before it can be shown as applicable. */
export function bindProductBehaviorToPreview(
  result: BuildPreviewResult,
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
): BuildPreviewResult {
  if (!result.ok) return result;
  const moduleGate = productBehaviorModuleGate(snapshots, 'BASE_RECIPE');
  if (!moduleGate.ready) {
    return {
      ok: false,
      code: 'product_behavior_invalid',
      violations: [{
        code: 'product_behavior_missing',
        lineIds: moduleGate.blockedLineIds,
        messagePl:
          moduleGate.reason ??
          'Receptura wymaga ponownej walidacji danych produktu przed Preview.',
      }],
      messagePl:
        moduleGate.reason ??
        'Receptura wymaga ponownej walidacji danych produktu przed Preview.',
    };
  }
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
  const managed = Object.keys(snapshots).length > 0;
  if (!managed) return result;
  const verification = verifyMainEnvelope({
    recipe: result.preview.proposedInput,
    snapshots,
    mode: normalizeFormulationStrategy(
      result.preview.proposedInput.goals?.formulation_strategy ?? result.preview.proposedInput.mode,
    ),
  });
  if (!verification.ok) {
    return {
      ok: false,
      code: 'product_behavior_invalid',
      violations: verification.violations,
      messagePl: verification.violations[0]?.messagePl ??
        'Nie udało się potwierdzić zachowania produktu w tej recepturze.',
    };
  }
  result.preview.productBehaviorFingerprint = productBehaviorSnapshotFingerprint(snapshots);
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
): string[] {
  const proposedByLineId = new Map(preview.proposedInput.items.map((item) => [item.id, item]));
  const currentIds = new Set(current.items.map((item) => item.id));
  const authorizedSubstitutionLineId =
    preview.kind === 'substitution' ? preview.substitution?.lineId : undefined;
  const violations: string[] = [];

  for (const existing of current.items) {
    const proposed = proposedByLineId.get(existing.id);
    if (!proposed) {
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
        substitutionIngredientFingerprint(approved) ===
          substitutionIngredientFingerprint(added.ingredient),
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
    if (
      preview.productBehaviorFingerprint !== undefined &&
      productBehaviorSnapshotFingerprint(currentProductBehaviorSnapshots) !==
        preview.productBehaviorFingerprint
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
      const rederived = practicalizeRecipeCandidate(audit.exactInput, verifiedNextConstraints);
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
    const identityViolations = ingredientIdentityIntegrityViolations(current, preview);
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
              substitutionIngredientFingerprint(approved) ===
                substitutionIngredientFingerprint(item.ingredient),
          );
        })
        .map((item) => item.id);
      return {
        totalGrams:
          stabilizerRole.grams * (exactCandidate.target_batch_grams / template.baseBatchG),
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
    for (const exactLine of exactCandidate.items.filter((item) =>
      isTemplateControlledStabilizer(item.ingredient),
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
          substitution.veganEligibility;
      if (!authorizationValid) {
        return {
          ok: false,
          code: 'main_identity_violated',
          messagePl:
            'Apply zablokowany: zamiennik nie ma aktualnego potwierdzenia z katalogu Mapper.',
          violations: [],
        };
      }
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
    const mainIdentity = verifyMainIngredientIdentity(mainIdentityBase, preview.proposedInput);
    if (!mainIdentity.ok) {
      return {
        ok: false,
        code: 'main_identity_violated',
        messagePl: mainIdentityViolationMessage(mainIdentity),
        violations: mainIdentity.violations,
      };
    }
    const mainEnvelope = verifyMainEnvelope({
      recipe: preview.proposedInput,
      snapshots: currentProductBehaviorSnapshots,
      mode: normalizeFormulationStrategy(
        current.goals?.formulation_strategy ?? current.mode,
      ),
    });
    if (!mainEnvelope.ok) {
      return {
        ok: false,
        code: 'product_behavior_invalid',
        violations: mainEnvelope.violations,
        messagePl: mainEnvelope.violations[0]?.messagePl ??
          'Apply zablokowany: zachowanie produktu nie jest zatwierdzone.',
      };
    }
    const behaviorGate = productBehaviorModuleGate(
      currentProductBehaviorSnapshots,
      'BASE_RECIPE',
    );
    if (!behaviorGate.ready) {
      return {
        ok: false,
        code: 'product_behavior_invalid',
        violations: [{
          code: 'product_behavior_missing',
          lineIds: behaviorGate.blockedLineIds,
          messagePl:
            behaviorGate.reason ??
            'Apply zablokowany: receptura wymaga ponownej walidacji danych produktu.',
        }],
        messagePl:
          behaviorGate.reason ??
          'Apply zablokowany: receptura wymaga ponownej walidacji danych produktu.',
      };
    }
    const identityViolation = productBehaviorIdentityViolation(
      preview.proposedInput,
      currentProductBehaviorSnapshots,
    );
    if (identityViolation) {
      return {
        ok: false,
        code: 'product_behavior_invalid',
        violations: [identityViolation],
        messagePl: identityViolation.messagePl,
      };
    }
    const currentMainGrams = mainGroupTotal(mainIdentityBase, mainIdentityBase);
    const exactMainGrams = mainGroupTotal(mainIdentityBase, exactCandidate);
    const executableMainGrams = mainGroupTotal(mainIdentityBase, preview.proposedInput);
    if (executableMainGrams < currentMainGrams - MAIN_OBJECTIVE_EPSILON_G) {
      return {
        ok: false,
        code: 'main_identity_violated',
        messagePl:
          'Apply zablokowany: propozycja zmniejsza grupę Główną mimo aktywnego priorytetu smaku.',
        violations: [],
      };
    }
    const mainMoved = executableMainGrams > currentMainGrams + MAIN_OBJECTIVE_EPSILON_G;
    if (preview.kind === 'optimize' && mainMoved) {
      const proof = preview.mainObjective;
      const exactScore = recipeFitForInput(exactCandidate, calculateRecipe(exactCandidate)).score;
      const proofValid =
        proof?.status === 'maximized' &&
        Math.abs(proof.startingMainGrams - currentMainGrams) <= MAIN_OBJECTIVE_EPSILON_G &&
        Math.abs(proof.exactAcceptedMainGrams - exactMainGrams) <= MAIN_OBJECTIVE_EPSILON_G &&
        Math.abs(proof.executableMainGrams - executableMainGrams) <= MAIN_OBJECTIVE_EPSILON_G &&
        proof.technicalScore === exactScore &&
        (proof.firstHigherRejectedGrams === null ||
          proof.firstHigherRejectedGrams >
            proof.exactAcceptedMainGrams + MAIN_OBJECTIVE_EPSILON_G / 10);
      if (!proofValid) {
        return {
          ok: false,
          code: 'main_identity_violated',
          messagePl:
            'Apply zablokowany: nie udało się ponownie potwierdzić dowodu maksymalizacji składnika Głównego.',
          violations: [],
        };
      }
      // A self-consistent proof is not enough: rebuild the deterministic Main
      // frontier from the current trusted draft. This closes forged or stale
      // "maximized" proofs that stop below an executable whole-gram candidate.
      const rebuilt = buildOptimizePreview(
        current,
        currentConstraints,
        preview.createdAt,
        { excludedIngredientIds },
      );
      const recomputedExecutableMainGrams = rebuilt.ok
        ? mainGroupTotal(mainIdentityBase, rebuilt.preview.proposedInput)
        : currentMainGrams;
      if (recomputedExecutableMainGrams > executableMainGrams + MAIN_OBJECTIVE_EPSILON_G) {
        return {
          ok: false,
          code: 'main_identity_violated',
          messagePl:
            'Apply zablokowany: propozycja nie jest maksymalnym wykonalnym poziomem składnika Głównego.',
          violations: [],
        };
      }
    }
    if (
      normalizeFormulationStrategy(current.goals?.formulation_strategy ?? current.mode) === 'eco'
    ) {
      const flavour = verifyEcoFlavourProtection(current, preview.proposedInput);
      if (!flavour.ok) {
        return {
          ok: false,
          code: 'eco_flavour_floor_violated',
          messagePl:
            'Apply zablokowany: propozycja ECO narusza tożsamość smaku, Flavour Floor lub proporcję Main.',
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
      const currentTarget = assessProteinTarget(current);
      const proposedTarget = assessProteinTarget(preview.proposedInput);
      const targetIdentityPreserved =
        preview.proposedInput.category === 'protein_gelato' &&
        proposedTarget.targetPercent === currentTarget.targetPercent;
      if (!targetIdentityPreserved || !proposedTarget.hardSafe || !proposedTarget.reached) {
        return {
          ok: false,
          code: 'unsafe_proposal',
          messagePl:
            'Apply zablokowany: kandydat Protein nie osiąga wybranego celu białka w natywnie bezpiecznej recepturze.',
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
      },
      after: {
        input: structuredClone(preview.proposedInput),
        constraints: verifiedNextConstraints,
        excludedIngredientIds: [...excludedIngredientIds],
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
      ),
    };
  }
}

/** The pipeline door — see `VerifiedApply.commit`. */
export const commitPreview = VerifiedApply.commit.bind(VerifiedApply);
