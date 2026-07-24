/**
 * Constraint Studio session store (SPEC §17–§20) — constraints, the pending
 * preview, the §20 history and the blocked-apply notice. NOT persisted:
 * §19's Preview/Apply live in working memory; durable history is the
 * pro-core save→version path (see ui/SaveVersionControl).
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
import type { LockType, RecipeInput, RecipeItem } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  analyzeConstraintFeasibility,
  validateConstraintSet,
  type ConstraintFeasibilityAnalysis,
  type ConstraintSet,
  type ConstraintValidationIssue,
  type IngredientConstraint,
} from '@/features/recipe-constraints';
import { useRecipeStore } from '@/stores/recipeStore';
import { constraintStudioCopy } from './constraintStudioCopy';

const applyGuardCopy = constraintStudioCopy.applyGuard;
import {
  buildBatchRescalePreview,
  buildOptimizePreview,
  buildSuggestedFixPreview,
  commitPreview,
  workingStateFingerprint,
  type AppliedChangeRecord,
  type BlockedApply,
  type BuildPreviewResult,
  type ConstraintPreview,
  type SuggestedBoundFix,
} from './applyPipeline';

/* ── helpers ─────────────────────────────────────────────────────────────── */

let changeSeq = 0;
const nextChangeId = (): string => `apply-${Date.now().toString(36)}-${(changeSeq += 1).toString(36)}`;
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
    constraints: reconcileConstraints(recipe.items, session.constraints),
    excludedIngredientIds: recipe.excludedIngredientIds,
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
      item.ingredient.id,
      item.planned_grams,
      item.actual_grams,
      item.lock_type,
    ]),
    byLineId: draft.constraints.byLineId,
    exclusions: [...draft.excludedIngredientIds],
    batch: draft.input.target_batch_grams,
    category: draft.input.category,
    temperature: draft.input.target_temperature_c,
    tier: draft.input.mode,
    machineCapacity: draft.input.machine_capacity_grams,
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

/**
 * Effective constraints for a set of recipe lines: entries whose line vanished
 * are dropped, and a locked/range entry whose engine lock was manually changed
 * away (lock dropdown) is treated as a conscious user override and dropped.
 */
export function reconcileConstraints(items: readonly RecipeItem[], set: ConstraintSet): ConstraintSet {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const byLineId: Record<string, IngredientConstraint> = {};
  let dropped = false;
  for (const [lineId, constraint] of Object.entries(set.byLineId)) {
    const item = itemById.get(lineId);
    if (!item) {
      dropped = true;
      continue;
    }
    if (
      constraint.mode !== 'ai' &&
      item.lock_type !== 'grams' &&
      !ENGINE_KEPT_LOCKS.has(item.lock_type)
    ) {
      dropped = true;
      continue;
    }
    byLineId[lineId] = constraint;
  }
  return dropped ? { byLineId } : set;
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

/* ── store ───────────────────────────────────────────────────────────────── */

export interface ConstraintStudioState {
  constraints: ConstraintSet;
  preview: ConstraintPreview | null;
  previewIssue: PreviewIssue | null;
  blocked: BlockedApply | null;
  feasibility: ConstraintFeasibilityAnalysis | null;
  history: AppliedChangeRecord[];
  /** Session link to the pro-core saved recipe (save→version reuse). */
  proCoreRecipeId: string | null;
  lastSavedVersion: number | null;

  /** §17.1 padlock: AI ↔ locked at the EXACT current grams. */
  toggleLock: (lineId: string) => void;
  /** §17.3 range (feature-flagged UI). Honest validation — never clamps. */
  setRangeConstraint: (
    lineId: string,
    minGrams: number,
    maxGrams: number,
  ) => { ok: boolean; issues: ConstraintValidationIssue[] };
  clearConstraint: (lineId: string) => void;
  /** Reconcile hooks for the ingredient rows (dropdown / remove). */
  onLineLockTypeChanged: (lineId: string, lockType: LockType) => void;
  onLineRemoved: (lineId: string) => void;
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
  createBatchRescalePreview: (newBatchGrams: number) => void;
  createSuggestedFixPreview: (fix: SuggestedBoundFix) => void;
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
  blocked: null,
  feasibility: null,
  history: [] as AppliedChangeRecord[],
  proCoreRecipeId: null,
  lastSavedVersion: null,
};

/** Any constraint edit invalidates the staged preview + analysis (staleness
 * would block the apply anyway — clearing keeps the surface honest). */
const CLEAR_STAGED = { preview: null, previewIssue: null, feasibility: null, blocked: null };

export const useConstraintStudioStore = create<ConstraintStudioState>()((set, get) => ({
  ...INITIAL,

  toggleLock: (lineId) => {
    const recipe = useRecipeStore.getState();
    const item = recipe.items.find((candidate) => candidate.id === lineId);
    if (!item) return;
    if (item.actual_grams !== null) return; // poured material is already immutable (spec §15)

    const existing = get().constraints.byLineId[lineId];
    if (existing !== undefined && existing.mode !== 'ai') {
      // §17.2 steps 4–6: unlock → the solver may change the line again.
      set({ constraints: { byLineId: withoutLine(get().constraints.byLineId, lineId) }, ...CLEAR_STAGED });
      if (item.lock_type === 'grams') recipe.setLockType(lineId, 'unlocked');
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
    if (!ENGINE_KEPT_LOCKS.has(item.lock_type) && item.lock_type !== 'grams') {
      recipe.setLockType(lineId, 'grams');
    } else {
      recipe.bumpDraftRevision(); // Phase 3: a §17 edit is a material edit
    }
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
    if (!ENGINE_KEPT_LOCKS.has(item.lock_type) && item.lock_type !== 'grams') {
      recipe.setLockType(lineId, 'grams'); // held-at-current for every solver path
    } else {
      recipe.bumpDraftRevision(); // Phase 3: a §17 range edit is a material edit
    }
    return { ok: true, issues: [] };
  },

  clearConstraint: (lineId) => {
    const existing = get().constraints.byLineId[lineId];
    if (existing === undefined) return;
    set({ constraints: { byLineId: withoutLine(get().constraints.byLineId, lineId) }, ...CLEAR_STAGED });
    const recipe = useRecipeStore.getState();
    const item = recipe.items.find((candidate) => candidate.id === lineId);
    if (item && item.lock_type === 'grams' && existing.mode !== 'ai') {
      recipe.setLockType(lineId, 'unlocked');
    } else {
      recipe.bumpDraftRevision(); // Phase 3: a §17 edit is a material edit
    }
  },

  onLineLockTypeChanged: (lineId, lockType) => {
    const existing = get().constraints.byLineId[lineId];
    if (existing === undefined || existing.mode === 'ai') return;
    if (lockType === 'grams' || ENGINE_KEPT_LOCKS.has(lockType)) return;
    // Conscious dropdown override → the §17 constraint is dropped with it.
    set({ constraints: { byLineId: withoutLine(get().constraints.byLineId, lineId) }, ...CLEAR_STAGED });
    useRecipeStore.getState().bumpDraftRevision(); // Phase 3: material edit
  },

  onLineRemoved: (lineId) => {
    if (get().constraints.byLineId[lineId] === undefined) return;
    set({ constraints: { byLineId: withoutLine(get().constraints.byLineId, lineId) }, ...CLEAR_STAGED });
    useRecipeStore.getState().bumpDraftRevision(); // Phase 3: material edit
  },

  reconcile: () => {
    const reconciled = reconcileConstraints(useRecipeStore.getState().items, get().constraints);
    if (reconciled !== get().constraints) set({ constraints: reconciled });
  },

  resetDraftSession: () =>
    set({
      constraints: { byLineId: {} },
      history: [],
      ...CLEAR_STAGED,
    }),

  createOptimizePreview: () => {
    get().reconcile();
    // THE canonical draft (owner P0 NIGHTLY FAILURE 1): recipe input + §17
    // constraints + exclusions composed by the ONE selector — the preview is
    // stamped with the draft revision it was built for.
    const draft = selectCanonicalDraft();
    const result = buildOptimizePreview(draft.input, draft.constraints, nowIso(), {
      excludedIngredientIds: draft.excludedIngredientIds,
    });
    if (result.ok) {
      result.preview.baseDraftRevision = draft.revision;
      set({ preview: result.preview, previewIssue: null, blocked: null });
    } else set({ preview: null, previewIssue: result, blocked: null });
  },

  createBatchRescalePreview: (newBatchGrams) => {
    get().reconcile();
    const draft = selectCanonicalDraft();
    const result = buildBatchRescalePreview(draft.input, draft.constraints, newBatchGrams, nowIso());
    if (result.ok) {
      result.preview.baseDraftRevision = draft.revision;
      set({ preview: result.preview, previewIssue: null, blocked: null });
    } else set({ preview: null, previewIssue: result, blocked: null });
  },

  createSuggestedFixPreview: (fix) => {
    get().reconcile();
    const draft = selectCanonicalDraft();
    const result = buildSuggestedFixPreview(draft.input, draft.constraints, fix, nowIso());
    if (result.ok) {
      result.preview.baseDraftRevision = draft.revision;
      set({ preview: result.preview, previewIssue: null, blocked: null });
    } else set({ preview: null, previewIssue: result, blocked: null });
  },

  cancelPreview: () => set({ preview: null, previewIssue: null, blocked: null }),

  applyPreview: () => {
    const { preview, constraints, history } = get();
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
    const written = useRecipeStore.getState().applyVerifiedRecipeInput(outcome.verified.input);
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
}));

/* ── store bridge (owner P0 NIGHTLY, live FAILURE 1 — Phase 3 wiring) ────── */

/**
 * THE bridge between the recipe store and the §17 session — wired here in the
 * STORE layer (never in UI files), so EVERY load/preset/reset/edit path is
 * covered whichever surface triggered it:
 *  - `draftContextSeq` change (loadRecipeInput / loadPreset / resetToDemo) →
 *    the §17 session RESETS: a loaded recipe starts a fresh constraint
 *    context — locks/ranges from an earlier session draft never survive;
 *  - `draftRevision` change (ANY material edit) → staged state built for the
 *    old draft (preview, previewIssue, feasibility, blocked) is invalidated
 *    unless the staged preview already carries the new revision.
 */
useRecipeStore.subscribe((state, prev) => {
  if (state.draftContextSeq !== prev.draftContextSeq) {
    useConstraintStudioStore.getState().resetDraftSession();
    return;
  }
  if (state.draftRevision !== prev.draftRevision) {
    const session = useConstraintStudioStore.getState();
    const previewCurrent = session.preview?.baseDraftRevision === state.draftRevision;
    if (
      !previewCurrent &&
      (session.preview !== null ||
        session.previewIssue !== null ||
        session.feasibility !== null ||
        session.blocked !== null)
    ) {
      useConstraintStudioStore.setState({ ...CLEAR_STAGED });
    }
  }
});
