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
  /** Fingerprint of (input, constraints) the preview was built for. */
  baseFingerprint: string;
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
    const keepLineId = plannable ? keepLineByIngredient.get(item.ingredient.id) : undefined;

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
      keepLineByIngredient.set(item.ingredient.id, item.id);
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
    counts.set(item.ingredient.id, (counts.get(item.ingredient.id) ?? 0) + 1);
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
  const nameByIngredient = new Map(proposed.items.map((item) => [item.ingredient.id, item.ingredient.name]));
  for (const [ingredientId, count] of plannableCounts(proposed)) {
    if (count > Math.max(1, before.get(ingredientId) ?? 0)) {
      names.push(nameByIngredient.get(ingredientId) ?? ingredientId);
    }
  }
  return names;
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
  input.items
    .filter((item) => isConstrained(set, item.id))
    .map((item) => item.ingredient.name);

/* ── preview builders ────────────────────────────────────────────────────── */

export type BuildPreviewResult =
  | { ok: true; preview: ConstraintPreview }
  | { ok: false; code: 'invalid_constraints'; issues: ConstraintValidationIssue[] }
  | { ok: false; code: 'already_clean' }
  | { ok: false; code: 'no_proposal' }
  | { ok: false; code: 'apply_failed' }
  | { ok: false; code: 'line_missing' }
  | { ok: false; code: 'rescale_invalid' }
  | { ok: false; code: 'rescale_actuals' }
  | { ok: false; code: 'rescale_no_scalable' }
  | { ok: false; code: 'rescale_locked_sum'; minimumBatchGrams: number };

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

/**
 * „Dopasuj recepturę” (§12.4): run the REAL solver on the constraint-mapped
 * input and stage the outcome as a preview. Never mutates, never persists.
 * The first proposal carrying actions is used (the solver's own ranking);
 * honest failure codes when there is nothing to propose.
 */
export function buildOptimizePreview(
  input: RecipeInput,
  set: ConstraintSet,
  createdAt: string,
): BuildPreviewResult {
  const constrained = applyConstraintsToRecipe(input, set);
  if (!constrained.ok) {
    return { ok: false, code: 'invalid_constraints', issues: constrained.issues };
  }

  const beforeResult = calculateRecipe(constrained.input);
  const violationsBefore = violationCount(beforeResult);
  const hasCritical = beforeResult.warnings.some((warning) => warning.severity === 'critical');
  if (violationsBefore === 0 && !hasCritical) {
    return { ok: false, code: 'already_clean' };
  }

  const context = recipeContext(constrained.input);
  const proposed = proposeAutoFix({
    input: constrained.input,
    context,
    exactCorrectionGrams: true,
  });
  if (proposed.redacted) return { ok: false, code: 'no_proposal' };
  // §17 constraint INTENT at the ingredient level (same rule as the
  // feasibility layer's findFullFixProposal): „mam dokładnie tyle tego
  // składnika” — a proposal that ADDS a parallel line of a locked/range
  // ingredient does not respect the lock, even though the locked LINE itself
  // stays untouched. Such proposals are skipped, never silently applied.
  const constrainedIngredientIds = new Set(
    input.items
      .filter((item) => isConstrained(set, item.id))
      .map((item) => item.ingredient.id),
  );
  const proposal: CorrectionProposal | undefined = proposed.proposals.find(
    (candidate) =>
      candidate.actions.length > 0 &&
      candidate.actions.every(
        (action) => action.type !== 'add' || !constrainedIngredientIds.has(action.ingredient_id),
      ),
  );
  if (!proposal) return { ok: false, code: 'no_proposal' };

  const applied = applyAutoFix({ input: constrained.input, proposal, context });
  if (!applied.success) return { ok: false, code: 'apply_failed' };

  // Owner P0 (recalc duplication): fold solver adds into existing plannable
  // lines of the same canonical ingredient, then restore the target batch.
  let proposedInput = ensureUniqueLineIds(input, mergeByCanonicalIdentity(input, applied.newInput));
  const hasActuals = input.items.some((item) => item.actual_grams !== null);
  if (!hasActuals && Math.abs(plannedSum(proposedInput) - input.target_batch_grams) > BATCH_SUM_TOLERANCE_G) {
    // The APPROVED §17.4 batch mechanism: proportional on unlocked lines,
    // locked grams preserved exactly. Per-100 g concentrations — and therefore
    // the solver's fix — are preserved by proportional scaling. If it refuses
    // (unreachable in practice: a solver change implies a scalable line), the
    // un-scaled proposal continues and the Apply door blocks it honestly.
    const restored = rescaleBatchToTarget(proposedInput, set, input.target_batch_grams);
    if (restored.ok) proposedInput = restored.input;
  }
  return {
    ok: true,
    preview: finishPreview(
      'optimize',
      copy.preview.kindLabels.optimize,
      input,
      set,
      proposedInput,
      set,
      violationsBefore,
      buildProposalExplanation(constrained.input, set, proposal),
      createdAt,
    ),
  };
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
  const optimized = buildOptimizePreview(adjustedInput, nextSet, createdAt);
  const proposedInput = optimized.ok ? optimized.preview.proposedInput : adjustedInput;
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
  before: { input: RecipeInput; constraints: ConstraintSet };
  after: { input: RecipeInput; constraints: ConstraintSet };
  lines: PreviewLineDiff[];
  explanation: ConstraintExplanationEntry[];
  violationsBefore: number;
  violationsAfter: number;
}

/* ── the ONLY door ───────────────────────────────────────────────────────── */

export type BlockedApply =
  | { code: 'stale_preview'; messagePl: string }
  | {
      code: 'constraints_violated';
      messagePl: string;
      violations: ConstraintPreservationViolation[];
    }
  /** Owner P0 Phase 6: the proposal would introduce a duplicate canonical ingredient. */
  | { code: 'duplicate_lines'; messagePl: string; ingredientNames: string[] }
  /** Owner P0 Phase 5: proposed planned sum breaks the target-batch invariant. */
  | { code: 'batch_total_mismatch'; messagePl: string; proposedSum: number; targetBatch: number };

export type CommitPreviewResult = { ok: true; verified: VerifiedApply } | ({ ok: false } & BlockedApply);

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
  ): CommitPreviewResult {
    // §19.2: a preview never applies onto a state it was not built for.
    if (workingStateFingerprint(current, currentConstraints) !== preview.baseFingerprint) {
      return { ok: false, code: 'stale_preview', messagePl: copy.blocked.stale };
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
    const lineIds = new Set<string>();
    let duplicateLineId = false;
    for (const item of preview.proposedInput.items) {
      if (lineIds.has(item.id)) {
        duplicateLineId = true;
        break;
      }
      lineIds.add(item.id);
    }
    const newDuplicates = findNewDuplicateIngredients(current, preview.proposedInput);
    if (duplicateLineId || newDuplicates.length > 0) {
      return {
        ok: false,
        code: 'duplicate_lines',
        messagePl: copy.blocked.duplicates(newDuplicates),
        ingredientNames: newDuplicates,
      };
    }

    // Owner P0 Phase 5 — BATCH INVARIANT (planned recipes, optimize path):
    // a 1000 g recipe stays 1000 g; a 2937.9 g result can never be applied.
    const proposedHasActuals = preview.proposedInput.items.some((item) => item.actual_grams !== null);
    if (preview.kind === 'optimize' && !proposedHasActuals) {
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

    const record: AppliedChangeRecord = {
      id,
      at,
      kind: preview.kind,
      titlePl: preview.titlePl,
      mode: current.mode,
      temperatureC: current.target_temperature_c,
      engineVersion: preview.engineVersion,
      configVersion: preview.configVersion,
      before: { input: structuredClone(current), constraints: currentConstraints },
      after: { input: structuredClone(preview.proposedInput), constraints: preview.nextConstraints },
      lines: preview.lines,
      explanation: preview.explanation,
      violationsBefore: preview.violationsBefore,
      violationsAfter: preview.violationsAfter,
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
