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

const currentRecipeInput = (): RecipeInput => buildRecipeInput(useRecipeStore.getState());

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
    const validation = validateConstraintSet(currentRecipeInput(), candidateSet);
    const lineIssues = validation.issues.filter(
      (issue) => issue.lineId === lineId && issue.severity === 'error',
    );
    if (lineIssues.length > 0) return { ok: false, issues: lineIssues };
    set({ constraints: candidateSet, ...CLEAR_STAGED });
    if (!ENGINE_KEPT_LOCKS.has(item.lock_type) && item.lock_type !== 'grams') {
      recipe.setLockType(lineId, 'grams'); // held-at-current for every solver path
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
    }
  },

  onLineLockTypeChanged: (lineId, lockType) => {
    const existing = get().constraints.byLineId[lineId];
    if (existing === undefined || existing.mode === 'ai') return;
    if (lockType === 'grams' || ENGINE_KEPT_LOCKS.has(lockType)) return;
    // Conscious dropdown override → the §17 constraint is dropped with it.
    set({ constraints: { byLineId: withoutLine(get().constraints.byLineId, lineId) }, ...CLEAR_STAGED });
  },

  onLineRemoved: (lineId) => {
    if (get().constraints.byLineId[lineId] === undefined) return;
    set({ constraints: { byLineId: withoutLine(get().constraints.byLineId, lineId) }, ...CLEAR_STAGED });
  },

  reconcile: () => {
    const reconciled = reconcileConstraints(useRecipeStore.getState().items, get().constraints);
    if (reconciled !== get().constraints) set({ constraints: reconciled });
  },

  createOptimizePreview: () => {
    get().reconcile();
    const result = buildOptimizePreview(currentRecipeInput(), get().constraints, nowIso());
    if (result.ok) set({ preview: result.preview, previewIssue: null, blocked: null });
    else set({ preview: null, previewIssue: result, blocked: null });
  },

  createBatchRescalePreview: (newBatchGrams) => {
    get().reconcile();
    const result = buildBatchRescalePreview(
      currentRecipeInput(),
      get().constraints,
      newBatchGrams,
      nowIso(),
    );
    if (result.ok) set({ preview: result.preview, previewIssue: null, blocked: null });
    else set({ preview: null, previewIssue: result, blocked: null });
  },

  createSuggestedFixPreview: (fix) => {
    get().reconcile();
    const result = buildSuggestedFixPreview(currentRecipeInput(), get().constraints, fix, nowIso());
    if (result.ok) set({ preview: result.preview, previewIssue: null, blocked: null });
    else set({ preview: null, previewIssue: result, blocked: null });
  },

  cancelPreview: () => set({ preview: null, previewIssue: null, blocked: null }),

  applyPreview: () => {
    const { preview, constraints, history } = get();
    if (!preview) return;
    const outcome = commitPreview(currentRecipeInput(), constraints, preview, nowIso(), nextChangeId());
    if (!outcome.ok) {
      // The owner-mandated block: recipe untouched, clear Polish message.
      set({
        blocked: outcome,
        preview: outcome.code === 'stale_preview' ? null : preview,
      });
      return;
    }
    // The ONLY verified recipe write (see module header).
    useRecipeStore.setState({
      items: outcome.verified.input.items.map((item) => ({ ...item })),
      target_batch_grams: outcome.verified.input.target_batch_grams,
    });
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
    if (!isUndoAvailable(last, currentRecipeInput(), get().constraints)) return;
    // Byte-exact restore of the pre-apply snapshot (§19.2/§20.3).
    useRecipeStore.setState({
      items: last.before.input.items.map((item) => ({ ...item })),
      target_batch_grams: last.before.input.target_batch_grams,
    });
    set({
      constraints: last.before.constraints,
      history: history.slice(0, -1),
      ...CLEAR_STAGED,
    });
  },

  runFeasibility: () => {
    get().reconcile();
    set({
      feasibility: analyzeConstraintFeasibility(currentRecipeInput(), get().constraints),
      previewIssue: null,
    });
  },

  clearFeasibility: () => set({ feasibility: null }),

  dismissBlocked: () => set({ blocked: null }),

  markProCoreRecipe: (recipeId, versionNumber) =>
    set({ proCoreRecipeId: recipeId, lastSavedVersion: versionNumber }),

  resetForTests: () => set({ ...INITIAL, constraints: { byLineId: {} }, history: [] }),
}));
