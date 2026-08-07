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
  type RecipeInput,
  type RecipeResult,
} from '@/engine';
import { recipeContext } from '@/features/studio/buildRecipeInput';
import {
  buildDraftCandidateVector,
  describeDraftAdjustment,
  sweepDraftCandidateVector,
  type DraftSweepResult,
} from './draftCandidateVector';
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
  detectProportionalScaling,
  type ProportionalScalingReport,
} from '@/features/formulation/proportionalScaling';
import { violatesApprovedStabilizerDosage } from '@/features/formulation/stabilizerDosage';
import {
  isApprovedTemplateId,
  selectFormulationTemplate,
  type FormulationTemplate,
  type TemplateStatus,
} from '@/features/formulation/templateRegistry';
import { isToolboxCandidateExcluded } from '@/features/formulation/toolboxCanonical';
import { classifyViolationBands } from '@/features/formulation/violationBands';
import {
  canonicalDuplicateIds,
  canonicalIngredientId,
  canonicalIngredientIdFromSourceId,
  ingredientProvenance,
} from '@/data/ingredients/canonicalIngredientIdentity';

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
    constraints: set.byLineId,
  });
}

/* ── preview model ───────────────────────────────────────────────────────── */

export type PreviewKind = 'optimize' | 'batch_rescale' | 'suggested_fix';

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
  const engineImproved =
    violationsAfter < violationsBefore ||
    totalSeverity(after) < totalSeverity(before) - SEVERITY_EPS;

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
  /** Owner P0 (Przelicz z PI) — auto-balance proof: what the orchestration actually did. */
  autoBalance?: { batchRescaled: boolean; solverRounds: number };
  /**
   * Owner CURRENT-DRAFT P0 (primary root cause): TRUE ⇒ this preview exists
   * because the draft was OFF its target batch and the batch was reconciled;
   * NO further technical improvement was verified. The UI must say exactly
   * that and must NEVER call it a technical improvement.
   */
  batchReconciliationOnly?: boolean;
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
  /**
   * Owner P0 NIGHTLY (live FAILURE 1, Phase 3): the monotonic `draftRevision`
   * this preview was built for (stamped by the store). `commitPreview` rejects
   * a revision mismatch — the additional monotonic guard NEXT TO the
   * fingerprint guard, so a preview can never apply onto a later draft.
   */
  baseDraftRevision?: number;
  /** Owner P0 NIGHTLY (FAILURE 2): honest iteration diagnostics — count,
   * per-round violation/severity trajectory and the exact stop reason. */
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
  diagnosticReason?: 'hard_residual' | 'iteration_cap' | 'reference_derived';
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
  | { ok: false; code: 'rescale_invalid' }
  | { ok: false; code: 'rescale_actuals' }
  | { ok: false; code: 'rescale_no_scalable' }
  | { ok: false; code: 'rescale_locked_sum'; minimumBatchGrams: number }
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
  const afterResult = calculateRecipe(proposedInput);
  return {
    kind,
    titlePl,
    // Owner addendum item 4: computed HERE, from the two inputs, for EVERY
    // preview builder — there is no path that can produce a preview without it.
    outcomeClassification: classifyPreviewOutcome(baseInput, proposedInput),
    baseFingerprint: workingStateFingerprint(baseInput, baseSet),
    proposedInput,
    nextConstraints,
    lines: buildLineDiffs(baseInput, proposedInput, nextConstraints),
    violationsBefore,
    violationsAfter: violationCount(afterResult),
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
  const proposed = proposeAutoFix({ input: solverInput, context, exactCorrectionGrams: true });
  const violated = [...new Set(detectViolations(calculateRecipe(current)).map((v) => v.metric))];
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
): {
  working: RecipeInput;
  lastProposal: CorrectionProposal | null;
  violated: string[];
  diagnostics: IterationDiagnostics;
} {
  const measure = (candidate: RecipeInput): { violations: number; severityPoints: number } => {
    const list = detectViolations(calculateRecipe(candidate));
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
    Object.entries(set.byLineId)
      .filter(([, constraint]) => constraint.mode !== 'ai')
      .map(([lineId]) => lineId),
  );
  // Owner Phase 1 instrumentation: the candidate vector of the STARTING state.
  const candidateVector: CandidateVectorDiagnostic[] = buildDraftCandidateVector(
    start,
    set,
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
      stopReason = 'all_bands_in_range';
      break;
    }
    if (round > MAX_SOLVER_ROUNDS) {
      stopReason = 'iteration_cap';
      capped = true;
      violated = [...new Set(detectViolations(calculateRecipe(working)).map((v) => v.metric))];
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
      return sweepDraftCandidateVector({
        start: working,
        set,
        excludedIngredientIds,
        constraints: {
          context: recipeContext(working),
          mode: working.mode,
          allow_main_ingredient_reduction: false,
          // Capacity is re-established by construction: `normalize` restores the
          // target batch after every accepted line (same deferral rationale as
          // `solverInputWithDeferredCapacity`).
          machine_capacity_grams: null,
        },
        normalize: (candidate) =>
          restore(ensureUniqueLineIds(base, mergeByCanonicalIdentity(base, candidate))),
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
      stopDetail,
      capped,
      attemptedMoves,
    },
  };
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
  options: FormulationOptions = {},
): ReturnType<typeof iterateSolverToFixedPoint> {
  const constrainedIngredientIds = new Set(
    input.items
      .filter((item) => isConstrained(set, item.id))
      .map((item) => canonicalIngredientId(item.ingredient)),
  );
  const restore = (candidate: RecipeInput): RecipeInput => {
    if (Math.abs(plannedSum(candidate) - input.target_batch_grams) <= BATCH_SUM_TOLERANCE_G) {
      return candidate;
    }
    const restored = rescaleBatchToTarget(candidate, set, input.target_batch_grams);
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
    set,
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
  options: FormulationOptions,
  /** Owner Phase 6 (NIGHTLY): TRUE when invoked as the template-seeded
   * fallback after a local-corrector failure (provenance marker only). */
  localFallback = false,
): BuildPreviewResult {
  const built = buildFormulationProposal(input, set, template, mode, options);
  if (!built.ok) {
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
  const iterated = iterateFormulationSeed(input, set, built.proposal.proposedInput, options);
  const working = iterated.working;
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
      .filter((item) => isConstrained(set, item.id) || item.lock_type !== 'unlocked')
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
  preview.diagnosticOnly =
    bands.hardMetrics.length > 0 || iterated.diagnostics.capped || referenceDerived;
  preview.diagnosticReason = referenceDerived
    ? 'reference_derived'
    : bands.hardMetrics.length > 0
      ? 'hard_residual'
      : iterated.diagnostics.capped
        ? 'iteration_cap'
        : undefined;
  return { ok: true, preview };
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
  options: FormulationOptions = {},
): BuildPreviewResult {
  // OWNER P0 (full formulation) — deterministic MODE ROUTER first: a new/
  // incomplete/arbitrary draft is FORMULATED from the approved template
  // registry (never from the previous version, never by scaling arbitrary
  // values); a complete near-batch draft keeps the existing local-correction
  // path; an unsupported profile × temperature returns an honest structured
  // state. The formulation path interprets ranges as TARGET constraints (a
  // 0 g draft against a 150–250 g range is a solvable request, not an error);
  // the correction path keeps the strict §17 current-grams validation.
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
    const lookup = selectFormulationTemplate(input.category, input.target_temperature_c);
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
    return { ok: true, preview };
  };

  const constrained = applyConstraintsToRecipe(input, set);
  if (!constrained.ok) {
    return { ok: false, code: 'invalid_constraints', issues: constrained.issues };
  }

  const hasActuals = input.items.some((item) => item.actual_grams !== null);
  const offBatch = (candidate: RecipeInput): boolean =>
    !hasActuals &&
    Math.abs(plannedSum(candidate) - input.target_batch_grams) > BATCH_SUM_TOLERANCE_G;
  const restoreBatch = (candidate: RecipeInput): RecipeInput => {
    if (!offBatch(candidate)) return candidate;
    const restored = rescaleBatchToTarget(candidate, set, input.target_batch_grams);
    return restored.ok ? restored.input : candidate;
  };

  // 1. Batch equality is part of the DEFAULT objective — reconcile it first.
  let working = restoreBatch(constrained.input);
  const batchRescaled = working !== constrained.input;

  const beforeResult = calculateRecipe(constrained.input);
  const violationsBefore = violationCount(beforeResult);
  const hasCritical = beforeResult.warnings.some((warning) => warning.severity === 'critical');
  if (violationCount(calculateRecipe(working)) === 0 && !hasCritical && !batchRescaled) {
    return { ok: false, code: 'already_clean' };
  }

  // 2. ITERATE the canonical solver on the batch-true recipe to a VERIFIED
  //    fixed point (owner P0 NIGHTLY FAILURE 2): rounds continue WHILE a
  //    verified improvement exists, up to the deterministic MAX_SOLVER_ROUNDS
  //    guard — the stop reason and the per-round trajectory are reported.
  const constrainedIngredientIds = new Set(
    input.items
      .filter((item) => isConstrained(set, item.id))
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
    set,
  );
  working = iterated.working;
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
      violated = [...new Set(detectViolations(calculateRecipe(working)).map((v) => v.metric))];
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
    (lastProposal !== null && severityAfter < severityBefore - SEVERITY_EPS);
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
  preview.autoBalance = { batchRescaled, solverRounds };
  preview.iteration = iterated.diagnostics;
  // ACCEPTANCE ADDENDUM (1+3): the local-correction preview carries the same
  // honest diagnostic classification as the formulation path.
  const localBands = classifyViolationBands(working);
  preview.hardResidualMetrics = localBands.hardMetrics;
  preview.diagnosticOnly = localBands.hardMetrics.length > 0 || iterated.diagnostics.capped;
  preview.diagnosticReason =
    localBands.hardMetrics.length > 0
      ? 'hard_residual'
      : iterated.diagnostics.capped
        ? 'iteration_cap'
        : undefined;
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
  const rescaled = rescaleBatchToTarget(input, set, newBatchGrams);
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
  const nextSet: ConstraintSet = {
    byLineId: { ...set.byLineId, [fix.lineId]: nextConstraint },
  };

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
    preview: finishPreview(
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
}

/* ── the ONLY door ───────────────────────────────────────────────────────── */

export type BlockedApply =
  | { code: 'stale_preview'; messagePl: string }
  | { code: 'invalid_lines'; messagePl: string; lineNames: string[] }
  | { code: 'excluded_ingredients'; messagePl: string; ingredientNames: string[] }
  | {
      code: 'constraints_violated';
      messagePl: string;
      violations: ConstraintPreservationViolation[];
    }
  /** Owner P0 Phase 6: the proposal would introduce a duplicate canonical ingredient. */
  | { code: 'duplicate_lines'; messagePl: string; ingredientNames: string[] }
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
  | { code: 'reference_derived_provenance'; messagePl: string; templateId: string };

export type CommitPreviewResult =
  | { ok: true; verified: VerifiedApply }
  | ({ ok: false } & BlockedApply);

const violatedIngredientNames = (
  preview: ConstraintPreview,
  violations: readonly ConstraintPreservationViolation[],
): string[] => {
  const nameByLineId = new Map(preview.lines.map((line) => [line.lineId, line.name]));
  return violations.map((violation) => nameByLineId.get(violation.lineId) ?? violation.lineId);
};

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

    // Trustless payload validation: stable line/canonical ids, finite
    // non-negative planned/actual grams and a successful Engine evaluation.
    const invalidLineNames = preview.proposedInput.items
      .filter(
        (item) =>
          !item.id.trim() ||
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
    try {
      const result = calculateRecipe(preview.proposedInput);
      if (!Number.isFinite(result.total_batch_g)) throw new Error('non_finite_engine_total');
    } catch {
      const lineNames = preview.proposedInput.items.map((item) => item.ingredient.name);
      return {
        ok: false,
        code: 'invalid_lines',
        messagePl: copy.blocked.invalidLines(lineNames),
        lineNames,
      };
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

    if (preview.formulation?.roleTrace.some((row) => row.hard && row.outcome === 'missing_hard')) {
      return {
        ok: false,
        code: 'invalid_lines',
        messagePl: copy.blocked.invalidLines(['required_role']),
        lineNames: ['required_role'],
      };
    }

    // THE owner-mandated gate: every Apply verifies constraint preservation.
    // Runs FIRST so a locked-line violation keeps its specific §17.2 message.
    const preserved = verifyConstraintsPreserved(preview.nextConstraints, preview.proposedInput);
    if (!preserved.ok) {
      return {
        ok: false,
        code: 'constraints_violated',
        messagePl: copy.blocked.constraintsViolated(
          violatedIngredientNames(preview, preserved.violations),
        ),
        violations: preserved.violations,
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
    const batchGatedKind = preview.kind === 'optimize' || preview.kind === 'suggested_fix';
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
      if (!isApprovedTemplateId(templateId)) {
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
    if (preview.kind === 'optimize') {
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
      if (!hardConstrained && !reconciliation && !beatsBaseline(current, preview.proposedInput)) {
        return {
          ok: false,
          code: 'unsafe_proposal',
          messagePl: copy.blocked.unsafeProposal,
          violationsBefore: detectViolations(calculateRecipe(current)).length,
          violationsAfter: detectViolations(calculateRecipe(preview.proposedInput)).length,
        };
      }
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
        constraints: preview.nextConstraints,
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
    };

    return {
      ok: true,
      verified: new VerifiedApply(
        structuredClone(preview.proposedInput),
        preview.nextConstraints,
        record,
      ),
    };
  }
}

/** The pipeline door — see `VerifiedApply.commit`. */
export const commitPreview = VerifiedApply.commit.bind(VerifiedApply);
