/**
 * LOCK CONFLICT DIAGNOSTIC — the smallest change to the customer's OWN locks
 * that makes a legal recipe possible (owner 2026-09-11, INTERACTIVE
 * RECALCULATION PREVIEW + CONFLICT RESOLUTION, part B).
 *
 * This is not a second solver and it weakens nothing. It only asks the
 * EXISTING preview pipeline — `buildOptimizePreview` + the ProductBehavior
 * binding, exactly as a normal „Przelicz" runs them — the same question with
 * some of the customer's padlocks moved. Carrier minimums, Main floors,
 * ProductBehavior, Engine ranges, batch equality, identity and every other
 * hard rule stay exactly where they are: a probe is feasible only when that
 * unchanged pipeline returns an applicable, whole-gram, non-diagnostic Preview.
 *
 * Deterministic objective (documented, tested):
 *  1. minimise the total gram change from the customer's locked amounts;
 *  2. on a tie, move FEWER locks (an unnecessary lock never moves);
 *  3. then the smaller largest relative change;
 *  4. then recipe order.
 * Candidates: every single-lock relaxation (bisected to the whole gram closest
 * to the customer's amount), and — when two or more locks exist — the joint
 * relaxation of all of them, tightened lock by lock back towards the
 * customer's amounts. Every returned value is the input of a feasible probe;
 * the chosen set is re-probed once more before it is published.
 *
 * Every probe is built through `applyPreviewInstructions` over the untouched
 * recipe + the session's instructions, i.e. byte-for-byte the input „Użyj
 * propozycji" will recalculate, so the proposal it offers is reproducible.
 */
import type { RecipeInput } from '@/engine';
import type { MainEnvelopeViolation } from '@/features/product-intelligence';
import type { ConstraintSet } from '@/features/recipe-constraints';
import {
  bindProductBehaviorToPreview,
  buildOptimizePreview,
  type BuildPreviewResult,
  type OptimizePreviewOptions,
} from './applyPipeline';
import {
  applyPreviewInstructions,
  hasCustomerQuantityLock,
  isPreviewEditableLine,
  mergePreviewInstructions,
  previewInstructionsFingerprint,
  type PreviewLineInstruction,
} from './previewInstructions';

type PreviewFailure = Exclude<BuildPreviewResult, { ok: true }>;

export interface LockConflictLock {
  lineId: string;
  ingredientName: string;
  /** The customer's current exact amount for this lock, in whole grams. */
  grams: number;
}

export interface LockConflictChange {
  lineId: string;
  ingredientName: string;
  fromGrams: number;
  toGrams: number;
}

export type LockConflictBlockerCode =
  | 'liquid_dairy_carrier_below_floor'
  | 'main_below_floor'
  | 'main_above_hard_limit';

export interface LockConflictBlocker {
  code: LockConflictBlockerCode;
  /** Measured share of the batch; null when the verdict states only the limit. */
  actualPercent: number | null;
  /** The published boundary that was crossed; null when not stated. */
  limitPercent: number | null;
}

export type LockConflictDiagnosis =
  | {
      status: 'relaxation_found';
      /** Every customer lock that took part in the search, recipe order. */
      locks: LockConflictLock[];
      /** Only the locks that genuinely have to move. Never empty. */
      changes: LockConflictChange[];
      totalChangeGrams: number;
      blockers: LockConflictBlocker[];
      probes: number;
      /** FALSE when the probe budget ended a search early. The values are
       * still probe-proven; only the minimality claim is weaker. */
      searchComplete: boolean;
    }
  | {
      status: 'no_safe_relaxation';
      locks: LockConflictLock[];
      blockers: LockConflictBlocker[];
      probes: number;
      /** `locks_are_not_the_cause`: even with every customer lock released
       * the unchanged pipeline finds no legal recipe — the refusal belongs to
       * something other than the locks and keeps its existing explanation. */
      reason: 'locks_are_not_the_cause' | 'no_lock_relaxation_found' | 'search_budget_exhausted';
    };

export interface LockConflictRequest {
  /** The untouched recipe (canonical draft) and its constraint set. */
  baseInput: RecipeInput;
  baseConstraints: ConstraintSet;
  /** The session's provisional instructions the failed solve was built with. */
  sessionInstructions: readonly PreviewLineInstruction[];
  createdAt: string;
  /** EXACTLY the options of the failed solve (same authority, same pass). */
  options: OptimizePreviewOptions;
  failure: PreviewFailure;
  maxProbes?: number;
}

/** Enough for two or three locks at 1 g precision; deterministic (a probe
 * count, never a wall-clock budget, so every environment gets one answer). */
export const LOCK_CONFLICT_MAX_PROBES = 72;

const QUANTITY_BLOCKERS: ReadonlySet<string> = new Set<LockConflictBlockerCode>([
  'liquid_dairy_carrier_below_floor',
  'main_below_floor',
  'main_above_hard_limit',
]);

/** Refusals a customer lock can cause. Product-data, identity, profile and
 * input-completeness refusals keep their own dedicated explanation. */
const LOCK_ATTRIBUTABLE_CODES: ReadonlySet<PreviewFailure['code']> = new Set<
  PreviewFailure['code']
>(['impossible_under_constraints', 'main_ratio_conflict', 'no_proposal', 'unsafe_proposal']);

const blockingViolationsOf = (failure: PreviewFailure): MainEnvelopeViolation[] => {
  if (failure.code === 'product_behavior_invalid') return failure.violations;
  if (
    failure.code === 'no_proposal' ||
    failure.code === 'main_ratio_conflict' ||
    failure.code === 'impossible_under_constraints'
  ) {
    return failure.blockingViolations ?? [];
  }
  return [];
};

const PERCENT = String.raw`(\d+(?:[.,]\d+)?)%`;
/** „… ma 24.0%; wymagane minimum to 30.0%." — the carrier and Main floor verdicts. */
const MEASURED_FLOOR = new RegExp(`ma ${PERCENT}; wymagane minimum to ${PERCENT}`);
/** „Grupa Main przekracza twardy limit 45.0%." — the hard-limit verdict. */
const HARD_LIMIT = new RegExp(`twardy limit ${PERCENT}`);
const percentOf = (text: string): number => Number(text.replace(',', '.'));

/**
 * The exact remaining gap(s), read from the Main envelope verdict's OWN
 * sentence. `verifyMainEnvelope` is the only producer of these numbers, so
 * reading its output keeps ONE authority instead of re-deriving its arithmetic
 * here (and leaves the Production Rescue edge sources untouched). The wording
 * is pinned by a test against the real producer: a change there fails loudly
 * instead of silently dropping the number.
 */
export function lockConflictBlockers(failure: PreviewFailure): LockConflictBlocker[] {
  const blockers: LockConflictBlocker[] = [];
  for (const violation of blockingViolationsOf(failure)) {
    if (!QUANTITY_BLOCKERS.has(violation.code)) continue;
    const code = violation.code as LockConflictBlockerCode;
    if (blockers.some((blocker) => blocker.code === code)) continue;
    if (code === 'main_above_hard_limit') {
      const limit = HARD_LIMIT.exec(violation.messagePl);
      blockers.push({
        code,
        actualPercent: null,
        limitPercent: limit ? percentOf(limit[1]!) : null,
      });
      continue;
    }
    const measured = MEASURED_FLOOR.exec(violation.messagePl);
    blockers.push({
      code,
      actualPercent: measured ? percentOf(measured[1]!) : null,
      limitPercent: measured ? percentOf(measured[2]!) : null,
    });
  }
  return blockers;
}

/** The customer's own exact quantity locks in a solve input, recipe order.
 * Ranges are search bounds, not exact instructions, and are held as they are. */
export function relaxableCustomerLocks(
  input: RecipeInput,
  constraints: ConstraintSet,
): LockConflictLock[] {
  const locks: LockConflictLock[] = [];
  for (const item of input.items) {
    if (!isPreviewEditableLine(item) || !hasCustomerQuantityLock(item, constraints)) continue;
    const constraint = constraints.byLineId[item.id];
    if (constraint?.mode === 'range') continue;
    const grams =
      constraint?.mode === 'locked'
        ? constraint.grams
        : constraint?.mode === 'percent'
          ? (constraint.percent / 100) * input.target_batch_grams
          : item.planned_grams;
    const whole = Math.round(grams);
    if (!(whole >= 1)) continue;
    locks.push({ lineId: item.id, ingredientName: item.ingredient.name, grams: whole });
  }
  return locks;
}

/** Cheap gate: is this refusal one a lock relaxation could possibly answer? */
export function lockConflictDiagnosable(
  result: BuildPreviewResult,
  solveInput: RecipeInput,
  solveConstraints: ConstraintSet,
): result is PreviewFailure {
  if (result.ok) return false;
  const attributable =
    LOCK_ATTRIBUTABLE_CODES.has(result.code) ||
    (result.code === 'product_behavior_invalid' &&
      result.violations.some((violation) => QUANTITY_BLOCKERS.has(violation.code)));
  if (!attributable) return false;
  // A Direction preference that cannot be reached is a consent question, not
  // a lock conflict; it keeps its own NEAREST / best-safe explanation.
  if (result.code === 'no_proposal' && result.directionTargetUnreached === true) return false;
  return relaxableCustomerLocks(solveInput, solveConstraints).length > 0;
}

type Assignment = ReadonlyMap<string, number | 'free'>;

interface ProbeOutcome {
  feasible: boolean;
  proposal: RecipeInput | null;
}

interface Candidate {
  values: Map<string, number>;
}

export function diagnoseLockConflict(request: LockConflictRequest): LockConflictDiagnosis {
  const maxProbes = request.maxProbes ?? LOCK_CONFLICT_MAX_PROBES;
  const blockers = lockConflictBlockers(request.failure);
  const solve = applyPreviewInstructions(
    request.baseInput,
    request.baseConstraints,
    request.sessionInstructions,
  );
  const locks = solve.ok ? relaxableCustomerLocks(solve.input, solve.constraints) : [];
  const lockById = new Map(locks.map((lock) => [lock.lineId, lock]));
  const indexById = new Map(locks.map((lock, index) => [lock.lineId, index]));
  const snapshots = request.options.productBehaviorSnapshots ?? {};
  const cache = new Map<string, ProbeOutcome>();
  let probes = 0;
  let budgetHit = false;

  const instructionsFor = (assignment: Assignment): PreviewLineInstruction[] =>
    [...assignment]
      .filter(([lineId, value]) => value === 'free' || value !== lockById.get(lineId)?.grams)
      .map(([lineId, value]) => {
        const lock = lockById.get(lineId)!;
        return value === 'free'
          ? { lineId, grams: lock.grams, locked: false }
          : { lineId, grams: value, locked: true };
      });

  const probe = (assignment: Assignment): ProbeOutcome => {
    const relaxation = instructionsFor(assignment);
    const key = previewInstructionsFingerprint(relaxation);
    const cached = cache.get(key);
    if (cached) return cached;
    if (probes >= maxProbes) {
      budgetHit = true;
      return { feasible: false, proposal: null };
    }
    probes += 1;
    const adjusted = applyPreviewInstructions(
      request.baseInput,
      request.baseConstraints,
      mergePreviewInstructions(request.sessionInstructions, relaxation),
    );
    if (!adjusted.ok) {
      const outcome = { feasible: false, proposal: null };
      cache.set(key, outcome);
      return outcome;
    }
    const raw = buildOptimizePreview(
      adjusted.input,
      adjusted.constraints,
      request.createdAt,
      request.options,
    );
    const bound = bindProductBehaviorToPreview(
      raw,
      snapshots,
      snapshots,
      request.options.technicalOnlyMainLineIds ?? [],
    );
    const outcome: ProbeOutcome =
      bound.ok &&
      bound.preview.diagnosticOnly !== true &&
      (bound.preview.hardResidualMetrics?.length ?? 0) === 0 &&
      bound.preview.practicalization?.status === 'ready'
        ? { feasible: true, proposal: bound.preview.proposedInput }
        : { feasible: false, proposal: null };
    cache.set(key, outcome);
    return outcome;
  };

  const noRelaxation = (
    reason: Extract<LockConflictDiagnosis, { status: 'no_safe_relaxation' }>['reason'],
  ): LockConflictDiagnosis => ({
    status: 'no_safe_relaxation',
    locks,
    blockers,
    probes,
    reason: budgetHit ? 'search_budget_exhausted' : reason,
  });

  if (locks.length === 0) return noRelaxation('locks_are_not_the_cause');

  // The solver's own answer with a lock released says which way that lock
  // has to move; 1 g is the smallest amount a Base line can hold.
  const freeTarget = (proposal: RecipeInput | null, lock: LockConflictLock): number => {
    const grams = proposal?.items.find((item) => item.id === lock.lineId)?.planned_grams ?? 1;
    return Math.max(1, Math.round(grams));
  };

  /** The feasible whole gram closest to `infeasible`, walking from `feasible`. */
  const closestFeasible = (
    infeasible: number,
    feasible: number,
    isFeasible: (grams: number) => boolean,
  ): number => {
    let good = feasible;
    let bad = infeasible;
    while (Math.abs(bad - good) > 1) {
      const mid = good + Math.trunc((bad - good) / 2);
      if (isFeasible(mid)) good = mid;
      else {
        if (budgetHit) break;
        bad = mid;
      }
    }
    return good;
  };

  const allFree = probe(new Map(locks.map((lock) => [lock.lineId, 'free' as const])));
  if (!allFree.feasible) return noRelaxation('locks_are_not_the_cause');

  const candidates: Candidate[] = [];

  // 1. Every single-lock relaxation, the others held exactly.
  for (const lock of locks) {
    const free = probe(new Map([[lock.lineId, 'free' as const]]));
    if (!free.feasible) continue;
    const target = freeTarget(free.proposal, lock);
    if (target === lock.grams) continue;
    const lockedAt = (grams: number) => probe(new Map([[lock.lineId, grams]])).feasible;
    if (!lockedAt(target)) continue;
    const grams = closestFeasible(lock.grams, target, lockedAt);
    candidates.push({ values: new Map([[lock.lineId, grams]]) });
  }

  // 2. The joint relaxation of every lock, then tightened back lock by lock.
  if (locks.length > 1) {
    const targets = locks.map((lock) => freeTarget(allFree.proposal, lock));
    const along = (t: number): Map<string, number> =>
      new Map(
        locks.map((lock, index) => [
          lock.lineId,
          Math.round(lock.grams + t * (targets[index]! - lock.grams)),
        ]),
      );
    if (probe(along(1)).feasible) {
      let good = 1;
      let bad = 0;
      for (let step = 0; step < 7 && !budgetHit; step += 1) {
        const mid = (good + bad) / 2;
        if (probe(along(mid)).feasible) good = mid;
        else bad = mid;
      }
      const point = along(good);
      for (const lock of locks) {
        const value = point.get(lock.lineId)!;
        if (value === lock.grams) continue;
        const withLockAt = (grams: number) =>
          probe(new Map([...point, [lock.lineId, grams]])).feasible;
        if (withLockAt(lock.grams)) {
          point.set(lock.lineId, lock.grams);
          continue;
        }
        point.set(lock.lineId, closestFeasible(lock.grams, value, withLockAt));
      }
      if ([...point].some(([lineId, grams]) => grams !== lockById.get(lineId)!.grams)) {
        candidates.push({ values: point });
      }
    }
  }

  const changesOf = (candidate: Candidate): LockConflictChange[] =>
    [...candidate.values]
      .filter(([lineId, grams]) => grams !== lockById.get(lineId)!.grams)
      .sort(([left], [right]) => indexById.get(left)! - indexById.get(right)!)
      .map(([lineId, grams]) => {
        const lock = lockById.get(lineId)!;
        return {
          lineId,
          ingredientName: lock.ingredientName,
          fromGrams: lock.grams,
          toGrams: grams,
        };
      });
  const total = (changes: readonly LockConflictChange[]) =>
    changes.reduce((sum, change) => sum + Math.abs(change.toGrams - change.fromGrams), 0);
  const largestRelative = (changes: readonly LockConflictChange[]) =>
    Math.max(
      ...changes.map((change) => Math.abs(change.toGrams - change.fromGrams) / change.fromGrams),
    );
  const firstIndex = (changes: readonly LockConflictChange[]) =>
    Math.min(...changes.map((change) => indexById.get(change.lineId)!));

  const ranked = candidates
    .map(changesOf)
    .filter((changes) => changes.length > 0)
    .sort(
      (left, right) =>
        total(left) - total(right) ||
        left.length - right.length ||
        largestRelative(left) - largestRelative(right) ||
        firstIndex(left) - firstIndex(right),
    );

  for (const changes of ranked) {
    // Re-prove the exact published set (usually a cache hit).
    const verified = probe(new Map(changes.map((change) => [change.lineId, change.toGrams])));
    if (!verified.feasible) continue;
    return {
      status: 'relaxation_found',
      locks,
      changes,
      totalChangeGrams: total(changes),
      blockers,
      probes,
      searchComplete: !budgetHit,
    };
  }
  return noRelaxation('no_lock_relaxation_found');
}

/** The instructions „Użyj propozycji" recalculates: each change becomes the
 * customer's new exact padlock at the proven amount; nothing else moves. */
export function lockRelaxationInstructions(
  diagnosis: Extract<LockConflictDiagnosis, { status: 'relaxation_found' }>,
): PreviewLineInstruction[] {
  return diagnosis.changes.map((change) => ({
    lineId: change.lineId,
    grams: change.toGrams,
    locked: true,
  }));
}
