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
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EngineIngredient, LockType, RecipeInput, RecipeItem } from '@/engine';
import type { SubstituteAuthorization } from '@/features/ingredient-builder/ingredientTableUx';
import {
  productBehaviorRequiredLineIds,
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
  validateConstraintSet,
  type ConstraintFeasibilityAnalysis,
  type ConstraintSet,
  type ConstraintValidationIssue,
  type IngredientConstraint,
} from '@/features/recipe-constraints';
import { useRecipeStore } from '@/stores/recipeStore';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { constraintStudioCopy } from './constraintStudioCopy';

const applyGuardCopy = constraintStudioCopy.applyGuard;
import {
  buildBatchRescalePreview,
  bindProductBehaviorToPreview,
  buildOptimizePreview,
  buildSubstitutionPreview,
  buildSuggestedFixPreview,
  commitPreview,
  directionTargetFingerprint,
  workingStateFingerprint,
  type AppliedChangeRecord,
  type BlockedApply,
  type BuildPreviewResult,
  type ConstraintPreview,
  type DirectionBestAchievableConsent,
  type SuggestedBoundFix,
  type SuggestedFixSessionAuthorization,
  type SubstitutionConsent,
  type SubstitutionSessionAuthorization,
} from './applyPipeline';

/* ── helpers ─────────────────────────────────────────────────────────────── */

let changeSeq = 0;
const nextChangeId = (): string =>
  `apply-${Date.now().toString(36)}-${(changeSeq += 1).toString(36)}`;
const nowIso = (): string => new Date().toISOString();

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
export type RecalculationTerminalState =
  | { state: 'PREVIEW_READY' }
  | { state: 'NO_CHANGE_NEEDED' }
  | { state: 'BEST_ACHIEVABLE' }
  | { state: 'BLOCKED'; code: PreviewIssue['code'] };

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
  suggestedFixAuthorization: SuggestedFixSessionAuthorization | null;
  /** Candidate is hidden until the user explicitly chooses the compromise. */
  directionBestCandidate: ConstraintPreview | null;
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

  createOptimizePreview: () => void;
  acceptBestDirectionCandidate: () => void;
  createBatchRescalePreview: (newBatchGrams: number) => void;
  createSuggestedFixPreview: (fix: SuggestedBoundFix) => void;
  createSubstitutionPreview: (
    lineId: string,
    substitute: EngineIngredient,
    authorization: SubstituteAuthorization,
    productBehaviorSnapshot: ProductBehaviorSnapshot,
    confirmMainIdentity: boolean,
    proposalProductBehaviorSnapshots?: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
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
  suggestedFixAuthorization: null,
  directionBestCandidate: null,
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
  suggestedFixAuthorization: null,
  directionBestCandidate: null,
  directionConsent: null,
  feasibility: null,
  blocked: null,
  recalculationTerminal: null,
};

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

      createOptimizePreview: () => {
        get().reconcile();
        // A new run owns one terminal result. Old Preview/issue/Undo evidence
        // cannot coexist with it or be mistaken for this run's outcome.
        set({ history: [], ...CLEAR_STAGED });
        // THE canonical draft (owner P0 NIGHTLY FAILURE 1): recipe input + §17
        // constraints + exclusions composed by the ONE selector — the preview is
        // stamped with the draft revision it was built for.
        const draft = selectCanonicalDraft();
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
            recalculationTerminal: { state: 'BLOCKED', code: 'substitution_invalid' },
          });
          return;
        }
        const snapshots = useRecipeStore.getState().productBehaviorSnapshots;
        const result = bindProductBehaviorToPreview(buildOptimizePreview(draft.input, draft.constraints, nowIso(), {
          excludedIngredientIds: draft.excludedIngredientIds,
          unavailableMainIngredientIds: draft.unavailableMainIngredientIds,
          effectivePriceOverrides: useCustomerPriceStore.getState().overridesByCanonicalId,
          requirePracticalPreview: true,
          productBehaviorSnapshots: snapshots,
        }), snapshots);
        if (result.ok) {
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
                  directionConsent: null,
                  substitutionConsent: null,
                  substitutionAuthorization: null,
                  previewIssue: null,
                  blocked: null,
                  recalculationTerminal: { state: 'PREVIEW_READY' },
                }
              : {
                  preview: result.preview,
                  directionBestCandidate: null,
                  directionConsent: null,
                  substitutionConsent: null,
                  substitutionAuthorization: null,
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
            directionConsent: null,
            substitutionConsent: null,
            substitutionAuthorization: null,
            previewIssue: result,
            blocked: null,
            recalculationTerminal:
              result.code === 'already_clean'
                ? { state: 'NO_CHANGE_NEEDED' }
                : result.code === 'best_safe_result'
                  ? { state: 'BEST_ACHIEVABLE' }
                  : { state: 'BLOCKED', code: result.code },
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

      createBatchRescalePreview: (newBatchGrams) => {
        get().reconcile();
        const draft = selectCanonicalDraft();
        const snapshots = useRecipeStore.getState().productBehaviorSnapshots;
        const result = bindProductBehaviorToPreview(buildBatchRescalePreview(
          draft.input,
          draft.constraints,
          newBatchGrams,
          nowIso(),
        ), snapshots);
        if (result.ok) {
          result.preview.baseDraftRevision = draft.revision;
          set({
            preview: result.preview,
            directionBestCandidate: null,
            directionConsent: null,
            substitutionConsent: null,
            substitutionAuthorization: null,
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
            suggestedFixAuthorization: null,
            previewIssue: result,
            blocked: null,
          });
        }
      },

      createSuggestedFixPreview: (fix) => {
        get().reconcile();
        const draft = selectCanonicalDraft();
        const snapshots = useRecipeStore.getState().productBehaviorSnapshots;
        const result = bindProductBehaviorToPreview(
          buildSuggestedFixPreview(draft.input, draft.constraints, fix, nowIso()),
          snapshots,
        );
        if (result.ok) {
          result.preview.baseDraftRevision = draft.revision;
          set({
            preview: result.preview,
            directionBestCandidate: null,
            directionConsent: null,
            substitutionConsent: null,
            substitutionAuthorization: null,
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
        const snapshots = useRecipeStore.getState().productBehaviorSnapshots;
        const proposedSnapshots = {
          ...snapshots,
          ...proposalProductBehaviorSnapshots,
          [lineId]: { ...productBehaviorSnapshot, lineId },
        };
        const result = bindProductBehaviorToPreview(buildSubstitutionPreview(
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
        ), proposedSnapshots, snapshots);
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
          directionConsent,
          suggestedFixAuthorization,
        } = get();
        if (!preview) return;
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
        const written = useRecipeStore.getState().applyVerifiedRecipeInput(
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
                    : applyGuardCopy.writeFailed,
              violationsBefore: 0,
              violationsAfter: 0,
            },
            preview, // retry stays possible
          });
          return;
        }
        set({
          constraints: outcome.verified.constraints,
          history: [...history, outcome.verified.record],
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
          // Phase 3: the undo restore is itself a material edit (monotonic).
          draftRevision: state.draftRevision + 1,
        }));
        set({
          constraints: last.before.constraints,
          history: history.slice(0, -1),
          ...CLEAR_STAGED,
        });
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
interface ProductBehaviorAuthorityIssue {
  lineId: string;
  lineName: string;
  reasons: string[];
}

const productBehaviorReasonPl = (reason: string): string => ({
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
  process_evidence_missing: 'brak wymaganego dowodu procesu',
  behavior_snapshot_missing_or_unresolved: 'brak aktualnego snapshotu zachowania',
  behavior_server_validation_unavailable: 'walidacja serwerowa jest chwilowo niedostępna',
  classification_pending: 'klasyfikacja produktu nadal trwa',
  classification_failed: 'klasyfikacja produktu wymaga ponownej weryfikacji',
  context_not_approved: 'produkt nie jest zatwierdzony dla bieżącego profilu i temperatury',
  requested_module_not_eligible: 'produkt nie jest dostępny dla tej operacji',
  legacy_product_reference_unresolved: 'nie udało się odnaleźć aktualnej wersji produktu',
  catalog_version_identity_mismatch: 'wersja produktu nie pasuje do aktualnej tożsamości katalogowej',
  mapper_entity_identity_mismatch: 'produkt nie pasuje do aktualnej tożsamości PINGÜINO Base',
  recipe_changed_during_validation: 'receptura zmieniła się podczas sprawdzania',
}[reason] ?? reason.replaceAll('_', ' '));

function serverBehaviorPreviewIssue(
  issues: readonly ProductBehaviorAuthorityIssue[],
): Extract<BuildPreviewResult, { ok: false; code: 'product_behavior_invalid' }> {
  const detail = issues.map((issue) =>
    `${issue.lineName}: ${issue.reasons.map(productBehaviorReasonPl).join(', ')}`,
  ).join('; ');
  const priceOnly = issues.every((issue) =>
    issue.reasons.length > 0 && issue.reasons.every((reason) => reason === 'private_price_stale'),
  );
  const recipeChanged = issues.every((issue) =>
    issue.reasons.length > 0
      && issue.reasons.every((reason) => reason === 'recipe_changed_during_validation'),
  );
  const action = recipeChanged
    ? 'Uruchom przeliczenie ponownie dla bieżącej receptury.'
    : priceOnly
      ? 'Odśwież prywatne ceny i uruchom przeliczenie ponownie.'
      : 'Odśwież dane produktu albo wybierz jego aktualną, zatwierdzoną wersję.';
  const messagePl = `Nie można przeliczyć receptury. ${detail}. ${action}`;
  return {
    ok: false,
    code: 'product_behavior_invalid',
    violations: [{
      code: 'product_behavior_missing',
      lineIds: issues.map((issue) => issue.lineId),
      messagePl,
    }],
    messagePl,
  };
}

async function currentBaseAuthorityReady(input: {
  recipe: RecipeInput;
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
}): Promise<
  | { ready: true; snapshots: Record<string, ProductBehaviorSnapshot> }
  | { ready: false; issues: ProductBehaviorAuthorityIssue[] }
> {
  const required = productBehaviorRequiredLineIds({ items: input.recipe.items });
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
    const module = normalizeFormulationStrategy(
      input.recipe.goals?.formulation_strategy ?? input.recipe.mode,
    ) === 'eco' ? 'ECO' : 'OPTIMAL';
    const resolved = await resolveRecipeProposalBehaviorSnapshots({
      recipe: input.recipe,
      snapshots: input.snapshots,
      accountId: useAuthStore.getState().user?.id ?? null,
      module,
    });
    if (resolved.unresolvedLineIds.length > 0) {
      return {
        ready: false,
        issues: resolved.unresolvedLineIds.map((lineId) => ({
          lineId,
          lineName: input.recipe.items.find((item) => item.id === lineId)?.ingredient.name ?? lineId,
          reasons: ['behavior_snapshot_missing_or_unresolved'],
        })),
      };
    }
    const validation = await validateRecipeBehaviorOnServer({
      recipe: input.recipe,
      snapshots: resolved.snapshots,
      module,
      accountId: useAuthStore.getState().user?.id ?? null,
    });
    return validation.ready
      ? { ready: true, snapshots: resolved.snapshots }
      : {
          ready: false,
          issues: validation.staleLineIds.map((lineId) => ({
            lineId,
            lineName: input.recipe.items.find((item) => item.id === lineId)?.ingredient.name ?? lineId,
            reasons: validation.lines.find((line) => line.lineId === lineId)?.reasons
              ?? ['behavior_snapshot_missing_or_unresolved'],
          })),
        };
  } catch {
    return {
      ready: false,
      issues: required.map((lineId) => ({
        lineId,
        lineName: input.recipe.items.find((item) => item.id === lineId)?.ingredient.name ?? lineId,
        reasons: ['behavior_server_validation_unavailable'],
      })),
    };
  }
}

/** Runtime wrapper: every customer-visible Preview rechecks current server
 * authority while pure store actions remain deterministic domain seams. */
export async function createOptimizePreviewWithServerAuthority(): Promise<void> {
  // The server check is part of the same recalculation run. Clear every prior
  // terminal artefact before waiting so stale Preview/Undo can never coexist
  // with a new result.
  useRecipeProfileStore.getState().markRecalculationRequired();
  useConstraintStudioStore.setState({ history: [], ...CLEAR_STAGED });
  const draft = selectCanonicalDraft();
  const snapshots = useRecipeStore.getState().productBehaviorSnapshots;
  const validation = await currentBaseAuthorityReady({ recipe: draft.input, snapshots });
  if (!validation.ready) {
    useConstraintStudioStore.setState({
      history: [],
      ...CLEAR_STAGED,
      previewIssue: serverBehaviorPreviewIssue(validation.issues),
      recalculationTerminal: { state: 'BLOCKED', code: 'product_behavior_invalid' },
    });
    return;
  }
  if (useRecipeStore.getState().draftRevision !== draft.revision) {
    useConstraintStudioStore.setState({
      history: [],
      ...CLEAR_STAGED,
      previewIssue: serverBehaviorPreviewIssue(draft.input.items.map((item) => ({
        lineId: item.id,
        lineName: item.ingredient.name,
        reasons: ['recipe_changed_during_validation'],
      }))),
      recalculationTerminal: { state: 'BLOCKED', code: 'product_behavior_invalid' },
    });
    return;
  }
  useRecipeStore.getState().syncProductBehaviorSnapshots(validation.snapshots);
  useConstraintStudioStore.getState().createOptimizePreview();
}

export async function createBatchRescalePreviewWithServerAuthority(
  grams: number,
): Promise<void> {
  const draft = selectCanonicalDraft();
  const snapshots = useRecipeStore.getState().productBehaviorSnapshots;
  const validation = await currentBaseAuthorityReady({ recipe: draft.input, snapshots });
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
  const snapshots = useRecipeStore.getState().productBehaviorSnapshots;
  const validation = await currentBaseAuthorityReady({ recipe: draft.input, snapshots });
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
        (id) => id !== draft.input.items.find((item) => item.id === input.lineId)
          ?.ingredient.canonical_ingredient_id,
      ),
      effectivePriceOverrides: useCustomerPriceStore.getState().overridesByCanonicalId,
      productBehaviorSnapshots: initialSnapshots,
    },
  );
  if (!raw.ok) {
    useConstraintStudioStore.getState().createSubstitutionPreview(
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
  });
  if (
    resolved.unresolvedLineIds.length > 0 ||
    useRecipeStore.getState().draftRevision !== draft.revision
  ) {
    useConstraintStudioStore.setState({
      preview: null,
      previewIssue: serverBehaviorPreviewIssue(resolved.unresolvedLineIds.map((lineId) => ({
        lineId,
        lineName: raw.preview.proposedInput.items.find((item) => item.id === lineId)?.ingredient.name ?? lineId,
        reasons: ['behavior_snapshot_missing_or_unresolved'],
      }))),
      blocked: null,
    });
    return;
  }
  useConstraintStudioStore.getState().createSubstitutionPreview(
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
  const snapshots = session.substitutionAuthorization
    ? {
        ...currentSnapshots,
        ...session.substitutionAuthorization.proposalProductBehaviorSnapshots,
        [session.substitutionAuthorization.lineId]:
          session.substitutionAuthorization.productBehaviorSnapshot,
      }
    : currentSnapshots;
  const revision = useRecipeStore.getState().draftRevision;
  const validation = await currentBaseAuthorityReady({
    recipe: preview.proposedInput,
    snapshots,
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
        messagePl: 'Apply zablokowany: klasyfikacja produktu zmieniła się. Uruchom ponowne Preview.',
      },
    });
    return;
  }
  useRecipeStore.getState().syncProductBehaviorSnapshots(validation.snapshots);
  useConstraintStudioStore.getState().applyPreview();
}

useRecipeStore.subscribe((state, prev) => {
  if (state.draftContextSeq !== prev.draftContextSeq) {
    useConstraintStudioStore.getState().resetDraftSession();
    return;
  }
  if (state.draftRevision !== prev.draftRevision) {
    // One draft revision is the universal material-change signal. Ingredient
    // add/remove, grams, locks, profile/context and product-authority changes all
    // invalidate the previously displayed score immediately. A verified Apply
    // acknowledges this synchronously after its own revision write.
    useRecipeProfileStore.getState().markRecalculationRequired();
    const session = useConstraintStudioStore.getState();
    // C3 step 1 — synchronous constraint reconciliation (write-time, not only
    // read-time): a removed line's §17 entry never survives the transaction.
    const reconciled = reconcileConstraints(
      state.items,
      session.constraints,
      state.target_batch_grams,
    );
    const constraintsPatch = reconciled !== session.constraints ? { constraints: reconciled } : {};
    // C3 step 2 — staged-state invalidation (unchanged semantics).
    const previewCurrent = session.preview?.baseDraftRevision === state.draftRevision;
    const stagedPatch =
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
