/**
 * Constraint Studio session store (SPEC §17–§20) — constraints, the pending
 * preview, the §20 history and the blocked-apply notice. §19's Preview/Apply
 * live in working memory and are NEVER persisted; durable history is the
 * pro-core save→version path (see ui/SaveVersionControl).
 *
 * OWNER FINAL INTEGRATION ADDENDUM (Agent C — multi-remove/no-refresh): the
 * §17 CONSTRAINT SET alone is persisted (`constraintStudioPersistPartialize`).
 * Reason: a §17 padlock writes BOTH halves of one lock — the exact grams here
 * AND `lock_type: 'grams'` on the recipe line — and the recipe line IS
 * persisted. Persisting only one half left a reloaded draft engine-frozen with
 * no padlock to show for it, and made the live and the post-refresh canonical
 * payload differ on `byLineId`. Staleness is still impossible: a draft-context
 * change (load/preset/reset) clears the set through `resetDraftSession`, and the
 * rehydrated set is reconciled against the rehydrated lines before it is ever
 * read, so an entry survives ONLY while its line still exists AND still carries
 * the engine lock.
 *
 * Recipe-write discipline: this file is the ONLY module in the feature that
 * writes to the recipe store (pinned by constraintStudioBoundary.test.ts),
 * and it writes recipe items in exactly two places:
 *  - `applyPreview` — only with a `VerifiedApply` from `commitPreview` (the
 *    pipeline door that always runs verifyConstraintsPreserved);
 *  - `undoLastApply` — restoring the byte-exact pre-apply snapshot captured
 *    by that same pipeline (§19.2/§20.3), guarded by a fingerprint match so
 *    undo can never destroy edits made after the apply.
 *
 * Lock semantics (§17.1/§17.2): the padlock records the EXACT planned grams
 * in the constraint set AND maps the line onto the engine's existing
 * `lock_type: 'grams'` — so every recompute path that consumes the recipe
 * store (corrections, optimization previews, branch previews) structurally
 * respects the lock, because the engine solver never touches a non-'unlocked'
 * line. Unlocking restores 'unlocked' and returns the line to the solver.
 */
import { flavourHeldLineIds } from '@/features/formulation/flavourMutationAuthority';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  calculateRecipe,
  type EngineIngredient,
  type LockType,
  type RecipeInput,
  type RecipeItem,
} from '@/engine';
import type { SubstituteAuthorization } from '@/features/ingredient-builder/ingredientTableUx';
import {
  ingredientRowMeta,
  useIngredientTableUxStore,
} from '@/features/ingredient-builder/ingredientTableUxStore';
import { missingProductDoseMessage } from '@/features/ingredient-builder/productDoseSuggestion';
import {
  productBehaviorSnapshotFingerprint,
  productBehaviorRequiredLineIds,
  verifyMainEnvelope,
  type MainEnvelopeViolation,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import { normalizeFormulationStrategy } from '@/features/formulation-strategy/strategy';
import {
  resolveRecipeProposalBehaviorSnapshots,
  validateRecipeBehaviorOnServer,
} from '@/services/productIntelligence';
import { useAuthStore } from '@/stores/authStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  canonicalIngredientId,
  canonicalIngredientIdFromSourceId,
  ingredientProvenance,
} from '@/data/ingredients/canonicalIngredientIdentity';
import {
  analyzeConstraintFeasibility,
  assessOwnerStabilizerSystem,
  validateConstraintSet,
  type ConstraintFeasibilityAnalysis,
  type ConstraintSet,
  type ConstraintValidationIssue,
  type IngredientConstraint,
} from '@/features/recipe-constraints';
import { useRecipeStore } from '@/stores/recipeStore';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  attachPracticalRecipeAudit,
  practicalRecipeInputFingerprint,
  practicalizeRecipeCandidate,
  readPracticalRecipeAudit,
} from '@/features/practical-recipe/practicalRecipe';
import { constraintStudioCopy } from './constraintStudioCopy';

const applyGuardCopy = constraintStudioCopy.applyGuard;
import {
  buildBatchRescalePreview,
  bindProductBehaviorToPreview,
  buildExplicitStandardRemovalPreview,
  buildOptimizePreview,
  buildSubstitutionPreview,
  buildSuggestedFixPreview,
  commitPreview,
  directionTargetFingerprint,
  workingStateFingerprint,
  type AppliedChangeRecord,
  type AppliedPresentationSnapshot,
  type BlockedApply,
  type BuildPreviewResult,
  type ConstraintPreview,
  type DirectionBestAchievableConsent,
  type ExplicitStandardRemovalConsent,
  type ProposalProductBehaviorAuthorization,
  type RecalculationTerminalState as PipelineRecalculationTerminalState,
  type SuggestedBoundFix,
  type SuggestedFixSessionAuthorization,
  type SubstitutionConsent,
  type SubstitutionSessionAuthorization,
} from './applyPipeline';
import {
  assessRescueIngredientAdvice,
  type RescueIngredientAdvice,
} from './rescueIngredientAdvisor';
import { runOptimizePreviewOffMainThread } from './optimizePreviewRuntime';
import type { OptimizePreviewComputation } from './optimizePreviewComputation';

export type RecalculationTerminalState = PipelineRecalculationTerminalState;

interface PrebuiltOptimizePreview extends OptimizePreviewComputation {
  createdAt: string;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

let changeSeq = 0;
const nextChangeId = (): string =>
  `apply-${Date.now().toString(36)}-${(changeSeq += 1).toString(36)}`;
const nowIso = (): string => new Date().toISOString();

interface ImpossibleConstraintLockRecovery {
  fix: SuggestedBoundFix;
  ingredientName: string;
  beforeGrams: number;
}

/** Converts only a solver-proven infeasible user lock into the one existing
 * explicit Suggested Fix transition. The grams come from the canonical
 * Engine search; this helper owns no culinary limit of its own. */
function impossibleConstraintLockRecovery(
  result: BuildPreviewResult,
  input: RecipeInput,
): ImpossibleConstraintLockRecovery | null {
  if (
    result.ok ||
    result.code !== 'impossible_under_constraints' ||
    result.conflict === null ||
    result.nearestFeasibleGrams === null
  )
    return null;
  const line = input.items.find((item) => item.id === result.conflict?.lineId);
  const nearest = result.nearestFeasibleGrams;
  if (
    line === undefined ||
    line.actual_grams !== null ||
    !Number.isFinite(nearest) ||
    nearest < 0 ||
    nearest >= result.conflict.grams
  )
    return null;
  return {
    fix: { type: 'set_max', lineId: result.conflict.lineId, grams: nearest },
    ingredientName: result.conflict.ingredientName,
    beforeGrams: result.conflict.grams,
  };
}

const constraintFingerprint = (set: ConstraintSet): string =>
  JSON.stringify(Object.entries(set.byLineId).sort(([left], [right]) => left.localeCompare(right)));

/** A Preview is an explicit mutation proposal, never a second spelling of
 * NO_CHANGE. The real served Colina path exposed a full-formulation Preview
 * whose canonical diff contained six `unchanged` rows; applying it changed no
 * material fact and made repeated recalculation loop forever. Keep unmet
 * Direction targets out of this shortcut because those require their own
 * BEST_ACHIEVABLE evidence/consent path. */
export function optimizePreviewRequiresApply(
  preview: ConstraintPreview,
  currentConstraints: ConstraintSet,
  currentInput: RecipeInput,
): boolean {
  if (preview.kind !== 'optimize') return true;
  if (preview.lines.some((line) => line.kind !== 'unchanged')) return true;
  if (
    constraintFingerprint(preview.nextConstraints) !== constraintFingerprint(currentConstraints)
  ) {
    return true;
  }
  const proposedById = new Map(preview.proposedInput.items.map((item) => [item.id, item]));
  if (
    currentInput.items.some((item) => {
      const proposed = proposedById.get(item.id);
      return (
        !proposed ||
        proposed.lock_type !== item.lock_type ||
        JSON.stringify(proposed.grams_constraint ?? null) !==
          JSON.stringify(item.grams_constraint ?? null) ||
        JSON.stringify(proposed.range_constraint ?? null) !==
          JSON.stringify(item.range_constraint ?? null)
      );
    })
  )
    return true;
  return preview.directionAssessment?.active === true && !preview.directionAssessment.reached;
}

/* ── THE canonical current-draft selector (owner P0 NIGHTLY, FAILURE 1) ──── */

/**
 * The ONE canonical composition of the CURRENT draft across BOTH stores
 * (recipe input + §17 constraint session). Every consumer — Monitor, Przelicz,
 * Preview build, the Apply gate, Save, Undo feasibility, QA diagnostics —
 * derives the draft from THIS selector; no consumer reconstructs it
 * independently, so the recipe half and the constraint half can never drift
 * apart again (the owner's stale-state failure).
 */
export interface CanonicalDraft {
  /** Monotonic material-edit revision (recipeStore, Phase 3). */
  revision: number;
  /** Draft-context sequence — bumps only on load/preset/reset. */
  contextSeq: number;
  /** Engine input: line ids, grams, actuals, locks, batch, internal category/
   * profile, serving temperature, tier (mode), machine capacity, goals. */
  input: RecipeInput;
  /** EFFECTIVE §17 constraints — reconciled against the CURRENT lines. */
  constraints: ConstraintSet;
  /** Explicit exclusions / unavailable ingredients (canonical + Mapper ids). */
  excludedIngredientIds: readonly string[];
  /** Exclusions that were Main when marked unavailable. */
  unavailableMainIngredientIds: readonly string[];
  /** Machine/serving context (routing/UX only — never Engine math). */
  machine: {
    kind: 'professional' | 'home' | null;
    servingModeId: string | null;
    machineId: string | null;
    label: string | null;
  };
  /** Canonical saved-recipe link (drives Save create-vs-version). */
  savedRecipe: { id: string | null; name: string | null; versionNumber: number | null };
}

export function selectCanonicalDraft(): CanonicalDraft {
  const recipe = useRecipeStore.getState();
  const session = useConstraintStudioStore.getState();
  return {
    revision: recipe.draftRevision,
    contextSeq: recipe.draftContextSeq,
    input: buildRecipeInput(recipe),
    constraints: reconcileConstraints(recipe.items, session.constraints, recipe.target_batch_grams),
    excludedIngredientIds: recipe.excludedIngredientIds,
    unavailableMainIngredientIds: recipe.unavailableMainIngredientIds,
    machine: {
      kind: recipe.machineKind,
      servingModeId: recipe.servingModeId,
      machineId: recipe.machineId,
      label: recipe.machineLabel,
    },
    savedRecipe: {
      id: recipe.savedRecipeId,
      name: recipe.savedRecipeName,
      versionNumber: recipe.currentVersionNumber,
    },
  };
}

/**
 * Deterministic serialization of the FORMULATION-MATERIAL draft fields (the
 * owner Phase 1 equality contract): items (id, grams, actuals, lock), §17
 * byLineId, exclusions, batch, category, temperature, tier(mode), machine
 * capacity. Two drafts that serialize identically MUST formulate identically —
 * revision/context metadata is intentionally excluded (a refresh resets it).
 */
export function canonicalDraftSerialization(draft: CanonicalDraft): string {
  return JSON.stringify({
    items: draft.input.items.map((item) => [
      item.id,
      canonicalIngredientId(item.ingredient),
      item.ingredient.id,
      item.ingredient.private_product_id ?? null,
      ingredientProvenance(item.ingredient),
      item.planned_grams,
      item.actual_grams,
      item.lock_type,
      item.range_constraint?.min_grams ?? null,
      item.range_constraint?.max_grams ?? null,
      item.percent_constraint?.percent ?? null,
      item.grams_constraint?.grams ?? null,
    ]),
    byLineId: draft.constraints.byLineId,
    exclusions: [...draft.excludedIngredientIds],
    unavailableMains: [...draft.unavailableMainIngredientIds],
    batch: draft.input.target_batch_grams,
    category: draft.input.category,
    temperature: draft.input.target_temperature_c,
    tier: draft.input.mode,
    machineCapacity: draft.input.machine_capacity_grams,
    goals: draft.input.goals ?? null,
  });
}

/** New constraint map without one line's entry (immutable). */
const withoutLine = (
  byLineId: Readonly<Record<string, IngredientConstraint>>,
  lineId: string,
): Record<string, IngredientConstraint> => {
  const next = { ...byLineId };
  delete next[lineId];
  return next;
};

/** Engine locks the padlock layer never overrides (§18.1). */
const ENGINE_KEPT_LOCKS: ReadonlySet<LockType> = new Set(['main', 'already_added', 'required']);

export type PreviewIssue = Exclude<BuildPreviewResult, { ok: true }>;

/** PI terminal preflight. Every selected Base line is a real product choice and
 * therefore needs at least 1 g before formulation. Toppings are stored outside
 * RecipeInput.items and deliberately never enter this Base-only gate. */
export function missingProductDosePreviewIssue(
  input: RecipeInput,
): Extract<PreviewIssue, { code: 'missing_required_role' }> | null {
  const missing = input.items.filter((item) => item.planned_grams < 1);
  if (missing.length === 0) return null;
  return {
    ok: false,
    code: 'missing_required_role',
    role: 'product_dose',
    lineIds: missing.map((item) => item.id),
    messagePl: missingProductDoseMessage(missing.map((item) => item.ingredient.name)),
  };
}

/** Internal formulation compatibility boundary. The solver may still fill
 * structural/template zeroes that were not introduced as an unresolved picker
 * dose. The user-facing PI authority wrapper above this layer uses
 * `missingProductDosePreviewIssue` and therefore blocks every selected Base
 * line below 1 g before the solver starts. */
function missingPickerDosePreviewIssue(
  input: RecipeInput,
): Extract<PreviewIssue, { code: 'missing_required_role' }> | null {
  const metaByLineId = useIngredientTableUxStore.getState().metaByLineId;
  const missing = input.items.filter((item) => {
    const dose = ingredientRowMeta(metaByLineId, item.id).dose;
    return dose.provenance !== 'NONE' && item.planned_grams < 1;
  });
  if (missing.length === 0) return null;
  return {
    ok: false,
    code: 'missing_required_role',
    role: 'product_dose',
    lineIds: missing.map((item) => item.id),
    messagePl: missingProductDoseMessage(missing.map((item) => item.ingredient.name)),
  };
}
/**
 * Effective constraints for a set of recipe lines: entries whose line vanished
 * are dropped, and a locked/range entry whose engine lock was manually changed
 * away (lock dropdown) is treated as a conscious user override and dropped.
 */
export function reconcileConstraints(
  items: readonly RecipeItem[],
  set: ConstraintSet,
  targetBatchGrams?: number,
): ConstraintSet {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const byLineId: Record<string, IngredientConstraint> = {};
  let changed = false;
  for (const [lineId, constraint] of Object.entries(set.byLineId)) {
    const item = itemById.get(lineId);
    if (!item) {
      changed = true;
      continue;
    }
    if (
      constraint.mode !== 'ai' &&
      item.lock_type !== 'grams' &&
      item.lock_type !== 'percent' &&
      !ENGINE_KEPT_LOCKS.has(item.lock_type)
    ) {
      changed = true;
      continue;
    }
    byLineId[lineId] = constraint;
  }
  for (const item of items) {
    if (item.range_constraint && byLineId[item.id] === undefined) {
      const { min_grams: minGrams, max_grams: maxGrams } = item.range_constraint;
      if (
        Number.isFinite(minGrams) &&
        Number.isFinite(maxGrams) &&
        minGrams >= 0 &&
        minGrams <= maxGrams &&
        item.planned_grams >= minGrams &&
        item.planned_grams <= maxGrams
      ) {
        byLineId[item.id] = { mode: 'range', minGrams, maxGrams };
        changed = true;
        continue;
      }
    }
    const savedGrams = item.grams_constraint?.grams;
    if (
      byLineId[item.id] === undefined &&
      savedGrams !== undefined &&
      Number.isFinite(savedGrams) &&
      savedGrams >= 0 &&
      Object.is(item.planned_grams, savedGrams)
    ) {
      byLineId[item.id] = { mode: 'locked', grams: savedGrams };
      changed = true;
      continue;
    }
    const savedPercent = item.percent_constraint?.percent;
    if (
      byLineId[item.id] === undefined &&
      savedPercent !== undefined &&
      Number.isFinite(savedPercent) &&
      savedPercent >= 0 &&
      savedPercent <= 100
    ) {
      byLineId[item.id] = { mode: 'percent', percent: savedPercent };
      changed = true;
      continue;
    }
    if (
      targetBatchGrams === undefined ||
      targetBatchGrams <= 0 ||
      item.lock_type !== 'percent' ||
      byLineId[item.id] !== undefined
    )
      continue;
    byLineId[item.id] = {
      mode: 'percent',
      percent: (item.planned_grams / targetBatchGrams) * 100,
    };
    changed = true;
  }
  return changed ? { byLineId } : set;
}

/** §20.3 guard: undo is offered only while the working state still equals the
 * record's AFTER state — otherwise undo would silently destroy newer edits. */
export function isUndoAvailable(
  record: AppliedChangeRecord | undefined,
  currentInput: RecipeInput,
  currentConstraints: ConstraintSet,
): boolean {
  if (!record) return false;
  return (
    workingStateFingerprint(currentInput, currentConstraints) ===
    workingStateFingerprint(record.after.input, record.after.constraints)
  );
}

const unavailableLineName = (draft: CanonicalDraft): string | null => {
  const excluded = new Set(draft.excludedIngredientIds.map(canonicalIngredientIdFromSourceId));
  return (
    draft.input.items.find((item) => excluded.has(canonicalIngredientId(item.ingredient)))
      ?.ingredient.name ?? null
  );
};

/* ── store ───────────────────────────────────────────────────────────────── */

export interface ConstraintStudioState {
  constraints: ConstraintSet;
  preview: ConstraintPreview | null;
  previewIssue: PreviewIssue | null;
  /** Session-only; never persisted. Bound to exact base + Main identity swap. */
  substitutionConsent: SubstitutionConsent | null;
  substitutionAuthorization: SubstitutionSessionAuthorization | null;
  /** Server-resolved authority for ordinary solver-added proposal lines. */
  proposalProductBehaviorAuthorization: ProposalProductBehaviorAuthorization | null;
  /** Explicit consent for one positive Standard line removal. */
  explicitStandardRemovalConsent: ExplicitStandardRemovalConsent | null;
  suggestedFixAuthorization: SuggestedFixSessionAuthorization | null;
  /** Candidate is hidden until the user explicitly chooses the compromise. */
  directionBestCandidate: ConstraintPreview | null;
  /** Owner 2026-08-22 — simulation-proven rescue ingredient hint (never an
   * auto-add): present only when the exact Direction target is not reached
   * with the current ingredients AND one approved candidate materially helps. */
  rescueAdvice: RescueIngredientAdvice | null;
  directionConsent: DirectionBestAchievableConsent | null;
  blocked: BlockedApply | null;
  feasibility: ConstraintFeasibilityAnalysis | null;
  history: AppliedChangeRecord[];
  /** One honest terminal state for the most recent PI recalculation run. */
  recalculationTerminal: RecalculationTerminalState | null;
  /** Session link to the pro-core saved recipe (save→version reuse). */
  proCoreRecipeId: string | null;
  lastSavedVersion: number | null;

  /** §17.1 padlock: AI ↔ locked at the EXACT current grams. */
  toggleLock: (lineId: string) => void;
  /** Percentage of the final target batch, mutually exclusive with gram/range. */
  togglePercentLock: (lineId: string) => void;
  /** Resize the visible batch while applying every canonical §17 percentage,
   * including lines that retain a stronger Main/Required/physical role. */
  resizeBatchGrams: (grams: number) => void;
  /** §17.3 range (feature-flagged UI). Honest validation — never clamps. */
  setRangeConstraint: (
    lineId: string,
    minGrams: number,
    maxGrams: number,
  ) => { ok: boolean; issues: ConstraintValidationIssue[] };
  clearConstraint: (lineId: string) => void;
  /** Reconcile hook for the ingredient rows (lock dropdown override). Row
   * REMOVAL needs no hook: the store bridge reconciles the §17 half
   * synchronously inside the recipe store's own setState (owner FINAL
   * CLOSURE C3 — one atomic material-edit transaction, one revision bump). */
  onLineLockTypeChanged: (lineId: string, lockType: LockType) => void;
  /** Prune constraints for lines that no longer exist (preset loads etc.). */
  reconcile: () => void;
  /**
   * Owner P0 NIGHTLY (live FAILURE 1): start a FRESH §17 draft context —
   * constraints, staged preview/issue/feasibility/blocked AND the §20 history
   * are cleared. Called by the store bridge whenever the recipe store begins a
   * new draft context (loadRecipeInput / loadPreset / resetToDemo): a loaded
   * recipe must never inherit locks/ranges from an earlier session draft.
   */
  resetDraftSession: () => void;

  createOptimizePreview: (
    proposalSnapshots?: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
    prebuilt?: PrebuiltOptimizePreview,
  ) => void;
  acceptBestDirectionCandidate: () => void;
  createExplicitStandardRemovalPreview: (
    lineId: string,
    proposalSnapshots?: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
  ) => void;
  createBatchRescalePreview: (newBatchGrams: number) => void;
  createSuggestedFixPreview: (fix: SuggestedBoundFix) => void;
  createSubstitutionPreview: (
    lineId: string,
    substitute: EngineIngredient,
    authorization: SubstituteAuthorization,
    productBehaviorSnapshot: ProductBehaviorSnapshot,
    confirmMainIdentity: boolean,
    proposalProductBehaviorSnapshots?: Readonly<
      Record<string, ProductBehaviorSnapshot | undefined>
    >,
  ) => void;
  cancelPreview: () => void;
  /** THE apply — the only recipe write; goes through `commitPreview`. */
  applyPreview: () => void;
  undoLastApply: () => void;

  runFeasibility: () => void;
  clearFeasibility: () => void;
  dismissBlocked: () => void;
  markProCoreRecipe: (recipeId: string, versionNumber: number) => void;

  /** Test seam — fresh session state. */
  resetForTests: () => void;
}

const INITIAL = {
  constraints: { byLineId: {} } as ConstraintSet,
  preview: null,
  previewIssue: null,
  substitutionConsent: null,
  substitutionAuthorization: null,
  proposalProductBehaviorAuthorization: null,
  explicitStandardRemovalConsent: null,
  suggestedFixAuthorization: null,
  directionBestCandidate: null,
  rescueAdvice: null as RescueIngredientAdvice | null,
  directionConsent: null,
  blocked: null,
  feasibility: null,
  history: [] as AppliedChangeRecord[],
  recalculationTerminal: null as RecalculationTerminalState | null,
  proCoreRecipeId: null,
  lastSavedVersion: null,
};

/** Any constraint edit invalidates the staged preview + analysis (staleness
 * would block the apply anyway — clearing keeps the surface honest). */
const CLEAR_STAGED = {
  preview: null,
  previewIssue: null,
  substitutionConsent: null,
  substitutionAuthorization: null,
  proposalProductBehaviorAuthorization: null,
  explicitStandardRemovalConsent: null,
  suggestedFixAuthorization: null,
  directionBestCandidate: null,
  rescueAdvice: null,
  directionConsent: null,
  feasibility: null,
  blocked: null,
  recalculationTerminal: null,
};

interface LockedConstraintFixStageArgs extends ImpossibleConstraintLockRecovery {
  draft: CanonicalDraft;
  boundary: 'minimum' | 'maximum';
  reason: 'product_dosage' | 'constraint_feasibility';
  baseSnapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  proposedSnapshots?: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  technicalOnlyMainLineIds: readonly string[];
  prebuilt?: BuildPreviewResult;
}

/** Stages one disclosed, Engine-derived lock transition. Runtime may pass the
 * exact proposal that already crossed server authority; the deterministic
 * store path builds the same proposal locally for tests and dosage recovery. */
function stageLockedConstraintFixPreview(args: LockedConstraintFixStageArgs): boolean {
  const proposedAuthority = args.proposedSnapshots ?? args.baseSnapshots;
  const recovered = bindProductBehaviorToPreview(
    args.prebuilt ??
      buildSuggestedFixPreview(args.draft.input, args.draft.constraints, args.fix, nowIso()),
    proposedAuthority,
    args.baseSnapshots,
    args.technicalOnlyMainLineIds,
  );
  if (!recovered.ok || recovered.preview.diagnosticOnly === true) return false;

  recovered.preview.baseDraftRevision = args.draft.revision;
  const proposalProductBehaviorAuthorization = args.proposedSnapshots
    ? {
        baseFingerprint: recovered.preview.baseFingerprint,
        proposedFingerprint: workingStateFingerprint(
          recovered.preview.proposedInput,
          recovered.preview.nextConstraints,
        ),
        baseProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(args.baseSnapshots),
        proposedProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(proposedAuthority),
        snapshots: structuredClone(
          Object.fromEntries(
            Object.entries(proposedAuthority).filter(
              (entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined,
            ),
          ),
        ),
      }
    : null;
  recovered.preview.safetyLockConflict = {
    lineId: args.fix.lineId,
    ingredientName: args.ingredientName,
    beforeGrams: args.beforeGrams,
    requiredGrams: args.fix.grams,
    boundary: args.boundary,
    reason: args.reason,
  };
  useConstraintStudioStore.setState({
    preview: recovered.preview,
    directionBestCandidate: null,
    directionConsent: null,
    substitutionConsent: null,
    substitutionAuthorization: null,
    proposalProductBehaviorAuthorization,
    explicitStandardRemovalConsent: null,
    suggestedFixAuthorization: {
      baseFingerprint: recovered.preview.baseFingerprint,
      type: args.fix.type,
      lineId: args.fix.lineId,
      grams: args.fix.grams,
    },
    previewIssue: null,
    blocked: null,
    recalculationTerminal: { state: 'PREVIEW_READY' },
  });
  return true;
}

let activePiRunGeneration = 0;
let activePiAbortController: AbortController | null = null;
let activePiAbortGeneration = 0;
/**
 * Operational watchdog, not an Engine iteration budget. The exact served
 * Protein four-Crown Direction vector (352/136/50/25) completes deterministically
 * in 6.86 s / 335 MB on the idle repository host, but the production Worker
 * exceeded 15 s twice while its authority calls completed in under 0.5 s.
 * Thirty seconds preserves hard preemption while giving the measured browser
 * runtime headroom; no solver limit or culinary rule is changed.
 */
export const PI_RECALCULATION_DEADLINE_MS = 30_000;

const isCurrentPiRun = (generation: number): boolean => generation === activePiRunGeneration;

const abortActivePiWorker = (): void => {
  activePiAbortController?.abort();
  activePiAbortController = null;
  activePiAbortGeneration = 0;
};

const activePiSignal = (generation: number): AbortSignal | undefined =>
  activePiAbortGeneration === generation ? activePiAbortController?.signal : undefined;

/**
 * A Multi-Main set whose bases or family compatibility cannot be proven cannot
 * become authorized by changing grams. Detect that immutable authority state
 * before invoking the solver. Compatible calibrated products without a shared
 * group record use the generic individual-envelope intersection and continue
 * to the normal amount-dependent optimizer.
 */
export function uncorrectableMultiMainAuthorityViolation(
  recipe: RecipeInput,
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
  technicalOnlyMainLineIds: readonly string[] = [],
): MainEnvelopeViolation | null {
  const technicalOnly = new Set(technicalOnlyMainLineIds);
  if (
    recipe.items.filter(
      (item) => item.lock_type === 'main' && item.planned_grams > 0 && !technicalOnly.has(item.id),
    ).length < 2
  ) {
    return null;
  }
  const verification = verifyMainEnvelope({
    recipe,
    snapshots,
    mode: normalizeFormulationStrategy(recipe.goals?.formulation_strategy ?? recipe.mode),
    enforceFloor: false,
    technicalOnlyMainLineIds,
  });
  return verification.ok
    ? null
    : (verification.violations.find(
        (violation) => violation.code === 'multi_main_policy_unknown',
      ) ?? null);
}

/** One click starts one visible run and invalidates every artefact owned by the
 * previous run. Kept outside React so every PI entry point has the same
 * immediate WORKING semantics. */
export function beginPiRecalculation(): number {
  abortActivePiWorker();
  activePiRunGeneration += 1;
  activePiAbortController = new AbortController();
  activePiAbortGeneration = activePiRunGeneration;
  useRecipeProfileStore.getState().markRecalculationRequired();
  useConstraintStudioStore.setState({
    history: [],
    ...CLEAR_STAGED,
    recalculationTerminal: { state: 'WORKING' },
  });
  return activePiRunGeneration;
}

/**
 * Safely isolates a user-cancelled run. ProductBehavior transports that do not
 * expose AbortSignal may still finish in the background, but their generation
 * can no longer publish snapshots, Preview, terminal state, or recipe writes.
 */
export function cancelPiRecalculation(): void {
  if (useConstraintStudioStore.getState().recalculationTerminal?.state !== 'WORKING') return;
  abortActivePiWorker();
  activePiRunGeneration += 1;
  useConstraintStudioStore.setState({
    ...CLEAR_STAGED,
    recalculationTerminal: { state: 'CANCELLED' },
  });
}

/**
 * OWNER FINAL INTEGRATION ADDENDUM (Agent C) — the persisted §17 slice: the
 * CONSTRAINT SET and nothing else. `preview` / `previewIssue` / `blocked` /
 * `feasibility` are staged results of ONE click and must never outlive the tab
 * (a rehydrated preview would be stale by construction — its `baseDraftRevision`
 * belongs to a session that no longer exists). `history` stays in working
 * memory too: §20 undo restores a byte-exact in-memory snapshot, and durable
 * history is the save→version path.
 */
export function constraintStudioPersistPartialize(state: ConstraintStudioState) {
  return { constraints: state.constraints };
}

export const useConstraintStudioStore = create<ConstraintStudioState>()(
  persist<ConstraintStudioState>(
    (set, get) => ({
      ...INITIAL,

      toggleLock: (lineId) => {
        const recipe = useRecipeStore.getState();
        const item = recipe.items.find((candidate) => candidate.id === lineId);
        if (!item) return;
        if (item.actual_grams !== null) return; // poured material is already immutable (spec §15)

        const existing = get().constraints.byLineId[lineId];
        if (existing?.mode === 'percent' || item.lock_type === 'percent') {
          // Apple 2.0 lock contract: % and g are two mutually-exclusive modes,
          // not a three-step toggle. Selecting grams replaces the percentage
          // constraint atomically and preserves the exact current Float64 mass.
          set({
            constraints: {
              byLineId: {
                ...get().constraints.byLineId,
                [lineId]: { mode: 'locked', grams: item.planned_grams },
              },
            },
            ...CLEAR_STAGED,
          });
          recipe.setGramLock(lineId, item.planned_grams);
          return;
        }
        if (existing !== undefined && existing.mode !== 'ai') {
          // §17.2 steps 4–6: unlock → the solver may change the line again.
          set({
            constraints: { byLineId: withoutLine(get().constraints.byLineId, lineId) },
            ...CLEAR_STAGED,
          });
          if (existing.mode === 'locked') recipe.setGramLock(lineId, null);
          else if (existing.mode === 'range') recipe.clearRangeLock(lineId);
          else recipe.bumpDraftRevision(); // Phase 3: a §17 edit is a material edit
          return;
        }

        // §17.2 steps 1–3: lock the EXACT grams (same float64 — no rounding).
        set({
          constraints: {
            byLineId: {
              ...get().constraints.byLineId,
              [lineId]: { mode: 'locked', grams: item.planned_grams },
            },
          },
          ...CLEAR_STAGED,
        });
        recipe.setGramLock(lineId, item.planned_grams);
      },

      togglePercentLock: (lineId) => {
        const recipe = useRecipeStore.getState();
        const item = recipe.items.find((candidate) => candidate.id === lineId);
        if (!item || item.actual_grams !== null || recipe.target_batch_grams <= 0) return;
        const existing = get().constraints.byLineId[lineId];
        if (existing?.mode === 'percent' || item.lock_type === 'percent') {
          set({
            constraints: { byLineId: withoutLine(get().constraints.byLineId, lineId) },
            ...CLEAR_STAGED,
          });
          recipe.setPercentLock(lineId, null);
          return;
        }
        const percent = (item.planned_grams / recipe.target_batch_grams) * 100;
        set({
          constraints: {
            byLineId: {
              ...get().constraints.byLineId,
              [lineId]: { mode: 'percent', percent },
            },
          },
          ...CLEAR_STAGED,
        });
        recipe.setPercentLock(lineId, percent);
      },

      resizeBatchGrams: (grams) => {
        const percentByLineId = Object.fromEntries(
          Object.entries(get().constraints.byLineId).flatMap(([lineId, constraint]) =>
            constraint.mode === 'percent' ? [[lineId, constraint.percent] as const] : [],
          ),
        );
        useRecipeStore.getState().setBatchGrams(grams, percentByLineId);
      },

      setRangeConstraint: (lineId, minGrams, maxGrams) => {
        const recipe = useRecipeStore.getState();
        const item = recipe.items.find((candidate) => candidate.id === lineId);
        if (!item) return { ok: false, issues: [] };
        const candidateSet: ConstraintSet = {
          byLineId: {
            ...get().constraints.byLineId,
            [lineId]: { mode: 'range', minGrams, maxGrams },
          },
        };
        const validation = validateConstraintSet(selectCanonicalDraft().input, candidateSet);
        const lineIssues = validation.issues.filter(
          (issue) => issue.lineId === lineId && issue.severity === 'error',
        );
        if (lineIssues.length > 0) return { ok: false, issues: lineIssues };
        set({ constraints: candidateSet, ...CLEAR_STAGED });
        recipe.setRangeLock(lineId, minGrams, maxGrams);
        return { ok: true, issues: [] };
      },

      clearConstraint: (lineId) => {
        const existing = get().constraints.byLineId[lineId];
        if (existing === undefined) return;
        set({
          constraints: { byLineId: withoutLine(get().constraints.byLineId, lineId) },
          ...CLEAR_STAGED,
        });
        const recipe = useRecipeStore.getState();
        if (existing.mode === 'percent') {
          recipe.setPercentLock(lineId, null);
        } else if (existing.mode === 'range') {
          recipe.clearRangeLock(lineId);
        } else if (existing.mode === 'locked') {
          recipe.setGramLock(lineId, null);
        } else {
          recipe.bumpDraftRevision(); // Phase 3: a §17 edit is a material edit
        }
      },

      onLineLockTypeChanged: (lineId, lockType) => {
        const existing = get().constraints.byLineId[lineId];
        if (existing === undefined || existing.mode === 'ai') return;
        if (lockType === 'grams' || lockType === 'percent' || ENGINE_KEPT_LOCKS.has(lockType))
          return;
        // Conscious dropdown override → the §17 constraint is dropped with it.
        set({
          constraints: { byLineId: withoutLine(get().constraints.byLineId, lineId) },
          ...CLEAR_STAGED,
        });
        const recipe = useRecipeStore.getState();
        if (existing.mode === 'locked') recipe.setGramLock(lineId, null);
        else if (existing.mode === 'percent') recipe.setPercentLock(lineId, null);
        else if (existing.mode === 'range') recipe.clearRangeLock(lineId);
        else recipe.bumpDraftRevision(); // Phase 3: material edit
      },

      reconcile: () => {
        const recipe = useRecipeStore.getState();
        const reconciled = reconcileConstraints(
          recipe.items,
          get().constraints,
          recipe.target_batch_grams,
        );
        if (reconciled !== get().constraints) set({ constraints: reconciled });
      },

      resetDraftSession: () =>
        set({
          constraints: reconcileConstraints(
            useRecipeStore.getState().items,
            { byLineId: {} },
            useRecipeStore.getState().target_batch_grams,
          ),
          history: [],
          ...CLEAR_STAGED,
        }),

      createOptimizePreview: (proposalSnapshots, prebuilt) => {
        get().reconcile();
        // A new run owns one terminal result. Old Preview/issue/Undo evidence
        // cannot coexist with it or be mistaken for this run's outcome.
        set({ history: [], ...CLEAR_STAGED });
        // THE canonical draft (owner P0 NIGHTLY FAILURE 1): recipe input + §17
        // constraints + exclusions composed by the ONE selector — the preview is
        // stamped with the draft revision it was built for.
        const draft = selectCanonicalDraft();
        const recipeState = useRecipeStore.getState();
        const stabilizerSystem = assessOwnerStabilizerSystem(draft.input);
        const stabilizerIssue = stabilizerSystem.issues[0];
        if (
          stabilizerIssue &&
          stabilizerIssue.lineIds.some((lineId) => {
            const constraint = draft.constraints.byLineId[lineId];
            return constraint !== undefined && constraint.mode !== 'ai';
          })
        ) {
          const onlyLineId =
            stabilizerSystem.lineIds.length === 1 ? stabilizerSystem.lineIds[0]! : null;
          const onlyLine = onlyLineId
            ? draft.input.items.find((item) => item.id === onlyLineId)
            : undefined;
          const currentConstraint = onlyLineId ? draft.constraints.byLineId[onlyLineId] : undefined;
          const boundary =
            stabilizerIssue.code === 'aggregate_above_maximum'
              ? {
                  type: 'set_max' as const,
                  grams: stabilizerIssue.maxGrams,
                  label: 'maximum' as const,
                }
              : stabilizerIssue.code === 'aggregate_below_minimum'
                ? {
                    type: 'set_min' as const,
                    grams: stabilizerIssue.minGrams,
                    label: 'minimum' as const,
                  }
                : null;
          if (
            boundary &&
            onlyLineId &&
            onlyLine?.actual_grams === null &&
            currentConstraint !== undefined &&
            currentConstraint.mode !== 'ai' &&
            stageLockedConstraintFixPreview({
              draft,
              fix: { type: boundary.type, lineId: onlyLineId, grams: boundary.grams },
              ingredientName: onlyLine.ingredient.name,
              beforeGrams: onlyLine.planned_grams,
              boundary: boundary.label,
              reason: 'product_dosage',
              baseSnapshots: recipeState.productBehaviorSnapshots,
              proposedSnapshots: proposalSnapshots,
              technicalOnlyMainLineIds: recipeState.ownerReviewGate?.technicalOnlyMainLineIds ?? [],
            })
          ) {
            return;
          }
          set({
            preview: null,
            directionBestCandidate: null,
            directionConsent: null,
            substitutionConsent: null,
            substitutionAuthorization: null,
            proposalProductBehaviorAuthorization: null,
            blocked: null,
            previewIssue: {
              ok: false,
              code: 'product_behavior_invalid',
              violations: [
                {
                  code: 'product_dosage_violation',
                  lineIds: stabilizerIssue.lineIds,
                  messagePl: stabilizerIssue.messagePl,
                },
              ],
              messagePl: stabilizerIssue.messagePl,
            },
            recalculationTerminal: {
              state: 'BLOCKED_WITH_EXACT_ACTION',
              code: 'product_behavior_invalid',
              messagePl: stabilizerIssue.messagePl,
              action: 'return_to_recipe',
            },
          });
          return;
        }
        const missingProductDose = missingPickerDosePreviewIssue(draft.input);
        if (missingProductDose) {
          set({
            preview: null,
            directionBestCandidate: null,
            directionConsent: null,
            substitutionConsent: null,
            substitutionAuthorization: null,
            blocked: null,
            previewIssue: missingProductDose,
            recalculationTerminal: {
              state: 'PRODUCT_GRAMS_REQUIRED',
              code: 'missing_required_role',
              lineIds: missingProductDose.lineIds ?? [],
            },
          });
          return;
        }
        const unavailable = unavailableLineName(draft);
        if (unavailable) {
          set({
            preview: null,
            directionBestCandidate: null,
            directionConsent: null,
            substitutionConsent: null,
            substitutionAuthorization: null,
            blocked: null,
            previewIssue: {
              ok: false,
              code: 'substitution_invalid',
              reasons: ['unavailable_ingredient_present'],
              messagePl: `${unavailable} jest oznaczony jako niedostępny. Wybierz zamiennik albo usuń linię.`,
            },
            recalculationTerminal: {
              state: 'BLOCKED_WITH_EXACT_ACTION',
              code: 'substitution_invalid',
            },
          });
          return;
        }
        const snapshots = recipeState.productBehaviorSnapshots;
        const technicalOnlyMainLineIds =
          recipeState.ownerReviewGate?.technicalOnlyMainLineIds ?? [];
        const proposedAuthority = proposalSnapshots ?? snapshots;
        const optimizeOptions = {
          excludedIngredientIds: draft.excludedIngredientIds,
          unavailableMainIngredientIds: draft.unavailableMainIngredientIds,
          effectivePriceOverrides: useCustomerPriceStore.getState().overridesByCanonicalId,
          requirePracticalPreview: true,
          productBehaviorSnapshots: snapshots,
          technicalOnlyMainLineIds,
        };
        const optimizeCreatedAt = prebuilt?.createdAt ?? nowIso();
        const result = bindProductBehaviorToPreview(
          prebuilt?.result ??
            buildOptimizePreview(
              draft.input,
              draft.constraints,
              optimizeCreatedAt,
              optimizeOptions,
            ),
          proposedAuthority,
          snapshots,
          technicalOnlyMainLineIds,
        );
        // Rescue receives every genuine solver-exhaustion state, not only an
        // unreached Direction target. The advisor itself decides between a
        // Direction trigger and an operational hard-band trigger, simulates
        // only approved absent ingredients and returns null without material
        // evidence. Pure simulation; it never adds a line to the draft.
        const rescueAdviceFor = (bestCurrent: ConstraintPreview | null) =>
          prebuilt
            ? prebuilt.rescueAdvice
            : assessRescueIngredientAdvice({
                input: draft.input,
                set: draft.constraints,
                createdAt: optimizeCreatedAt,
                options: optimizeOptions,
                bestCurrent,
              });
        const proposalProductBehaviorAuthorization =
          proposalSnapshots && result.ok
            ? {
                baseFingerprint: result.preview.baseFingerprint,
                proposedFingerprint: workingStateFingerprint(
                  result.preview.proposedInput,
                  result.preview.nextConstraints,
                ),
                baseProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(snapshots),
                proposedProductBehaviorFingerprint:
                  productBehaviorSnapshotFingerprint(proposalSnapshots),
                snapshots: structuredClone(
                  Object.fromEntries(
                    Object.entries(proposalSnapshots).filter(
                      (entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined,
                    ),
                  ),
                ),
              }
            : null;
        const lockRecovery = impossibleConstraintLockRecovery(result, draft.input);
        if (
          lockRecovery !== null &&
          stageLockedConstraintFixPreview({
            draft,
            ...lockRecovery,
            boundary: 'maximum',
            reason: 'constraint_feasibility',
            baseSnapshots: recipeState.productBehaviorSnapshots,
            proposedSnapshots: proposalSnapshots,
            technicalOnlyMainLineIds: recipeState.ownerReviewGate?.technicalOnlyMainLineIds ?? [],
          })
        )
          return;
        if (
          result.ok &&
          result.preview.diagnosticOnly !== true &&
          !optimizePreviewRequiresApply(result.preview, draft.constraints, draft.input)
        ) {
          useRecipeProfileStore.getState().acknowledgeRecalculation();
          set({
            preview: null,
            directionBestCandidate: null,
            rescueAdvice: null,
            directionConsent: null,
            substitutionConsent: null,
            substitutionAuthorization: null,
            proposalProductBehaviorAuthorization: null,
            previewIssue: { ok: false, code: 'already_clean' },
            blocked: null,
            recalculationTerminal: { state: 'NO_CHANGE_NEEDED' },
          });
        } else if (result.ok) {
          result.preview.baseDraftRevision = draft.revision;
          const direction = result.preview.directionAssessment;
          const needsConsent =
            result.preview.diagnosticOnly !== true &&
            direction?.active === true &&
            direction.supportedAxisCount > 0 &&
            !direction.reached;
          set(
            needsConsent
              ? {
                  preview: null,
                  directionBestCandidate: result.preview,
                  rescueAdvice: rescueAdviceFor(result.preview),
                  directionConsent: null,
                  substitutionConsent: null,
                  substitutionAuthorization: null,
                  proposalProductBehaviorAuthorization,
                  previewIssue: null,
                  blocked: null,
                  recalculationTerminal: { state: 'PREVIEW_READY' },
                }
              : {
                  preview: result.preview,
                  directionBestCandidate: null,
                  rescueAdvice:
                    result.preview.diagnosticOnly === true ? rescueAdviceFor(result.preview) : null,
                  directionConsent: null,
                  substitutionConsent: null,
                  substitutionAuthorization: null,
                  proposalProductBehaviorAuthorization,
                  previewIssue: null,
                  blocked: null,
                  recalculationTerminal: { state: 'PREVIEW_READY' },
                },
          );
        } else {
          if (result.code === 'already_clean' || result.code === 'best_safe_result') {
            useRecipeProfileStore.getState().acknowledgeRecalculation();
          }
          set({
            preview: null,
            directionBestCandidate: null,
            rescueAdvice:
              result.code === 'no_proposal' || result.code === 'unsafe_proposal'
                ? rescueAdviceFor(null)
                : null,
            directionConsent: null,
            substitutionConsent: null,
            substitutionAuthorization: null,
            proposalProductBehaviorAuthorization: null,
            previewIssue: result,
            blocked: null,
            recalculationTerminal:
              result.code === 'already_clean'
                ? { state: 'NO_CHANGE_NEEDED' }
                : result.code === 'best_safe_result'
                  ? { state: 'BEST_ACHIEVABLE' }
                  : result.code === 'impossible_under_constraints'
                    ? { state: 'LOCK_CHANGE_REQUIRED', code: result.code }
                    : { state: 'BLOCKED_WITH_EXACT_ACTION', code: result.code },
          });
        }
      },

      acceptBestDirectionCandidate: () => {
        const candidate = get().directionBestCandidate;
        if (!candidate) return;
        const current = selectCanonicalDraft();
        if (
          workingStateFingerprint(current.input, current.constraints) !== candidate.baseFingerprint
        ) {
          set({ ...CLEAR_STAGED });
          return;
        }
        set({
          preview: candidate,
          directionBestCandidate: null,
          directionConsent: {
            baseFingerprint: candidate.baseFingerprint,
            targetFingerprint: directionTargetFingerprint(current.input),
            candidateFingerprint: workingStateFingerprint(
              candidate.proposedInput,
              candidate.nextConstraints,
            ),
          },
          previewIssue: null,
          blocked: null,
        });
      },

      createExplicitStandardRemovalPreview: (lineId, proposalSnapshots) => {
        get().reconcile();
        const draft = selectCanonicalDraft();
        const recipeState = useRecipeStore.getState();
        const snapshots = recipeState.productBehaviorSnapshots;
        const proposedAuthority =
          proposalSnapshots ??
          Object.fromEntries(
            Object.entries(snapshots).filter(([snapshotLineId]) => snapshotLineId !== lineId),
          );
        const result = bindProductBehaviorToPreview(
          buildExplicitStandardRemovalPreview(draft.input, draft.constraints, lineId, nowIso(), {
            excludedIngredientIds: draft.excludedIngredientIds,
            unavailableMainIngredientIds: draft.unavailableMainIngredientIds,
            effectivePriceOverrides: useCustomerPriceStore.getState().overridesByCanonicalId,
            requirePracticalPreview: true,
            productBehaviorSnapshots: proposedAuthority,
          }),
          proposedAuthority,
          snapshots,
          recipeState.ownerReviewGate?.technicalOnlyMainLineIds ?? [],
        );
        if (!result.ok || !result.preview.explicitStandardRemoval) {
          set({
            ...CLEAR_STAGED,
            previewIssue: result.ok
              ? { ok: false, code: 'unsafe_proposal', violatedMetrics: ['removal_proof_missing'] }
              : result,
            recalculationTerminal: {
              state: 'BLOCKED_WITH_EXACT_ACTION',
              code: result.ok ? 'unsafe_proposal' : result.code,
            },
          });
          return;
        }
        result.preview.baseDraftRevision = draft.revision;
        const proof = result.preview.explicitStandardRemoval;
        const proposedFingerprint = workingStateFingerprint(
          result.preview.proposedInput,
          result.preview.nextConstraints,
        );
        set({
          ...CLEAR_STAGED,
          preview: result.preview,
          proposalProductBehaviorAuthorization: {
            baseFingerprint: result.preview.baseFingerprint,
            proposedFingerprint,
            baseProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(snapshots),
            proposedProductBehaviorFingerprint:
              productBehaviorSnapshotFingerprint(proposedAuthority),
            snapshots: structuredClone(
              Object.fromEntries(
                Object.entries(proposedAuthority).filter(
                  (entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined,
                ),
              ),
            ),
          },
          explicitStandardRemovalConsent: {
            baseFingerprint: result.preview.baseFingerprint,
            proposedFingerprint,
            lineId: proof.lineId,
            canonicalIngredientId: proof.canonicalIngredientId,
            ingredientFingerprint: proof.ingredientFingerprint,
            beforeGrams: proof.beforeGrams,
          },
          recalculationTerminal: { state: 'PREVIEW_READY' },
        });
      },

      createBatchRescalePreview: (newBatchGrams) => {
        get().reconcile();
        const draft = selectCanonicalDraft();
        const recipeState = useRecipeStore.getState();
        const snapshots = recipeState.productBehaviorSnapshots;
        const result = bindProductBehaviorToPreview(
          buildBatchRescalePreview(draft.input, draft.constraints, newBatchGrams, nowIso()),
          snapshots,
          snapshots,
          recipeState.ownerReviewGate?.technicalOnlyMainLineIds ?? [],
        );
        if (result.ok) {
          result.preview.baseDraftRevision = draft.revision;
          set({
            preview: result.preview,
            directionBestCandidate: null,
            directionConsent: null,
            substitutionConsent: null,
            substitutionAuthorization: null,
            proposalProductBehaviorAuthorization: null,
            explicitStandardRemovalConsent: null,
            suggestedFixAuthorization: null,
            previewIssue: null,
            blocked: null,
          });
        } else {
          set({
            preview: null,
            directionBestCandidate: null,
            directionConsent: null,
            substitutionConsent: null,
            substitutionAuthorization: null,
            proposalProductBehaviorAuthorization: null,
            explicitStandardRemovalConsent: null,
            suggestedFixAuthorization: null,
            previewIssue: result,
            blocked: null,
          });
        }
      },

      createSuggestedFixPreview: (fix) => {
        get().reconcile();
        const draft = selectCanonicalDraft();
        const recipeState = useRecipeStore.getState();
        const snapshots = recipeState.productBehaviorSnapshots;
        const result = bindProductBehaviorToPreview(
          buildSuggestedFixPreview(draft.input, draft.constraints, fix, nowIso()),
          snapshots,
          snapshots,
          recipeState.ownerReviewGate?.technicalOnlyMainLineIds ?? [],
        );
        if (result.ok) {
          result.preview.baseDraftRevision = draft.revision;
          set({
            preview: result.preview,
            directionBestCandidate: null,
            directionConsent: null,
            substitutionConsent: null,
            substitutionAuthorization: null,
            proposalProductBehaviorAuthorization: null,
            explicitStandardRemovalConsent: null,
            suggestedFixAuthorization: {
              baseFingerprint: result.preview.baseFingerprint,
              type: fix.type,
              lineId: fix.lineId,
              grams: fix.grams,
            },
            previewIssue: null,
            blocked: null,
          });
        } else {
          set({
            preview: null,
            directionBestCandidate: null,
            directionConsent: null,
            substitutionConsent: null,
            substitutionAuthorization: null,
            proposalProductBehaviorAuthorization: null,
            explicitStandardRemovalConsent: null,
            suggestedFixAuthorization: null,
            previewIssue: result,
            blocked: null,
          });
        }
      },

      createSubstitutionPreview: (
        lineId,
        substitute,
        authorization,
        productBehaviorSnapshot,
        confirmMainIdentity,
        proposalProductBehaviorSnapshots,
      ) => {
        get().reconcile();
        const draft = selectCanonicalDraft();
        const currentLine = draft.input.items.find((item) => item.id === lineId);
        const changesMainIdentity = currentLine?.lock_type === 'main';
        if (changesMainIdentity && !confirmMainIdentity) {
          set({
            preview: null,
            directionBestCandidate: null,
            directionConsent: null,
            substitutionConsent: null,
            substitutionAuthorization: null,
            proposalProductBehaviorAuthorization: null,
            explicitStandardRemovalConsent: null,
            blocked: null,
            previewIssue: {
              ok: false,
              code: 'substitution_invalid',
              reasons: ['main_identity_confirmation_required'],
              messagePl: 'Zamiana składnika Głównego wymaga jawnego potwierdzenia zmiany smaku.',
            },
          });
          return;
        }
        const recipeState = useRecipeStore.getState();
        const snapshots = recipeState.productBehaviorSnapshots;
        const proposedSnapshots = {
          ...snapshots,
          ...proposalProductBehaviorSnapshots,
          [lineId]: { ...productBehaviorSnapshot, lineId },
        };
        const result = bindProductBehaviorToPreview(
          buildSubstitutionPreview(
            draft.input,
            draft.constraints,
            lineId,
            substitute,
            authorization,
            nowIso(),
            {
              excludedIngredientIds: draft.excludedIngredientIds,
              unavailableMainIngredientIds: draft.unavailableMainIngredientIds.filter(
                (id) => id !== currentLine?.ingredient.canonical_ingredient_id,
              ),
              effectivePriceOverrides: useCustomerPriceStore.getState().overridesByCanonicalId,
              productBehaviorSnapshots: proposedSnapshots,
            },
          ),
          proposedSnapshots,
          snapshots,
          recipeState.ownerReviewGate?.technicalOnlyMainLineIds ?? [],
        );
        if (result.ok) {
          result.preview.baseDraftRevision = draft.revision;
          const proof = result.preview.substitution;
          const consent =
            proof?.changesMainIdentity && confirmMainIdentity
              ? {
                  baseFingerprint: result.preview.baseFingerprint,
                  lineId: proof.lineId,
                  fromCanonicalId: proof.fromCanonicalId,
                  toCanonicalId: proof.toCanonicalId,
                }
              : null;
          const sessionAuthorization: SubstitutionSessionAuthorization | null = proof
            ? {
                baseFingerprint: result.preview.baseFingerprint,
                lineId: proof.lineId,
                fromCanonicalId: proof.fromCanonicalId,
                toCanonicalId: proof.toCanonicalId,
                mapperAuthorization: authorization,
                productBehaviorSnapshot: { ...productBehaviorSnapshot, lineId },
                proposalProductBehaviorSnapshots: structuredClone(
                  Object.fromEntries(
                    Object.entries(proposedSnapshots).filter(
                      (entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined,
                    ),
                  ),
                ),
              }
            : null;
          set({
            preview: result.preview,
            directionBestCandidate: null,
            directionConsent: null,
            substitutionConsent: consent,
            substitutionAuthorization: sessionAuthorization,
            proposalProductBehaviorAuthorization: null,
            explicitStandardRemovalConsent: null,
            previewIssue: null,
            blocked: null,
          });
        } else {
          set({
            preview: null,
            directionBestCandidate: null,
            directionConsent: null,
            substitutionConsent: null,
            substitutionAuthorization: null,
            proposalProductBehaviorAuthorization: null,
            explicitStandardRemovalConsent: null,
            previewIssue: result,
            blocked: null,
          });
        }
      },

      cancelPreview: () =>
        set({
          preview: null,
          directionBestCandidate: null,
          directionConsent: null,
          previewIssue: null,
          substitutionConsent: null,
          substitutionAuthorization: null,
          proposalProductBehaviorAuthorization: null,
          explicitStandardRemovalConsent: null,
          suggestedFixAuthorization: null,
          blocked: null,
          recalculationTerminal: null,
        }),

      applyPreview: () => {
        const {
          preview,
          constraints,
          history,
          substitutionConsent,
          substitutionAuthorization,
          proposalProductBehaviorAuthorization,
          explicitStandardRemovalConsent,
          directionConsent,
          suggestedFixAuthorization,
        } = get();
        if (!preview) return;
        const terminalBeforeApply = get().recalculationTerminal;
        const awaitingBeforeApply = useRecipeProfileStore.getState().awaitingRecalculation;
        const practicalAuditBeforeApply = useRecipeStore.getState().practicalRecipeAudit;
        // The Apply gate consumes the SAME canonical draft selector (FAILURE 1) +
        // the monotonic revision (Phase 3) — the door itself re-checks both.
        const draft = selectCanonicalDraft();
        const outcome = commitPreview(
          draft.input,
          constraints,
          preview,
          nowIso(),
          nextChangeId(),
          draft.excludedIngredientIds,
          draft.revision,
          substitutionConsent,
          substitutionAuthorization,
          directionConsent,
          suggestedFixAuthorization,
          useRecipeStore.getState().productBehaviorSnapshots,
          useRecipeStore.getState().ownerReviewGate?.technicalOnlyMainLineIds ?? [],
          proposalProductBehaviorAuthorization,
          explicitStandardRemovalConsent,
          // The door rebuilds the frontier with the same build-only inputs the
          // preview was staged with (see createOptimizePreview).
          {
            effectivePriceOverrides: useCustomerPriceStore.getState().overridesByCanonicalId,
            unavailableMainIngredientIds: draft.unavailableMainIngredientIds,
            requirePracticalPreview: true,
          },
        );
        if (!outcome.ok) {
          // The owner-mandated block: recipe untouched, clear Polish message.
          set({
            blocked: outcome,
            preview: outcome.code === 'stale_preview' ? null : preview,
          });
          return;
        }
        // The ONLY verified recipe write — through the GUARDED atomic store API
        // (owner P0 Apply data integrity): per-line validation, independent batch
        // recompute, atomic write, read-back verification with rollback. A failed
        // write keeps the Preview available for retry and names the exact line.
        const written = useRecipeStore
          .getState()
          .applyVerifiedRecipeInput(
            outcome.verified.input,
            outcome.verified.productBehaviorSnapshots,
          );
        if (!written.ok) {
          set({
            blocked: {
              code: 'unsafe_proposal',
              messagePl:
                written.code === 'invalid_line'
                  ? applyGuardCopy.invalidLine(written.lineName)
                  : written.code === 'batch_mismatch'
                    ? applyGuardCopy.batchMismatch(written.sum, written.target)
                    : written.code === 'recipe_constraint_invalid'
                      ? written.messagePl
                      : applyGuardCopy.writeFailed,
              violationsBefore: 0,
              violationsAfter: 0,
            },
            preview, // retry stays possible
          });
          return;
        }
        const presentation: AppliedPresentationSnapshot | undefined =
          terminalBeforeApply?.state === 'PREVIEW_READY'
            ? {
                scoreSource: 'PREVIEW',
                preview: structuredClone(preview),
                terminal: structuredClone(terminalBeforeApply),
                awaitingRecalculation: awaitingBeforeApply,
                baseFingerprint: workingStateFingerprint(
                  outcome.verified.record.before.input,
                  outcome.verified.record.before.constraints,
                ),
                proposedFingerprint: workingStateFingerprint(
                  outcome.verified.record.after.input,
                  outcome.verified.record.after.constraints,
                ),
                baseProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(
                  outcome.verified.record.before.productBehaviorSnapshots ?? {},
                ),
                proposedProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(
                  outcome.verified.record.after.productBehaviorSnapshots ?? {},
                ),
                substitutionConsent: structuredClone(substitutionConsent),
                substitutionAuthorization: structuredClone(substitutionAuthorization),
                proposalProductBehaviorAuthorization: structuredClone(
                  proposalProductBehaviorAuthorization,
                ),
                explicitStandardRemovalConsent: structuredClone(explicitStandardRemovalConsent),
                directionConsent: structuredClone(directionConsent),
                suggestedFixAuthorization: structuredClone(suggestedFixAuthorization),
              }
            : undefined;
        const appliedInput = selectCanonicalDraft().input;
        const appliedPracticalization = outcome.verified.record.practicalization!;
        const appliedPracticalAudit = readPracticalRecipeAudit(
          attachPracticalRecipeAudit(
            appliedInput,
            appliedPracticalization.exactInput,
            outcome.verified.record.at,
          ),
        )!;
        useRecipeStore.getState().acknowledgePracticalRecipeAudit(appliedPracticalAudit);
        const recordBase: AppliedChangeRecord = {
          ...outcome.verified.record,
          before: {
            ...outcome.verified.record.before,
            practicalRecipeAudit: structuredClone(practicalAuditBeforeApply),
          },
        };
        const record: AppliedChangeRecord = presentation
          ? {
              ...recordBase,
              before: { ...recordBase.before, presentation },
            }
          : recordBase;
        set({
          constraints: outcome.verified.constraints,
          history: [...history, record],
          ...CLEAR_STAGED,
        });
      },

      undoLastApply: () => {
        const { history } = get();
        const last = history[history.length - 1];
        if (!last) return;
        // Undo feasibility reads the SAME canonical draft selector (FAILURE 1).
        if (!isUndoAvailable(last, selectCanonicalDraft().input, get().constraints)) return;
        // Byte-exact restore of the pre-apply snapshot (§19.2/§20.3) through the
        // SAME guarded atomic write. The snapshot may legitimately be off-batch
        // (the pre-formulation draft), so batch equality is not enforced here —
        // the snapshot IS the exact prior truth; line validity still is.
        const snapshot = last.before.input;
        const invalid = snapshot.items.some(
          (item) => !Number.isFinite(item.planned_grams) || item.planned_grams < 0,
        );
        if (invalid) return; // structurally impossible for a §20.1 record; never write garbage
        useRecipeStore.setState((state) => ({
          items: snapshot.items.map((item) => ({ ...item })),
          target_batch_grams: snapshot.target_batch_grams,
          // Owner P0 (complete Undo): exclusions return with the snapshot — no
          // stale excluded IDs survive, no page refresh is ever needed.
          excludedIngredientIds: [...last.before.excludedIngredientIds],
          ...(last.before.productBehaviorSnapshots
            ? { productBehaviorSnapshots: structuredClone(last.before.productBehaviorSnapshots) }
            : {}),
          practicalRecipeAudit: structuredClone(last.before.practicalRecipeAudit ?? null),
          dirty: true,
          // Phase 3: the undo restore is itself a material edit (monotonic).
          draftRevision: state.draftRevision + 1,
        }));
        abortActivePiWorker();
        const generation = (activePiRunGeneration += 1);
        set({
          constraints: last.before.constraints,
          history: history.slice(0, -1),
          ...CLEAR_STAGED,
          recalculationTerminal: { state: 'WORKING' },
        });
        void restoreScorePresentationAfterUndo(last, generation);
      },

      runFeasibility: () => {
        get().reconcile();
        const draft = selectCanonicalDraft();
        set({
          feasibility: analyzeConstraintFeasibility(draft.input, draft.constraints),
          previewIssue: null,
        });
      },

      clearFeasibility: () => set({ feasibility: null }),

      dismissBlocked: () => set({ blocked: null }),

      markProCoreRecipe: (recipeId, versionNumber) =>
        set({ proCoreRecipeId: recipeId, lastSavedVersion: versionNumber }),

      resetForTests: () => set({ ...INITIAL, constraints: { byLineId: {} }, history: [] }),
    }),
    {
      name: 'pinguino-constraints',
      partialize: constraintStudioPersistPartialize as (
        state: ConstraintStudioState,
      ) => ConstraintStudioState,
      /**
       * Rehydration is RECONCILED, never trusted: the persisted §17 entries are
       * matched against the rehydrated recipe lines before the store is readable,
       * so an entry whose line vanished (or whose engine lock was changed away)
       * can never reach a consumer. The recipe store's own persist runs first —
       * this module imports it, so its rehydration has already completed.
       */
      merge: (persisted, current) => {
        const raw = (persisted as Partial<ConstraintStudioState> | undefined)?.constraints;
        const constraints: ConstraintSet =
          raw && typeof raw === 'object' && raw.byLineId ? raw : { byLineId: {} };
        return {
          ...current,
          constraints: reconcileConstraints(
            useRecipeStore.getState().items,
            constraints,
            useRecipeStore.getState().target_batch_grams,
          ),
        };
      },
    },
  ),
);

/* ── store bridge (owner P0 NIGHTLY, live FAILURE 1 — Phase 3 wiring) ────── */

/**
 * THE bridge between the recipe store and the §17 session — wired here in the
 * STORE layer (never in UI files), so EVERY load/preset/reset/edit path is
 * covered whichever surface triggered it:
 *  - `draftContextSeq` change (loadRecipeInput / loadPreset / resetToDemo) →
 *    the §17 session RESETS: a loaded recipe starts a fresh constraint
 *    context — locks/ranges from an earlier session draft never survive;
 *  - `draftRevision` change (ANY material edit) → owner FINAL CLOSURE C3,
 *    both halves of the ONE atomic material-edit transaction:
 *      1. the §17 constraint set is RECONCILED against the CURRENT lines
 *         (entries for removed line ids are dropped) — zustand subscribers
 *         run synchronously inside the recipe store's setState, so by the
 *         time ANY caller observes the edit the constraint half is already
 *         consistent (no async effect, no timeout, no second revision bump);
 *      2. staged state built for the old draft (preview, previewIssue,
 *         feasibility, blocked) is invalidated unless the staged preview
 *         already carries the new revision.
 */
export interface ProductBehaviorAuthorityIssue {
  lineId: string;
  lineName: string;
  reasons: string[];
}

const productBehaviorReasonPl = (reason: string): string => {
  const [rawCode, ...parts] = reason.split(':');
  const code = rawCode ?? reason;
  const parsed = (() => {
    if (code === 'missing_technical_fields') {
      if (parts.length >= 6) {
        const [detail, productId, mapperId, versionId, module, action] = parts;
        return { detail, productId, mapperId, versionId, module, action };
      }
      const [detail, mapperId, versionId, module] = parts;
      return { detail, productId: 'produkt', mapperId, versionId, module, action: '' };
    }
    if (parts.length >= 5) {
      const [productId, mapperId, versionId, module, action] = parts;
      return { detail: '', productId, mapperId, versionId, module, action };
    }
    const [mapperId, versionId, module] = parts;
    return { detail: '', productId: 'produkt', mapperId, versionId, module, action: '' };
  })();
  const exactSubject = `${parsed.productId || 'produkt'} · Mapper ${parsed.mapperId && parsed.mapperId !== 'none' ? parsed.mapperId : 'brak'}${parsed.versionId && parsed.versionId !== 'none' ? ` · wersja ${parsed.versionId}` : ''}${parsed.module ? ` · moduł ${parsed.module}` : ''}`;
  if (code === 'product_rejected')
    return `jawnie odrzucony ${exactSubject}; skontaktuj się z Ownerem`;
  if (code === 'behavior_binding_missing')
    return `brak ProductBehavior binding dla ${exactSubject}; odśwież dane produktu`;
  if (code === 'classification_pending')
    return `klasyfikacja trwa dla ${exactSubject}; poczekaj i kliknij PI ponownie`;
  if (code === 'classification_failed')
    return `klasyfikacja nie powiodła się dla ${exactSubject}; ponów klasyfikację`;
  if (code === 'approved_for_base_false') {
    return `approved_for_base=false dla ${exactSubject}; wybierz produkt zatwierdzony dla Base`;
  }
  if (code === 'approved_for_engines_false') {
    return `approved_for_engines=false dla ${exactSubject}; wybierz produkt zatwierdzony dla Engine`;
  }
  if (code === 'missing_technical_fields') {
    return `brak pól technicznych ${parsed.detail || 'bez listy'} dla ${exactSubject}; uzupełnij wskazane pola`;
  }
  if (code === 'mapper_mapping_missing') {
    return `brak dokładnego mapowania Mapper dla ${exactSubject}; wybierz dokładne powiązanie`;
  }
  if (code === 'profile_not_approved') {
    return `profil nie jest zatwierdzony dla ${exactSubject}; zmień profil lub produkt`;
  }
  if (code === 'main_policy_not_approved') {
    return `brak polityki Main dla ${exactSubject}; użyj Standard lub zatwierdzonego Main`;
  }
  if (code === 'module_permission_missing') {
    return `brak uprawnienia modułu dla ${exactSubject}; wybierz kwalifikowaną wersję`;
  }
  if (code === 'nutrition_facts_missing' || code === 'allergen_facts_missing') {
    const facts =
      code === 'nutrition_facts_missing' ? 'wartości odżywczych' : 'składników i alergenów';
    return `brak ${facts} dla ${exactSubject}; uzupełnij dane etykiety`;
  }
  if (code === 'module_not_eligible') {
    return `${exactSubject} nie jest dostępny; wróć do receptury i wybierz kwalifikowany produkt`;
  }
  if (code === 'behavior_binding_stale' || code === 'behavior_binding_version_stale') {
    return `powiązanie ProductBehavior jest nieaktualne dla ${exactSubject}; odśwież dane produktu`;
  }
  if (code === 'behavior_snapshot_missing_or_unresolved') {
    return `brak aktualnego snapshotu ProductBehavior dla ${exactSubject}; odśwież dane produktu`;
  }
  if (code === 'facts_fingerprint_stale' || code === 'shared_facts_stale') {
    return `fakty produktu zmieniły się dla ${exactSubject}; odśwież dane produktu`;
  }
  if (code === 'taxonomy_version_stale') {
    return `taksonomia produktu zmieniła się dla ${exactSubject}; odśwież dane produktu`;
  }
  if (
    code === 'product_version_stale' ||
    code === 'product_identity_stale' ||
    code === 'catalog_version_identity_mismatch'
  ) {
    return `wersja lub tożsamość produktu zmieniła się dla ${exactSubject}; wybierz aktualną wersję produktu`;
  }
  if (code === 'mapper_mapping_stale' || code === 'mapper_entity_identity_mismatch') {
    return `mapowanie Mapper zmieniło się dla ${exactSubject}; odśwież dokładne powiązanie Mapper`;
  }
  if (code === 'main_policy_stale') {
    return `polityka Main zmieniła się dla ${exactSubject}; odśwież dane produktu i uruchom PI ponownie`;
  }
  return (
    {
      behavior_binding_missing: 'brak aktualnego powiązania zachowania produktu',
      behavior_binding_stale: 'powiązanie zachowania produktu jest nieaktualne',
      behavior_binding_version_stale: 'wersja powiązania zachowania produktu jest nieaktualna',
      facts_fingerprint_stale: 'fakty produktu zmieniły się od ostatniego przeliczenia',
      shared_facts_stale: 'wspólne fakty produktu zmieniły się od ostatniego przeliczenia',
      taxonomy_version_stale: 'klasyfikacja produktu zmieniła się od ostatniego przeliczenia',
      product_version_stale: 'wersja produktu zmieniła się od ostatniego przeliczenia',
      product_identity_stale: 'tożsamość produktu zmieniła się od ostatniego przeliczenia',
      mapper_mapping_stale: 'mapowanie PINGÜINO Base zmieniło się od ostatniego przeliczenia',
      main_policy_stale: 'polityka Main zmieniła się od ostatniego przeliczenia',
      private_price_stale: 'Twoja prywatna cena produktu zmieniła się od ostatniego przeliczenia',
      main_policy_unknown: 'brak zatwierdzonej polityki Main',
      base_technical_authority_missing: 'brak zatwierdzonych danych technicznych Base',
      profile_not_approved: 'produkt nie jest zatwierdzony dla wybranego profilu',
      behavior_snapshot_missing_or_unresolved: 'brak aktualnego snapshotu zachowania',
      behavior_server_validation_unavailable: 'walidacja serwerowa jest chwilowo niedostępna',
      classification_pending: 'klasyfikacja produktu nadal trwa',
      classification_failed: 'klasyfikacja produktu wymaga ponownej weryfikacji',
      context_not_approved: 'produkt nie jest zatwierdzony dla bieżącego profilu i temperatury',
      requested_module_not_eligible: 'produkt nie jest dostępny dla tej operacji',
      legacy_product_reference_unresolved: 'nie udało się odnaleźć aktualnej wersji produktu',
      catalog_version_identity_mismatch:
        'wersja produktu nie pasuje do aktualnej tożsamości katalogowej',
      mapper_entity_identity_mismatch: 'produkt nie pasuje do aktualnej tożsamości PINGÜINO Base',
      recipe_changed_during_validation: 'receptura zmieniła się podczas sprawdzania',
    }[code] ?? reason.replaceAll('_', ' ')
  );
};

const productBehaviorLayerPl = (reason: string): string => {
  const code = reason.split(':')[0] ?? reason;
  if (code === 'approved_for_base_false' || code === 'approved_for_engines_false')
    return 'Mapper approval';
  if (code === 'mapper_mapping_missing') return 'Mapper reference';
  if (code === 'missing_technical_fields') return 'composition';
  if (code === 'nutrition_facts_missing' || code === 'allergen_facts_missing') return 'label facts';
  if (
    code === 'profile_not_approved' ||
    code === 'main_policy_not_approved' ||
    code === 'module_permission_missing' ||
    code === 'module_not_eligible'
  )
    return 'profile eligibility';
  const exact = (
    {
      behavior_binding_missing: 'ProductBehavior binding',
      behavior_binding_stale: 'ProductBehavior binding',
      behavior_binding_version_stale: 'ProductBehavior binding',
      behavior_snapshot_missing_or_unresolved: 'ProductBehavior binding',
      product_version_stale: 'product version',
      product_identity_stale: 'product version',
      legacy_product_reference_unresolved: 'product version',
      catalog_version_identity_mismatch: 'product version',
      base_technical_authority_missing: 'composition',
      facts_fingerprint_stale: 'composition',
      shared_facts_stale: 'composition',
      profile_not_approved: 'profile eligibility',
      context_not_approved: 'profile eligibility',
      requested_module_not_eligible: 'profile eligibility',
      main_policy_unknown: 'profile eligibility',
      main_policy_stale: 'profile eligibility',
    } as Record<string, string>
  )[code];
  if (exact) return exact;
  // Resolver reason vocabularies are versioned. Any Mapper-specific reason
  // remains a Mapper layer instead of leaking an opaque internal code.
  if (reason.includes('mapper')) return 'Mapper reference';
  return productBehaviorReasonPl(reason);
};

export const productBehaviorTerminal = (
  issues: readonly ProductBehaviorAuthorityIssue[],
): RecalculationTerminalState => {
  const reasons = issues.flatMap((issue) => issue.reasons);
  if (
    reasons.length > 0 &&
    reasons.every((reason) => reason === 'behavior_server_validation_unavailable')
  ) {
    return { state: 'BLOCKED_WITH_EXACT_ACTION', code: 'product_behavior_invalid' };
  }
  if (reasons.length > 0 && reasons.every((reason) => reason === 'private_price_stale')) {
    return { state: 'BLOCKED_WITH_EXACT_ACTION', code: 'product_behavior_invalid' };
  }
  if (
    reasons.length > 0 &&
    reasons.every((reason) => reason === 'recipe_changed_during_validation')
  ) {
    return { state: 'BLOCKED_WITH_EXACT_ACTION', code: 'product_behavior_invalid' };
  }
  const mapperMissing = reasons.some((reason) => reason.includes('mapper'));
  return {
    state: mapperMissing ? 'MAPPER_BINDING_REQUIRED' : 'PRODUCT_DATA_REQUIRED',
    code: 'product_behavior_invalid',
    lineIds: [...new Set(issues.map((issue) => issue.lineId))],
  };
};

export function serverBehaviorPreviewIssue(
  issues: readonly ProductBehaviorAuthorityIssue[],
): Extract<BuildPreviewResult, { ok: false; code: 'product_behavior_invalid' }> {
  const names = [...new Set(issues.map((issue) => issue.lineName))];
  const layers = [...new Set(issues.flatMap((issue) => issue.reasons.map(productBehaviorLayerPl)))];
  const detail = issues
    .map((issue) => `${issue.lineName}: ${issue.reasons.map(productBehaviorReasonPl).join(', ')}`)
    .join('; ');
  const priceOnly = issues.every(
    (issue) =>
      issue.reasons.length > 0 && issue.reasons.every((reason) => reason === 'private_price_stale'),
  );
  const recipeChanged = issues.every(
    (issue) =>
      issue.reasons.length > 0 &&
      issue.reasons.every((reason) => reason === 'recipe_changed_during_validation'),
  );
  const action = recipeChanged
    ? 'Uruchom przeliczenie ponownie dla bieżącej receptury.'
    : priceOnly
      ? 'Odśwież prywatne ceny i uruchom przeliczenie ponownie.'
      : 'Odśwież dane produktu albo wybierz jego aktualną wersję.';
  const serverUnavailable = issues.every(
    (issue) =>
      issue.reasons.length > 0 &&
      issue.reasons.every((reason) => reason === 'behavior_server_validation_unavailable'),
  );
  const messagePl = recipeChanged
    ? `Receptura zmieniła się podczas sprawdzania. Brakująca warstwa: bieżąca wersja receptury. ${action}`
    : priceOnly
      ? `Prywatna cena produktu wymaga odświeżenia. Brakująca warstwa: aktualna cena. ${detail}. ${action}`
      : serverUnavailable
        ? `Nie udało się potwierdzić aktualnego powiązania technicznego dla: ${names.join(', ')}. Brakująca warstwa: walidacja serwerowa. ${action}`
        : `Produkt nie spełnia jeszcze bieżącej bramki technicznej:\n${names.join(', ')}.\nWarstwa: ${layers.join(', ')}. ${detail}. ${action}`;
  return {
    ok: false,
    code: 'product_behavior_invalid',
    productBehaviorIssues: issues.map((issue) => ({
      lineId: issue.lineId,
      lineName: issue.lineName,
      reasons: [...issue.reasons],
    })),
    violations: [
      {
        code: 'product_behavior_missing',
        lineIds: issues.map((issue) => issue.lineId),
        messagePl,
      },
    ],
    messagePl,
  };
}

async function currentRecipeAuthorityReady(input: {
  recipe: RecipeInput;
  toppings: readonly RecipeToppingItem[];
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  technicalOnlyMainLineIds?: readonly string[];
}): Promise<
  | { ready: true; snapshots: Record<string, ProductBehaviorSnapshot> }
  | { ready: false; issues: ProductBehaviorAuthorityIssue[] }
> {
  const baseRequired = productBehaviorRequiredLineIds({ items: input.recipe.items });
  const toppingRequired = productBehaviorRequiredLineIds({
    items: [],
    toppings: input.toppings,
  });
  const required = [...new Set([...baseRequired, ...toppingRequired])].sort();
  if (required.length === 0) {
    return {
      ready: true,
      snapshots: Object.fromEntries(
        Object.entries(input.snapshots)
          .filter((entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined)
          .map(([lineId, snapshot]) => [lineId, structuredClone(snapshot)]),
      ),
    };
  }
  try {
    const module =
      normalizeFormulationStrategy(
        input.recipe.goals?.formulation_strategy ?? input.recipe.mode,
      ) === 'eco'
        ? 'ECO'
        : 'OPTIMAL';
    const resolved = await resolveRecipeProposalBehaviorSnapshots({
      recipe: input.recipe,
      toppings: input.toppings,
      snapshots: input.snapshots,
      accountId: useAuthStore.getState().user?.id ?? null,
      module,
      technicalOnlyMainLineIds: input.technicalOnlyMainLineIds,
    });
    if (resolved.unresolvedLineIds.length > 0) {
      return {
        ready: false,
        issues: resolved.unresolvedLineIds.map((lineId) => ({
          lineId,
          lineName:
            input.recipe.items.find((item) => item.id === lineId)?.ingredient.name ??
            input.toppings.find((item) => item.id === lineId)?.ingredient.name ??
            lineId,
          reasons: ['behavior_snapshot_missing_or_unresolved'],
        })),
      };
    }
    const accountId = useAuthStore.getState().user?.id ?? null;
    const baseValidation =
      baseRequired.length === 0
        ? { ready: true, staleLineIds: [] as string[], lines: [] as const }
        : await validateRecipeBehaviorOnServer({
            recipe: input.recipe,
            snapshots: resolved.snapshots,
            module,
            accountId,
            technicalOnlyMainLineIds: input.technicalOnlyMainLineIds,
          });
    const toppingValidation =
      toppingRequired.length === 0
        ? { ready: true, staleLineIds: [] as string[], lines: [] as const }
        : await validateRecipeBehaviorOnServer({
            recipe: { ...input.recipe, items: [] },
            toppings: input.toppings,
            snapshots: resolved.snapshots,
            module: 'TOPPING',
            accountId,
          });
    const staleLineIds = [
      ...new Set([...baseValidation.staleLineIds, ...toppingValidation.staleLineIds]),
    ].sort();
    const validationLines = [...baseValidation.lines, ...toppingValidation.lines];
    return baseValidation.ready && toppingValidation.ready && staleLineIds.length === 0
      ? { ready: true, snapshots: resolved.snapshots }
      : {
          ready: false,
          issues: staleLineIds.map((lineId) => ({
            lineId,
            lineName:
              input.recipe.items.find((item) => item.id === lineId)?.ingredient.name ??
              input.toppings.find((item) => item.id === lineId)?.ingredient.name ??
              lineId,
            reasons: validationLines.find((line) => line.lineId === lineId)?.reasons ?? [
              'behavior_snapshot_missing_or_unresolved',
            ],
          })),
        };
  } catch {
    return {
      ready: false,
      issues: required.map((lineId) => ({
        lineId,
        lineName:
          input.recipe.items.find((item) => item.id === lineId)?.ingredient.name ??
          input.toppings.find((item) => item.id === lineId)?.ingredient.name ??
          lineId,
        reasons: ['behavior_server_validation_unavailable'],
      })),
    };
  }
}

const finishUndoWithCurrentRecipeScore = (
  snapshots: Record<string, ProductBehaviorSnapshot>,
  generation: number,
  revision: number,
) => {
  if (!isCurrentPiRun(generation) || useRecipeStore.getState().draftRevision !== revision) return;
  useRecipeStore.getState().syncProductBehaviorSnapshots(snapshots);
  const current = selectCanonicalDraft();
  if (!isCurrentPiRun(generation) || current.revision !== revision) return;
  // The score remains derived from the restored canonical input. This call is
  // intentionally not stored; it proves the Engine can finish the current
  // recipe calculation before presentation is marked ready.
  calculateRecipe(current.input);
  useRecipeProfileStore.getState().acknowledgeRecalculation();
  useConstraintStudioStore.setState({
    ...CLEAR_STAGED,
    recalculationTerminal: { state: 'NO_CHANGE_NEEDED' },
  });
};

/** Restore the pre-Apply score presentation only when its Preview is still
 * bound to the exact restored input and current server ProductBehavior. A
 * stale Preview is discarded and the real current-recipe score is completed
 * instead; no score number is ever copied between vectors. */
async function restoreScorePresentationAfterUndo(
  record: AppliedChangeRecord,
  generation: number,
): Promise<void> {
  const revision = useRecipeStore.getState().draftRevision;
  const restored = selectCanonicalDraft();
  const presentation = record.before.presentation;
  const recipeState = useRecipeStore.getState();
  const baseValidation = await currentRecipeAuthorityReady({
    recipe: restored.input,
    toppings: recipeState.toppings,
    snapshots: recipeState.productBehaviorSnapshots,
    technicalOnlyMainLineIds: recipeState.ownerReviewGate?.technicalOnlyMainLineIds,
  });
  if (!isCurrentPiRun(generation)) return;
  if (useRecipeStore.getState().draftRevision !== revision) {
    useConstraintStudioStore.setState({
      ...CLEAR_STAGED,
      recalculationTerminal: {
        state: 'BLOCKED_WITH_EXACT_ACTION',
        code: 'product_behavior_invalid',
        messagePl: 'Receptura zmieniła się podczas przywracania wyniku. Przelicz ją ponownie.',
        action: 'return_to_recipe',
      },
    });
    return;
  }
  if (!baseValidation.ready) {
    useConstraintStudioStore.setState({
      ...CLEAR_STAGED,
      recalculationTerminal: productBehaviorTerminal(baseValidation.issues),
    });
    return;
  }

  const restoredFingerprint = workingStateFingerprint(restored.input, restored.constraints);
  const baseBehaviorFingerprint = productBehaviorSnapshotFingerprint(baseValidation.snapshots);
  const previewStructurallyCurrent =
    presentation?.scoreSource === 'PREVIEW' &&
    presentation.terminal.state === 'PREVIEW_READY' &&
    presentation.baseFingerprint === restoredFingerprint &&
    presentation.preview.baseFingerprint === restoredFingerprint &&
    presentation.baseProductBehaviorFingerprint === baseBehaviorFingerprint &&
    workingStateFingerprint(
      presentation.preview.proposedInput,
      presentation.preview.nextConstraints,
    ) === presentation.proposedFingerprint;

  if (!presentation || !previewStructurallyCurrent) {
    finishUndoWithCurrentRecipeScore(baseValidation.snapshots, generation, revision);
    return;
  }

  const proposedValidation = await currentRecipeAuthorityReady({
    recipe: presentation.preview.proposedInput,
    toppings: recipeState.toppings,
    snapshots: record.after.productBehaviorSnapshots ?? {},
    technicalOnlyMainLineIds: recipeState.ownerReviewGate?.technicalOnlyMainLineIds,
  });
  if (!isCurrentPiRun(generation)) return;
  if (useRecipeStore.getState().draftRevision !== revision) {
    useConstraintStudioStore.setState({
      ...CLEAR_STAGED,
      recalculationTerminal: {
        state: 'BLOCKED_WITH_EXACT_ACTION',
        code: 'product_behavior_invalid',
        messagePl: 'Receptura zmieniła się podczas przywracania Preview. Przelicz ją ponownie.',
        action: 'return_to_recipe',
      },
    });
    return;
  }
  if (
    !proposedValidation.ready ||
    productBehaviorSnapshotFingerprint(proposedValidation.snapshots) !==
      presentation.proposedProductBehaviorFingerprint
  ) {
    finishUndoWithCurrentRecipeScore(baseValidation.snapshots, generation, revision);
    return;
  }

  useRecipeStore.getState().syncProductBehaviorSnapshots(baseValidation.snapshots);
  const current = selectCanonicalDraft();
  if (
    !isCurrentPiRun(generation) ||
    current.revision !== revision ||
    workingStateFingerprint(current.input, current.constraints) !== presentation.baseFingerprint
  ) {
    return;
  }
  useConstraintStudioStore.setState({
    ...CLEAR_STAGED,
    preview: {
      ...structuredClone(presentation.preview),
      baseDraftRevision: revision,
      baseFingerprint: presentation.baseFingerprint,
      baseProductBehaviorFingerprint: presentation.baseProductBehaviorFingerprint,
    },
    substitutionConsent: structuredClone(presentation.substitutionConsent),
    substitutionAuthorization: structuredClone(presentation.substitutionAuthorization),
    proposalProductBehaviorAuthorization: structuredClone(
      presentation.proposalProductBehaviorAuthorization,
    ),
    explicitStandardRemovalConsent: structuredClone(presentation.explicitStandardRemovalConsent),
    directionConsent: structuredClone(presentation.directionConsent),
    suggestedFixAuthorization: structuredClone(presentation.suggestedFixAuthorization),
    recalculationTerminal: structuredClone(presentation.terminal),
  });
  if (presentation.awaitingRecalculation) {
    useRecipeProfileStore.getState().markRecalculationRequired();
  } else {
    useRecipeProfileStore.getState().acknowledgeRecalculation();
  }
}

/** Runtime wrapper: every customer-visible Preview rechecks current server
 * authority while pure store actions remain deterministic domain seams. */
export async function createOptimizePreviewWithServerAuthority(
  generation?: number,
  signal?: AbortSignal,
): Promise<void> {
  // The server check is part of the same recalculation run. Clear every prior
  // terminal artefact before waiting so stale Preview/Undo can never coexist
  // with a new result.
  const ownedGeneration = generation ?? beginPiRecalculation();
  if (!isCurrentPiRun(ownedGeneration)) return;
  const draft = selectCanonicalDraft();
  const missingProductDose = missingProductDosePreviewIssue(draft.input);
  if (missingProductDose) {
    useConstraintStudioStore.setState({
      history: [],
      ...CLEAR_STAGED,
      previewIssue: missingProductDose,
      recalculationTerminal: {
        state: 'PRODUCT_GRAMS_REQUIRED',
        code: 'missing_required_role',
        lineIds: missingProductDose.lineIds ?? [],
      },
    });
    return;
  }
  const recipeState = useRecipeStore.getState();
  const snapshots = recipeState.productBehaviorSnapshots;
  const validation = await currentRecipeAuthorityReady({
    recipe: draft.input,
    toppings: recipeState.toppings,
    snapshots,
    technicalOnlyMainLineIds: recipeState.ownerReviewGate?.technicalOnlyMainLineIds,
  });
  if (!isCurrentPiRun(ownedGeneration)) return;
  if (!validation.ready) {
    useConstraintStudioStore.setState({
      history: [],
      ...CLEAR_STAGED,
      previewIssue: serverBehaviorPreviewIssue(validation.issues),
      recalculationTerminal: productBehaviorTerminal(validation.issues),
    });
    return;
  }
  if (useRecipeStore.getState().draftRevision !== draft.revision) {
    useConstraintStudioStore.setState({
      history: [],
      ...CLEAR_STAGED,
      previewIssue: serverBehaviorPreviewIssue(
        draft.input.items.map((item) => ({
          lineId: item.id,
          lineName: item.ingredient.name,
          reasons: ['recipe_changed_during_validation'],
        })),
      ),
      recalculationTerminal: productBehaviorTerminal(
        draft.input.items.map((item) => ({
          lineId: item.id,
          lineName: item.ingredient.name,
          reasons: ['recipe_changed_during_validation'],
        })),
      ),
    });
    return;
  }
  const technicalOnlyMainLineIds = recipeState.ownerReviewGate?.technicalOnlyMainLineIds ?? [];
  const uncorrectableMain = uncorrectableMultiMainAuthorityViolation(
    draft.input,
    validation.snapshots,
    technicalOnlyMainLineIds,
  );
  if (uncorrectableMain) {
    const issue: BuildPreviewResult = {
      ok: false,
      code: 'product_behavior_invalid',
      violations: [uncorrectableMain],
      messagePl: uncorrectableMain.messagePl,
    };
    useConstraintStudioStore.setState({
      history: [],
      ...CLEAR_STAGED,
      previewIssue: issue,
      recalculationTerminal: {
        state: 'BLOCKED_WITH_EXACT_ACTION',
        code: 'product_behavior_invalid',
        messagePl: uncorrectableMain.messagePl,
        action: 'return_to_recipe',
      },
    });
    return;
  }
  const optimizeCreatedAt = nowIso();
  const optimizeOptions = {
    excludedIngredientIds: draft.excludedIngredientIds,
    unavailableMainIngredientIds: draft.unavailableMainIngredientIds,
    effectivePriceOverrides: useCustomerPriceStore.getState().overridesByCanonicalId,
    requirePracticalPreview: true,
    productBehaviorSnapshots: validation.snapshots,
    technicalOnlyMainLineIds,
  };
  let publishedResult: BuildPreviewResult | null = null;
  let deferredRescueAdvice: RescueIngredientAdvice | null | undefined;
  const publishDeferredRescueAdvice = (advice: RescueIngredientAdvice | null): void => {
    if (publishedResult === null) {
      deferredRescueAdvice = advice;
      return;
    }
    if (
      !isCurrentPiRun(ownedGeneration) ||
      useRecipeStore.getState().draftRevision !== draft.revision
    ) {
      return;
    }
    const state = useConstraintStudioStore.getState();
    const samePublishedResult = publishedResult.ok
      ? state.preview?.baseFingerprint === publishedResult.preview.baseFingerprint ||
        state.directionBestCandidate?.baseFingerprint === publishedResult.preview.baseFingerprint
      : state.previewIssue?.code === publishedResult.code;
    if (samePublishedResult) useConstraintStudioStore.setState({ rescueAdvice: advice });
  };
  const computation = await runOptimizePreviewOffMainThread(
    {
      input: draft.input,
      constraints: draft.constraints,
      createdAt: optimizeCreatedAt,
      options: optimizeOptions,
    },
    signal,
    undefined,
    publishDeferredRescueAdvice,
  );
  const rawProposal = computation.result;
  let proposedSnapshots: Record<string, ProductBehaviorSnapshot> | undefined;
  if (rawProposal.ok) {
    const proposedAuthority = await currentRecipeAuthorityReady({
      recipe: rawProposal.preview.proposedInput,
      toppings: recipeState.toppings,
      snapshots: validation.snapshots,
      technicalOnlyMainLineIds,
    });
    if (!isCurrentPiRun(ownedGeneration)) return;
    if (!proposedAuthority.ready) {
      useConstraintStudioStore.setState({
        history: [],
        ...CLEAR_STAGED,
        previewIssue: serverBehaviorPreviewIssue(proposedAuthority.issues),
        recalculationTerminal: productBehaviorTerminal(proposedAuthority.issues),
      });
      return;
    }
    proposedSnapshots = proposedAuthority.snapshots;
  } else {
    const lockRecovery = impossibleConstraintLockRecovery(rawProposal, draft.input);
    const recoveredProposal = lockRecovery
      ? buildSuggestedFixPreview(draft.input, draft.constraints, lockRecovery.fix, nowIso())
      : null;
    if (recoveredProposal?.ok) {
      const proposedAuthority = await currentRecipeAuthorityReady({
        recipe: recoveredProposal.preview.proposedInput,
        toppings: recipeState.toppings,
        snapshots: validation.snapshots,
        technicalOnlyMainLineIds,
      });
      if (!isCurrentPiRun(ownedGeneration)) return;
      if (!proposedAuthority.ready) {
        useConstraintStudioStore.setState({
          history: [],
          ...CLEAR_STAGED,
          previewIssue: serverBehaviorPreviewIssue(proposedAuthority.issues),
          recalculationTerminal: productBehaviorTerminal(proposedAuthority.issues),
        });
        return;
      }
      proposedSnapshots = proposedAuthority.snapshots;
      if (
        !isCurrentPiRun(ownedGeneration) ||
        useRecipeStore.getState().draftRevision !== draft.revision
      ) {
        return;
      }
      useRecipeStore.getState().syncProductBehaviorSnapshots(validation.snapshots);
      if (!isCurrentPiRun(ownedGeneration)) return;
      if (
        lockRecovery !== null &&
        stageLockedConstraintFixPreview({
          draft,
          ...lockRecovery,
          boundary: 'maximum',
          reason: 'constraint_feasibility',
          baseSnapshots: validation.snapshots,
          proposedSnapshots: proposedAuthority.snapshots,
          technicalOnlyMainLineIds,
          prebuilt: recoveredProposal,
        })
      ) {
        return;
      }
    }
  }
  if (
    !isCurrentPiRun(ownedGeneration) ||
    useRecipeStore.getState().draftRevision !== draft.revision
  ) {
    return;
  }
  useRecipeStore.getState().syncProductBehaviorSnapshots(validation.snapshots);
  if (!isCurrentPiRun(ownedGeneration)) return;
  useConstraintStudioStore.getState().createOptimizePreview(proposedSnapshots, {
    ...computation,
    createdAt: optimizeCreatedAt,
  });
  publishedResult = rawProposal;
  if (deferredRescueAdvice !== undefined) {
    publishDeferredRescueAdvice(deferredRescueAdvice);
  }
  if (useConstraintStudioStore.getState().recalculationTerminal?.state !== 'NO_CHANGE_NEEDED') {
    return;
  }
  if (
    !isCurrentPiRun(ownedGeneration) ||
    useRecipeStore.getState().draftRevision !== draft.revision
  ) {
    return;
  }

  // A no-change result has no Apply button, so it cannot inherit the normal
  // Apply pipeline's practical-recipe audit. Recreate that authority only at
  // this server-validated seam and only when the physical whole-gram transform
  // proves that it would leave the current recipe byte-for-byte equivalent.
  const practical = practicalizeRecipeCandidate(
    draft.input,
    draft.constraints,
    flavourHeldLineIds(draft.input),
  );
  if (
    !practical.ok ||
    practicalRecipeInputFingerprint(practical.audit.executableInput) !==
      practicalRecipeInputFingerprint(draft.input)
  ) {
    return;
  }
  const acknowledgedInput = attachPracticalRecipeAudit(
    practical.audit.executableInput,
    practical.audit.exactInput,
    nowIso(),
  );
  const audit = readPracticalRecipeAudit(acknowledgedInput);
  if (!audit || !isCurrentPiRun(ownedGeneration)) return;
  if (useRecipeStore.getState().draftRevision !== draft.revision) return;
  useRecipeStore.getState().acknowledgePracticalRecipeAudit(audit);
}

/** Explicit Standard removal uses the same two-phase authority protocol as
 * ordinary optimization: validate the current draft, build the consented
 * candidate, then resolve and validate every retained or solver-added line
 * before exposing Preview. */
export async function createExplicitStandardRemovalPreviewWithServerAuthority(
  lineId: string,
): Promise<void> {
  const draft = selectCanonicalDraft();
  const recipeState = useRecipeStore.getState();
  const technicalOnlyMainLineIds = recipeState.ownerReviewGate?.technicalOnlyMainLineIds ?? [];
  const baseValidation = await currentRecipeAuthorityReady({
    recipe: draft.input,
    toppings: recipeState.toppings,
    snapshots: recipeState.productBehaviorSnapshots,
    technicalOnlyMainLineIds,
  });
  if (!baseValidation.ready) {
    useConstraintStudioStore.setState({
      ...CLEAR_STAGED,
      previewIssue: serverBehaviorPreviewIssue(baseValidation.issues),
      recalculationTerminal: productBehaviorTerminal(baseValidation.issues),
    });
    return;
  }
  if (useRecipeStore.getState().draftRevision !== draft.revision) return;

  const initialSnapshots = Object.fromEntries(
    Object.entries(baseValidation.snapshots).filter(
      ([snapshotLineId]) => snapshotLineId !== lineId,
    ),
  );
  const raw = buildExplicitStandardRemovalPreview(
    draft.input,
    draft.constraints,
    lineId,
    nowIso(),
    {
      excludedIngredientIds: draft.excludedIngredientIds,
      unavailableMainIngredientIds: draft.unavailableMainIngredientIds,
      effectivePriceOverrides: useCustomerPriceStore.getState().overridesByCanonicalId,
      requirePracticalPreview: true,
      productBehaviorSnapshots: initialSnapshots,
    },
  );
  let proposedSnapshots: Record<string, ProductBehaviorSnapshot> | undefined;
  if (raw.ok) {
    const proposedValidation = await currentRecipeAuthorityReady({
      recipe: raw.preview.proposedInput,
      toppings: recipeState.toppings,
      snapshots: initialSnapshots,
      technicalOnlyMainLineIds,
    });
    if (!proposedValidation.ready) {
      useConstraintStudioStore.setState({
        ...CLEAR_STAGED,
        previewIssue: serverBehaviorPreviewIssue(proposedValidation.issues),
        recalculationTerminal: productBehaviorTerminal(proposedValidation.issues),
      });
      return;
    }
    proposedSnapshots = proposedValidation.snapshots;
  }
  if (useRecipeStore.getState().draftRevision !== draft.revision) return;
  useRecipeStore.getState().syncProductBehaviorSnapshots(baseValidation.snapshots);
  if (useRecipeStore.getState().draftRevision !== draft.revision) return;
  useConstraintStudioStore
    .getState()
    .createExplicitStandardRemovalPreview(lineId, proposedSnapshots);
}

/** React-facing no-stranded-WORKING boundary. Unexpected network/runtime
 * failures become one visible terminal with an exact recovery action. The
 * injectable runner is a test seam; production always uses the authority
 * wrapper above. */
export async function runPiRecalculationWithTerminal(
  run?: () => Promise<void>,
  generation?: number,
  deadlineMs = PI_RECALCULATION_DEADLINE_MS,
): Promise<void> {
  const ownedGeneration = generation ?? beginPiRecalculation();
  const execute =
    run ??
    (() =>
      createOptimizePreviewWithServerAuthority(ownedGeneration, activePiSignal(ownedGeneration)));
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let deadlineTriggered = false;
  try {
    await Promise.race([
      execute(),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          deadlineTriggered = true;
          reject(new PiRecalculationDeadlineError());
          if (isCurrentPiRun(ownedGeneration)) abortActivePiWorker();
        }, deadlineMs);
      }),
    ]);
    if (!isCurrentPiRun(ownedGeneration)) return;
    if (useConstraintStudioStore.getState().recalculationTerminal?.state === 'WORKING') {
      useConstraintStudioStore.setState({
        recalculationTerminal: {
          state: 'ERROR',
          messagePl: 'PI zakończyło przeliczenie bez wyniku. Wróć do receptury i spróbuj ponownie.',
        },
      });
    }
  } catch (error) {
    if (!isCurrentPiRun(ownedGeneration)) return;
    const publishedTerminal = useConstraintStudioStore.getState().recalculationTerminal;
    if (publishedTerminal !== null && publishedTerminal.state !== 'WORKING') {
      // A truthful domain result wins over later worker cleanup, transport
      // rejection, or the watchdog. Invalidate a timed-out generation so its
      // late continuation cannot replace the already-published refusal.
      if (error instanceof PiRecalculationDeadlineError || deadlineTriggered) {
        abortActivePiWorker();
        activePiRunGeneration += 1;
      }
      return;
    }
    if (error instanceof PiRecalculationDeadlineError || deadlineTriggered) {
      // Invalidate this generation without starting another visible run. A late
      // ProductBehavior response can no longer publish into the timed-out UI.
      abortActivePiWorker();
      activePiRunGeneration += 1;
      useConstraintStudioStore.setState({
        preview: null,
        previewIssue: null,
        directionBestCandidate: null,
        blocked: null,
        recalculationTerminal: {
          state: 'TIMEOUT',
          messagePl: 'Nie udało się zakończyć przeliczenia. Twoja receptura nie została zmieniona.',
        },
      });
      return;
    }
    useConstraintStudioStore.setState({
      preview: null,
      previewIssue: null,
      directionBestCandidate: null,
      blocked: null,
      recalculationTerminal: {
        state: 'ERROR',
        messagePl: 'PI nie mogło dokończyć przeliczenia. Wróć do receptury i spróbuj ponownie.',
      },
    });
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
  }
}

class PiRecalculationDeadlineError extends Error {
  constructor() {
    super('PI recalculation deadline exceeded.');
    this.name = 'PiRecalculationDeadlineError';
  }
}

/** Explicit operator-authorized lock release. The action clears only the
 * selected §17 quantity constraint (the Main crown/identity is preserved by
 * `clearConstraint`) and then enters the same server-authority PI pipeline as
 * the normal button. The injectable runner is a focused-test seam. */
export async function unlockConstraintAndRecalculate(
  lineId: string,
  run?: () => Promise<void>,
): Promise<void> {
  useConstraintStudioStore.getState().clearConstraint(lineId);
  await runPiRecalculationWithTerminal(run);
}

export async function createBatchRescalePreviewWithServerAuthority(grams: number): Promise<void> {
  const draft = selectCanonicalDraft();
  const recipeState = useRecipeStore.getState();
  const snapshots = recipeState.productBehaviorSnapshots;
  const validation = await currentRecipeAuthorityReady({
    recipe: draft.input,
    toppings: recipeState.toppings,
    snapshots,
    technicalOnlyMainLineIds: recipeState.ownerReviewGate?.technicalOnlyMainLineIds,
  });
  if (!validation.ready) {
    useConstraintStudioStore.setState({
      preview: null,
      previewIssue: serverBehaviorPreviewIssue(validation.issues),
      blocked: null,
    });
    return;
  }
  useRecipeStore.getState().syncProductBehaviorSnapshots(validation.snapshots);
  if (useRecipeStore.getState().draftRevision !== draft.revision) return;
  useConstraintStudioStore.getState().createBatchRescalePreview(grams);
}

export async function createSuggestedFixPreviewWithServerAuthority(
  fix: SuggestedBoundFix,
): Promise<void> {
  const draft = selectCanonicalDraft();
  const recipeState = useRecipeStore.getState();
  const snapshots = recipeState.productBehaviorSnapshots;
  const validation = await currentRecipeAuthorityReady({
    recipe: draft.input,
    toppings: recipeState.toppings,
    snapshots,
    technicalOnlyMainLineIds: recipeState.ownerReviewGate?.technicalOnlyMainLineIds,
  });
  if (!validation.ready) {
    useConstraintStudioStore.setState({
      preview: null,
      previewIssue: serverBehaviorPreviewIssue(validation.issues),
      blocked: null,
    });
    return;
  }
  useRecipeStore.getState().syncProductBehaviorSnapshots(validation.snapshots);
  if (useRecipeStore.getState().draftRevision !== draft.revision) return;
  useConstraintStudioStore.getState().createSuggestedFixPreview(fix);
}

/** Substitution wrapper that resolves the replacement and every solver-added
 * correction/toolbox line into one immutable proposed authority set. */
export async function createSubstitutionPreviewWithServerAuthority(input: {
  lineId: string;
  substitute: EngineIngredient;
  authorization: SubstituteAuthorization;
  productBehaviorSnapshot: ProductBehaviorSnapshot;
  confirmMainIdentity: boolean;
}): Promise<void> {
  const draft = selectCanonicalDraft();
  const currentSnapshots = useRecipeStore.getState().productBehaviorSnapshots;
  const initialSnapshots = {
    ...currentSnapshots,
    [input.lineId]: { ...input.productBehaviorSnapshot, lineId: input.lineId },
  };
  const raw = buildSubstitutionPreview(
    draft.input,
    draft.constraints,
    input.lineId,
    input.substitute,
    input.authorization,
    nowIso(),
    {
      excludedIngredientIds: draft.excludedIngredientIds,
      unavailableMainIngredientIds: draft.unavailableMainIngredientIds.filter(
        (id) =>
          id !==
          draft.input.items.find((item) => item.id === input.lineId)?.ingredient
            .canonical_ingredient_id,
      ),
      effectivePriceOverrides: useCustomerPriceStore.getState().overridesByCanonicalId,
      productBehaviorSnapshots: initialSnapshots,
    },
  );
  if (!raw.ok) {
    useConstraintStudioStore
      .getState()
      .createSubstitutionPreview(
        input.lineId,
        input.substitute,
        input.authorization,
        input.productBehaviorSnapshot,
        input.confirmMainIdentity,
      );
    return;
  }
  const accountId = useAuthStore.getState().user?.id ?? null;
  const resolved = await resolveRecipeProposalBehaviorSnapshots({
    recipe: raw.preview.proposedInput,
    snapshots: initialSnapshots,
    accountId,
    technicalOnlyMainLineIds: useRecipeStore.getState().ownerReviewGate?.technicalOnlyMainLineIds,
  });
  if (
    resolved.unresolvedLineIds.length > 0 ||
    useRecipeStore.getState().draftRevision !== draft.revision
  ) {
    useConstraintStudioStore.setState({
      preview: null,
      previewIssue: serverBehaviorPreviewIssue(
        resolved.unresolvedLineIds.map((lineId) => ({
          lineId,
          lineName:
            raw.preview.proposedInput.items.find((item) => item.id === lineId)?.ingredient.name ??
            lineId,
          reasons: ['behavior_snapshot_missing_or_unresolved'],
        })),
      ),
      blocked: null,
    });
    return;
  }
  useConstraintStudioStore
    .getState()
    .createSubstitutionPreview(
      input.lineId,
      input.substitute,
      input.authorization,
      input.productBehaviorSnapshot,
      input.confirmMainIdentity,
      resolved.snapshots,
    );
}

/** Terminal Apply wrapper. Stale product authority clears the Preview before
 * the guarded recipe-store write is reached. */
export async function applyPreviewWithServerAuthority(): Promise<void> {
  const session = useConstraintStudioStore.getState();
  const preview = session.preview;
  if (!preview) return;
  const currentSnapshots = useRecipeStore.getState().productBehaviorSnapshots;
  const snapshots = session.proposalProductBehaviorAuthorization
    ? session.proposalProductBehaviorAuthorization.snapshots
    : session.substitutionAuthorization
      ? {
          ...currentSnapshots,
          ...session.substitutionAuthorization.proposalProductBehaviorSnapshots,
          [session.substitutionAuthorization.lineId]:
            session.substitutionAuthorization.productBehaviorSnapshot,
        }
      : currentSnapshots;
  const revision = useRecipeStore.getState().draftRevision;
  const validation = await currentRecipeAuthorityReady({
    recipe: preview.proposedInput,
    toppings: useRecipeStore.getState().toppings,
    snapshots,
    technicalOnlyMainLineIds: useRecipeStore.getState().ownerReviewGate?.technicalOnlyMainLineIds,
  });
  if (
    !validation.ready ||
    useRecipeStore.getState().draftRevision !== revision ||
    useConstraintStudioStore.getState().preview !== preview
  ) {
    useConstraintStudioStore.setState({
      preview: null,
      blocked: {
        code: 'stale_preview',
        messagePl:
          'Apply zablokowany: klasyfikacja produktu zmieniła się. Uruchom ponowne Preview.',
      },
    });
    return;
  }
  if (session.proposalProductBehaviorAuthorization) {
    const refreshedFingerprint = productBehaviorSnapshotFingerprint(validation.snapshots);
    if (
      refreshedFingerprint !==
      session.proposalProductBehaviorAuthorization.proposedProductBehaviorFingerprint
    ) {
      useConstraintStudioStore.setState({
        preview: null,
        blocked: {
          code: 'stale_preview',
          messagePl:
            'Apply zablokowany: klasyfikacja produktu zmieniła się. Uruchom ponowne Preview.',
        },
      });
      return;
    }
  } else {
    useRecipeStore.getState().syncProductBehaviorSnapshots(validation.snapshots);
  }
  useConstraintStudioStore.getState().applyPreview();
}

useRecipeStore.subscribe((state, prev) => {
  if (state.draftContextSeq !== prev.draftContextSeq) {
    useConstraintStudioStore.getState().resetDraftSession();
    return;
  }
  if (state.draftRevision !== prev.draftRevision) {
    const session = useConstraintStudioStore.getState();
    // C3 step 1 — synchronous constraint reconciliation (write-time, not only
    // read-time): a removed line's §17 entry never survives the transaction.
    const reconciled = reconcileConstraints(
      state.items,
      session.constraints,
      state.target_batch_grams,
    );
    const constraintsPatch = reconciled !== session.constraints ? { constraints: reconciled } : {};
    const baseInputChanged =
      workingStateFingerprint(buildRecipeInput(state), reconciled) !==
      workingStateFingerprint(buildRecipeInput(prev), session.constraints);
    const baseIds = new Set(state.items.map((item) => item.id));
    const previousBaseIds = new Set(prev.items.map((item) => item.id));
    const baseBehaviorFingerprint = (source: typeof state, ids: ReadonlySet<string>) =>
      productBehaviorSnapshotFingerprint(
        Object.fromEntries(
          Object.entries(source.productBehaviorSnapshots).filter(([lineId]) => ids.has(lineId)),
        ),
      );
    const baseAuthorityChanged =
      baseBehaviorFingerprint(state, baseIds) !== baseBehaviorFingerprint(prev, previousBaseIds);
    const baseTechnicalChanged = baseInputChanged || baseAuthorityChanged;
    // A topping revision is material for Save/final composition, but it is not
    // a Base Engine edit. Score/Monitor currentness belongs only to the Base
    // technical fingerprint and its Base ProductBehavior authority.
    if (baseTechnicalChanged) {
      useRecipeProfileStore.getState().markRecalculationRequired();
    }
    // C3 step 2 — only a Base technical change invalidates Base Preview/score.
    const previewCurrent = session.preview?.baseDraftRevision === state.draftRevision;
    const stagedPatch =
      baseTechnicalChanged &&
      !previewCurrent &&
      (session.preview !== null ||
        session.directionBestCandidate !== null ||
        session.directionConsent !== null ||
        session.previewIssue !== null ||
        session.feasibility !== null ||
        session.blocked !== null)
        ? { ...CLEAR_STAGED }
        : {};
    if (Object.keys(constraintsPatch).length > 0 || Object.keys(stagedPatch).length > 0) {
      useConstraintStudioStore.setState({ ...constraintsPatch, ...stagedPatch });
    }
  }
});
