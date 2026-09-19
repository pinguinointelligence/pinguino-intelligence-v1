/**
 * LOCK CONFLICT DIAGNOSTIC — owner 2026-09-11, mandatory fixtures 3 and 4.
 *
 * Every claim is proven against the unchanged canonical pipeline: the returned
 * values re-solve to a legal recipe, a lock the search did not move stays
 * byte-exact, and one gram closer to the customer's amount is infeasible.
 */
import { describe, expect, it, vi } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { verifyMainEnvelope } from '@/features/product-intelligence/mainEnvelope';
import type { ConstraintSet } from '@/features/recipe-constraints';
import {
  OWNER_CREATED_AT,
  ownerFruitRecipe,
  ownerFruitSnapshots,
  ownerPreviewOptions,
  withCustomerGramLocks,
} from './__fixtures__/ownerFruitMainFixture';
import {
  bindProductBehaviorToPreview,
  buildOptimizePreview,
  type BuildPreviewResult,
} from './applyPipeline';
import {
  diagnoseLockConflict,
  lockConflictBlockers,
  lockConflictDiagnosable,
  lockRelaxationInstructions,
  type LockConflictDiagnosis,
} from './lockRelaxation';
import { applyPreviewInstructions, type PreviewLineInstruction } from './previewInstructions';

vi.setConfig({ testTimeout: 180_000 });

const solve = (input: RecipeInput, constraints: ConstraintSet): BuildPreviewResult => {
  const options = ownerPreviewOptions(input);
  return bindProductBehaviorToPreview(
    buildOptimizePreview(input, constraints, OWNER_CREATED_AT, options),
    options.productBehaviorSnapshots,
    options.productBehaviorSnapshots,
    [],
  );
};

const legal = (result: BuildPreviewResult): boolean =>
  result.ok &&
  result.preview.diagnosticOnly !== true &&
  (result.preview.hardResidualMetrics?.length ?? 0) === 0 &&
  result.preview.practicalization?.status === 'ready';

/** Solve the untouched draft + instructions — exactly what „Użyj propozycji" runs. */
const solveWith = (
  draft: { input: RecipeInput; constraints: ConstraintSet },
  instructions: PreviewLineInstruction[],
): BuildPreviewResult => {
  const adjusted = applyPreviewInstructions(draft.input, draft.constraints, instructions);
  if (!adjusted.ok) throw new Error(adjusted.reason);
  return solve(adjusted.input, adjusted.constraints);
};

const diagnose = (draft: { input: RecipeInput; constraints: ConstraintSet }) => {
  const failure = solve(draft.input, draft.constraints);
  if (failure.ok) throw new Error('fixture must start infeasible');
  return {
    failure,
    diagnosis: diagnoseLockConflict({
      baseInput: draft.input,
      baseConstraints: draft.constraints,
      sessionInstructions: [],
      createdAt: OWNER_CREATED_AT,
      options: ownerPreviewOptions(draft.input),
      failure,
    }),
  };
};

const found = (
  diagnosis: LockConflictDiagnosis,
): Extract<LockConflictDiagnosis, { status: 'relaxation_found' }> => {
  if (diagnosis.status !== 'relaxation_found') {
    throw new Error(`expected a relaxation, got ${JSON.stringify(diagnosis)}`);
  }
  return diagnosis;
};

const grams = (input: RecipeInput, lineId: string) =>
  input.items.find((item) => item.id === lineId)?.planned_grams;

/** The cheapest feasible single-lock value by exhaustive whole-gram descent. */
const cheapestSingle = (
  draft: { input: RecipeInput; constraints: ConstraintSet },
  lineId: string,
  from: number,
): number | null => {
  for (let value = from - 1; value >= 1; value -= 1) {
    if (legal(solveWith(draft, [{ lineId, grams: value, locked: true }]))) return from - value;
  }
  return null;
};

describe('lock conflict diagnostic — the smallest legal change to the customer’s own locks', () => {
  it('owner scenario 3 (600 g): carrier + Main floor conflict, both locks genuinely move, the result is legal', () => {
    const draft = withCustomerGramLocks(ownerFruitRecipe({ batch: 600 }), {
      strawberry: 100,
      cranberry: 130,
    });
    const { failure, diagnosis } = diagnose(draft);
    expect(lockConflictDiagnosable(failure, draft.input, draft.constraints)).toBe(true);
    const relaxation = found(diagnosis);

    // WHERE IT HURTS: the measured carrier gap is carried, in structure.
    const carrier = relaxation.blockers.find(
      (blocker) => blocker.code === 'liquid_dairy_carrier_below_floor',
    );
    expect(carrier?.limitPercent).toBe(30);
    expect(carrier!.actualPercent).toBeLessThan(30);

    // Fixture 4B — BOTH locks must move: moving one alone may be possible, but
    // every single-lock correction (exhaustive whole-gram descent) costs more
    // grams than the joint one, so the minimum genuinely touches both.
    expect(relaxation.changes.map((change) => change.lineId).sort()).toEqual([
      'cranberry',
      'strawberry',
    ]);
    for (const single of [
      cheapestSingle(draft, 'cranberry', 130),
      cheapestSingle(draft, 'strawberry', 100),
    ]) {
      if (single !== null) expect(relaxation.totalChangeGrams).toBeLessThan(single);
    }

    // UŻYJ PROPOZYCJI re-solves to a fully legal recipe with the locks kept exactly.
    const rerun = solveWith(draft, lockRelaxationInstructions(relaxation));
    expect(legal(rerun)).toBe(true);
    if (!rerun.ok) return;
    const proposed = rerun.preview.proposedInput;
    for (const change of relaxation.changes) {
      expect(grams(proposed, change.lineId)).toBe(change.toGrams);
    }
    expect(detectViolations(calculateRecipe(proposed))).toEqual([]);
    expect(
      verifyMainEnvelope({
        recipe: proposed,
        snapshots: ownerFruitSnapshots(proposed),
        mode: 'optimal',
        enforceFloor: true,
      }),
    ).toMatchObject({ ok: true });

    // Coordinate-wise minimal: one gram back towards EITHER customer amount is infeasible.
    for (const change of relaxation.changes) {
      const closer = change.toGrams + Math.sign(change.fromGrams - change.toGrams);
      const others = relaxation.changes
        .filter((other) => other.lineId !== change.lineId)
        .map((other) => ({ lineId: other.lineId, grams: other.toGrams, locked: true }));
      expect(
        legal(
          solveWith(draft, [...others, { lineId: change.lineId, grams: closer, locked: true }]),
        ),
      ).toBe(false);
    }
  });

  it('fixture 4A (1000 g): only ONE lock must change — the other stays exactly as the customer set it', () => {
    const draft = withCustomerGramLocks(ownerFruitRecipe({ batch: 1000 }), {
      strawberry: 100,
      cranberry: 130,
    });
    const relaxation = found(diagnose(draft).diagnosis);
    expect(relaxation.changes).toHaveLength(1);
    const [change] = relaxation.changes;
    const untouched = change!.lineId === 'strawberry' ? 'cranberry' : 'strawberry';
    const rerun = solveWith(draft, lockRelaxationInstructions(relaxation));
    expect(legal(rerun)).toBe(true);
    if (!rerun.ok) return;
    // Unnecessary lock changes = 0: the other lock is byte-exact.
    expect(grams(rerun.preview.proposedInput, untouched)).toBe(
      untouched === 'strawberry' ? 100 : 130,
    );
    expect(rerun.preview.nextConstraints.byLineId[untouched]).toEqual({
      mode: 'locked',
      grams: untouched === 'strawberry' ? 100 : 130,
    });
    // The whole gram closest to the customer's amount.
    expect(
      legal(
        solveWith(draft, [{ lineId: change!.lineId, grams: change!.toGrams + 1, locked: true }]),
      ),
    ).toBe(false);
  });

  it('fixture 4C (1000 g): several single-lock relaxations exist — the smallest total change is returned', () => {
    const draft = withCustomerGramLocks(ownerFruitRecipe({ batch: 1000 }), {
      strawberry: 100,
      cranberry: 130,
    });
    const relaxation = found(diagnose(draft).diagnosis);
    const strawberryOnly = cheapestSingle(draft, 'strawberry', 100);
    const cranberryOnly = cheapestSingle(draft, 'cranberry', 130);
    const feasibleCosts = [strawberryOnly, cranberryOnly].filter(
      (cost): cost is number => cost !== null,
    );
    expect(feasibleCosts.length).toBeGreaterThanOrEqual(1);
    // Exhaustive whole-gram descent agrees with the returned minimum.
    expect(relaxation.totalChangeGrams).toBe(Math.min(...feasibleCosts));
  });

  it('is deterministic: the same conflict always yields the same proposal', () => {
    const draft = withCustomerGramLocks(ownerFruitRecipe({ batch: 700 }), {
      strawberry: 100,
      cranberry: 130,
    });
    const first = diagnose(draft).diagnosis;
    const second = diagnose(draft).diagnosis;
    expect(second).toEqual(first);
  });

  it('builds on the session’s instructions: a customer’s manual 90 g keeps the search honest', () => {
    const draft = withCustomerGramLocks(ownerFruitRecipe({ batch: 600 }), {
      strawberry: 100,
      cranberry: 130,
    });
    const session: PreviewLineInstruction[] = [{ lineId: 'cranberry', grams: 90, locked: true }];
    const failure = solveWith(draft, session);
    expect(failure.ok).toBe(false);
    if (failure.ok) return;
    const relaxation = found(
      diagnoseLockConflict({
        baseInput: draft.input,
        baseConstraints: draft.constraints,
        sessionInstructions: session,
        createdAt: OWNER_CREATED_AT,
        options: ownerPreviewOptions(draft.input),
        failure,
      }),
    );
    // The lock the customer set in the session is the starting amount.
    expect(relaxation.locks.find((lock) => lock.lineId === 'cranberry')?.grams).toBe(90);
    const rerun = solveWith(draft, [
      ...session.filter(
        (instruction) => !relaxation.changes.some((change) => change.lineId === instruction.lineId),
      ),
      ...lockRelaxationInstructions(relaxation),
    ]);
    expect(legal(rerun)).toBe(true);
  });

  it('fails honestly when the locks are not the cause (nothing is fabricated)', () => {
    const draft = withCustomerGramLocks(ownerFruitRecipe({ batch: 600 }), { strawberry: 100 });
    const impossiblePolicy = (input: RecipeInput) => {
      const options = ownerPreviewOptions(input);
      options.productBehaviorSnapshots.watermelon = {
        ...options.productBehaviorSnapshots.watermelon!,
        // A floor no recipe can meet together with the 30 % carrier.
        ecoFloorPercent: 80,
        optimalCeilingPercent: 85,
        hardLimitPercent: 85,
      };
      return options;
    };
    const options = impossiblePolicy(draft.input);
    const failure = bindProductBehaviorToPreview(
      buildOptimizePreview(draft.input, draft.constraints, OWNER_CREATED_AT, options),
      options.productBehaviorSnapshots,
      options.productBehaviorSnapshots,
      [],
    );
    expect(failure.ok).toBe(false);
    if (failure.ok) return;
    const diagnosis = diagnoseLockConflict({
      baseInput: draft.input,
      baseConstraints: draft.constraints,
      sessionInstructions: [],
      createdAt: OWNER_CREATED_AT,
      options,
      failure,
    });
    expect(diagnosis).toMatchObject({
      status: 'no_safe_relaxation',
      reason: 'locks_are_not_the_cause',
    });
    expect('changes' in diagnosis).toBe(false);
  });

  it('a spent probe budget is reported as such, never as a found or impossible correction', () => {
    const draft = withCustomerGramLocks(ownerFruitRecipe({ batch: 600 }), {
      strawberry: 100,
      cranberry: 130,
    });
    const failure = solve(draft.input, draft.constraints);
    if (failure.ok) throw new Error('fixture must start infeasible');
    const diagnosis = diagnoseLockConflict({
      baseInput: draft.input,
      baseConstraints: draft.constraints,
      sessionInstructions: [],
      createdAt: OWNER_CREATED_AT,
      options: ownerPreviewOptions(draft.input),
      failure,
      maxProbes: 2,
    });
    if (diagnosis.status === 'relaxation_found') {
      expect(diagnosis.searchComplete).toBe(false);
      expect(legal(solveWith(draft, lockRelaxationInstructions(diagnosis)))).toBe(true);
    } else {
      expect(diagnosis.reason).toBe('search_budget_exhausted');
    }
    expect(diagnosis.probes).toBeLessThanOrEqual(2);
  });

  it('reads the exact gap from the Main envelope verdict itself (one authority, pinned to its wording)', () => {
    // 600 g: Watermelon 60 g = 10 % (floor 20 %), milk 136 g = 22.7 % (carrier floor 30 %).
    const recipe = ownerFruitRecipe({ batch: 600 });
    const verdict = verifyMainEnvelope({
      recipe,
      snapshots: ownerFruitSnapshots(recipe),
      mode: 'optimal',
      enforceFloor: true,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    const blockers = lockConflictBlockers({
      ok: false,
      code: 'no_proposal',
      blockingViolations: verdict.violations,
    });
    expect(blockers).toContainEqual({
      code: 'main_below_floor',
      actualPercent: 10,
      limitPercent: 20,
    });
    expect(blockers).toContainEqual({
      code: 'liquid_dairy_carrier_below_floor',
      actualPercent: 22.7,
      limitPercent: 30,
    });
    // The hard-limit verdict states only its limit — never an invented actual.
    const above = ownerFruitRecipe({ batch: 1000, watermelon: 500, strawberry: 20, cranberry: 20 });
    const aboveVerdict = verifyMainEnvelope({
      recipe: above,
      snapshots: ownerFruitSnapshots(above),
      mode: 'optimal',
      enforceFloor: true,
    });
    expect(aboveVerdict.ok).toBe(false);
    if (aboveVerdict.ok) return;
    expect(
      lockConflictBlockers({
        ok: false,
        code: 'no_proposal',
        blockingViolations: aboveVerdict.violations,
      }),
    ).toContainEqual({ code: 'main_above_hard_limit', actualPercent: null, limitPercent: 45 });
  });

  it('is only offered for refusals a lock relaxation could answer', () => {
    const unlocked = ownerFruitRecipe({ batch: 600 });
    const lockedDraft = withCustomerGramLocks(unlocked, { strawberry: 100, cranberry: 130 });
    const failure = solve(lockedDraft.input, lockedDraft.constraints);
    // No customer lock: never blamed on locks.
    expect(lockConflictDiagnosable(failure, unlocked, { byLineId: {} })).toBe(false);
    // A Direction preference that cannot be reached is a consent question.
    expect(
      lockConflictDiagnosable(
        { ok: false, code: 'no_proposal', directionTargetUnreached: true },
        lockedDraft.input,
        lockedDraft.constraints,
      ),
    ).toBe(false);
    // Product-data refusals keep their own explanation.
    expect(
      lockConflictDiagnosable(
        { ok: false, code: 'missing_required_role', role: 'product_dose', messagePl: 'x' },
        lockedDraft.input,
        lockedDraft.constraints,
      ),
    ).toBe(false);
  });
});
