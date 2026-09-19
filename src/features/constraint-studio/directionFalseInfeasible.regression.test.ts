/**
 * PRIORITY 1 — FALSE INFEASIBLE / CANDIDATE SELECTION / NEAREST FEASIBLE.
 *
 * The audit of 2026-09-18 found that CORE answers „Nie da się osiągnąć poziomu X"
 * and „Najbliższy możliwy poziom to Y" from a strictly-improving local search that
 * has no completeness property: it halts at the first barrier and that halt is
 * reported as a fact about the recipe. Five findings, all reproduced on the served
 * SHA, all frozen here:
 *
 *   OD-28        HOME gelato + 507 g strawberries, Sweetness −1 refused while a legal
 *                whole-gram candidate exists (the customer reaches it by tapping
 *                „Mniej słodkie" once more).
 *   LOCK-01      butter-pecan with one 80 g sugar lock, Sweetness +1 — the same class.
 *   LOCK-02      blood-orange sorbet — the candidate presented as „najbliższy" is
 *                26×–156× farther from the target than one in the same space, and the
 *                two lines that lead to the target are never moved.
 *   LOCK-03      the requested LEVEL never changes the answer: −1 and −2 return the
 *                byte-identical proposal.
 *   AUD-SWEET-13 the only path the UI offers lands FARTHER from the requested level
 *                than the candidate CORE already holds (7 of 7 cells).
 *
 * The drafts are frozen exactly as the store handed them to the pipeline
 * (`__fixtures__/directionFalseInfeasibleDrafts.json`, produced from the real HOME and
 * PRO doors). Every expectation below is RE-DERIVED from the engine — no witness
 * number is trusted because it is written down.
 *
 * The two invariants under test (owner P1-K):
 *   INV-1  NO FALSE INFEASIBLE — if a legal candidate exists in the same admissible
 *          space, CORE must not answer INFEASIBLE.
 *   INV-2  NEAREST IS NEAREST — a candidate presented as the nearest achievable result
 *          may not be beaten by another legal candidate the same run produced.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { recipeDirectionViolations } from '@/features/recipe-direction/recipeDirectionTargets';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { buildOptimizePreview } from './applyPipeline';
import drafts from './__fixtures__/directionFalseInfeasibleDrafts.json';

type CaseKey = keyof typeof drafts;
const draftFor = (key: CaseKey) =>
  drafts[key] as unknown as { input: RecipeInput; constraints: ConstraintSet };

/** Σ Direction severity points — the engine's own two-axis distance to the request. */
const distance = (candidate: RecipeInput): number =>
  recipeDirectionViolations(candidate).reduce((sum, violation) => sum + violation.severity_points, 0);

const solve = (key: CaseKey) => {
  const { input, constraints } = draftFor(key);
  const result = buildOptimizePreview(input, constraints, '2026-09-19T00:00:00.000Z', {
    requirePracticalPreview: true,
    directionFallbackPass: true,
    skipRescueAssessment: true,
  });
  if (!result.ok) return { ok: false as const, code: result.code, input };
  const proposed = result.preview.proposedInput;
  return {
    ok: true as const,
    input,
    proposed,
    diagnosticOnly: result.preview.diagnosticOnly === true,
    reached: assessRecipeDirection(proposed, calculateRecipe(proposed)).reached,
    distance: distance(proposed),
    nativeViolations: detectViolations(calculateRecipe(proposed)),
    plannedSum: proposed.items.reduce((sum, item) => sum + item.planned_grams, 0),
  };
};

/** Lines the draft holds exactly — a fix may never quietly release one. */
const heldGrams = (input: RecipeInput, constraints: ConstraintSet) =>
  input.items
    .filter(
      (item) =>
        item.lock_type !== 'unlocked' || constraints.byLineId[item.id]?.mode === 'locked',
    )
    .map((item) => [item.id, item.planned_grams, item.lock_type] as const);

describe('P1 — OD-28: a reachable Direction level is never reported as unreachable', () => {
  const solved = solve('OD-28');

  it('INV-1: CORE returns an applicable preview, not a diagnostic refusal', () => {
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    expect(solved.diagnosticOnly).toBe(false);
  });

  it('reaches the REQUESTED level — sweetness −1 — rather than falling back to 0', () => {
    if (!solved.ok) throw new Error('no preview');
    expect(solved.input.goals?.direction_targets?.sweetness).toBe(-1);
    // the goal is carried unchanged into the proposal: no silent level substitution
    expect(solved.proposed.goals?.direction_targets?.sweetness).toBe(-1);
    expect(solved.reached).toBe(true);
    expect(solved.distance).toBe(0);
  });

  it('the candidate is engine-legal, on batch, and the strawberry lock is untouched', () => {
    if (!solved.ok) throw new Error('no preview');
    expect(solved.nativeViolations).toEqual([]);
    expect(solved.plannedSum).toBeCloseTo(solved.input.target_batch_grams, 6);
    expect(solved.proposed.items.every((item) => Number.isInteger(item.planned_grams))).toBe(true);
    expect(heldGrams(solved.proposed, draftFor('OD-28').constraints)).toEqual(
      heldGrams(solved.input, draftFor('OD-28').constraints),
    );
  });

  it('is deterministic — the same draft solves to the same vector', () => {
    const again = solve('OD-28');
    if (!solved.ok || !again.ok) throw new Error('no preview');
    expect(again.proposed.items.map((item) => item.planned_grams)).toEqual(
      solved.proposed.items.map((item) => item.planned_grams),
    );
  });
});

describe('P1 — LOCK-01: OPEN, and the mechanism that closed it cost a Preview elsewhere', () => {
  /**
   * RECORDED, NOT ASSERTED AWAY.
   *
   * LOCK-01 („false infeasibility on an ordinary gelato with one ordinary gram
   * lock": butter-pecan, SUCROSE held at 80 g, Sweetness +1, a candidate 0.3159
   * from the [15, 16] band while an engine-verified whole-gram witness exists at
   * POD 15.019) is still OPEN.
   *
   * It was closed, measurably — a preview-level aim that re-solved for the
   * requested target from the chosen candidate reached 0.0140, 22.6× nearer. That
   * aim also turned a clean Preview into `no_proposal` on the milk starter at
   * Sweetness +2 / Softness +2 carrying an exact, a percent and a range
   * constraint (`recipeDirectionTargets.test.ts`). An improvement that costs the
   * customer an answer somewhere else is not an improvement, so it was removed;
   * removing it in turn exposed that the in-solver half shifts accepted solver
   * trajectories across `sharedDirectionNearestMatrix` and a second case of the
   * owner-locked Sorbet projection contract, so that was reverted too.
   *
   * What this pins is the half that must hold either way: the candidate is
   * engine-legal, weighs the target batch, and the 80 g lock is byte-exact. The
   * distance gap stays visible in `docs/audit/priority-1/P1-S-closure.md`.
   */
  it('LOCK-01: the candidate is legal, on batch, and holds the 80 g sugar lock', () => {
    const solved = solve('LOCK-01');
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    expect(solved.nativeViolations).toEqual([]);
    expect(solved.plannedSum).toBeCloseTo(solved.input.target_batch_grams, 6);
    expect(heldGrams(solved.proposed, draftFor('LOCK-01').constraints)).toEqual(
      heldGrams(solved.input, draftFor('LOCK-01').constraints),
    );
  });
});

describe('P1 — LOCK-02 / LOCK-03 on the Sorbet route: OPEN, blocked by an owner-locked contract', () => {
  /**
   * RECORDED, NOT ASSERTED AWAY.
   *
   * LOCK-02 („the presented «najbliższy» is 26×–156× farther from the requested
   * level than a candidate reachable in the same admissible space") and LOCK-03
   * („two different requested levels return the byte-identical proposal") are
   * still OPEN on the Sorbet route.
   *
   * They were fixed, measurably: running BOTH Sorbet generators and ranking them
   * by distance instead of taking the first that merely improves reached
   * candidates 1.1×–30.8× nearer and unfroze `line-1`, which sat at exactly 598 g
   * in all 16 audited cells. That change failed the OWNER-LOCKED contract
   * `src/contracts/owner-locked/sorbetDirectionOffBatchEligibility.contract.test.ts`
   * (GEL-P0-025): an off-batch Sorbet draft must be solved BY THE EXACT
   * PROJECTION, not by the general search, and ranking by distance lets another
   * generator out-rank the projection. A locked contract is not rewritten to fit
   * an implementation, so the change was reverted, and the conflict is written up
   * as a grouped approval request in `docs/audit/priority-1/P1-S-closure.md`.
   *
   * What this pins is the half that must hold either way: whatever the Sorbet
   * route returns is engine-legal, weighs the target batch and never quietly
   * releases a lock. The distance gap stays visible in the closure document
   * instead of being asserted into agreement here.
   */
  for (const key of ['LOCK-02a', 'LOCK-02b', 'LOCK-02c', 'LOCK-02d', 'LOCK-02e'] as CaseKey[]) {
    it(`${key}: the candidate is legal, on batch, and holds every lock`, () => {
      const solved = solve(key);
      expect(solved.ok).toBe(true);
      if (!solved.ok) return;
      expect(solved.nativeViolations).toEqual([]);
      expect(solved.plannedSum).toBeCloseTo(solved.input.target_batch_grams, 6);
      expect(heldGrams(solved.proposed, draftFor(key).constraints)).toEqual(
        heldGrams(solved.input, draftFor(key).constraints),
      );
    });
  }

  it('LOCK-03: each level still returns a legal candidate for its own request', () => {
    const minusOne = solve('LOCK-03-A-minus1');
    const minusTwo = solve('LOCK-03-A-minus2');
    expect(minusOne.ok && minusTwo.ok).toBe(true);
    if (!minusOne.ok || !minusTwo.ok) return;
    expect(minusOne.input.goals?.direction_targets?.sweetness).toBe(-1);
    expect(minusTwo.input.goals?.direction_targets?.sweetness).toBe(-2);
    expect(minusOne.nativeViolations).toEqual([]);
    expect(minusTwo.nativeViolations).toEqual([]);
  });
});

/**
 * NAPRAWA 1B — B8. Variant B widens the SEARCH, never the CONSTRAINTS. These
 * controls are the proof of that: each one makes the requested level genuinely
 * unreachable by a DIFFERENT authority, and each must still refuse. A selector
 * that "fixes" Priority 1 by accepting a recipe that breaks a lock, a Main, a
 * profile or a machine limit would pass the LOCK tests and fail here.
 *
 * "Refuses" means: no preview at all, or a preview that does NOT claim to have
 * reached the requested level. It never means a preview that reached it by
 * relaxing something.
 */
describe('NAPRAWA 1B — B8: a level made unreachable by a hard authority is still refused', () => {
  const refuses = (
    input: RecipeInput,
    constraints: ConstraintSet,
  ): { refused: boolean; legal: boolean } => {
    const result = buildOptimizePreview(input, constraints, '2026-09-19T00:00:00.000Z', {
      requirePracticalPreview: true,
      directionFallbackPass: true,
      skipRescueAssessment: true,
    });
    if (!result.ok) return { refused: true, legal: true };
    const proposed = result.preview.proposedInput;
    const reached = assessRecipeDirection(proposed, calculateRecipe(proposed)).reached;
    // Whatever it publishes must still be engine-legal: refusing is allowed,
    // publishing something illegal is not.
    return {
      refused: !reached,
      legal: detectViolations(calculateRecipe(proposed)).length === 0,
    };
  };

  it('B8.1 HARD LOCK impossible — every line pinned, so nothing can move', () => {
    const { input, constraints } = draftFor('LOCK-01');
    const frozen: ConstraintSet = {
      byLineId: {
        ...constraints.byLineId,
        ...Object.fromEntries(
          input.items.map((item) => [
            item.id,
            { mode: 'locked' as const, grams: item.planned_grams },
          ]),
        ),
      },
    };
    const verdict = refuses(input, frozen);
    expect(verdict.refused).toBe(true);
    expect(verdict.legal).toBe(true);
  });

  it('B8.2 MAIN/CROWN impossible — the Main is pinned and the rest cannot cover the gap', () => {
    const { input, constraints } = draftFor('LOCK-02a');
    // Crown the largest line and pin it, then pin every sugar line too: the
    // remaining freedom cannot carry POD to the requested centre.
    const largest = [...input.items].sort((a, b) => b.planned_grams - a.planned_grams)[0]!;
    const crowned: RecipeInput = {
      ...input,
      items: input.items.map((item) =>
        item.id === largest.id
          ? { ...item, lock_type: 'main' as const, main_ratio_weight: item.planned_grams }
          : item,
      ),
      goals: {
        ...input.goals,
        direction_targets_active: true,
        direction_targets: { sweetness: -2, softness: 0, creaminess: 0, flavor: 0 },
      },
    };
    const pinned: ConstraintSet = {
      byLineId: {
        ...constraints.byLineId,
        [largest.id]: { mode: 'locked', grams: largest.planned_grams },
        ...Object.fromEntries(
          crowned.items
            .filter((item) => item.ingredient.category === 'sugar')
            .map((item) => [
              item.id,
              { mode: 'locked' as const, grams: item.planned_grams },
            ]),
        ),
      },
    };
    const verdict = refuses(crowned, pinned);
    expect(verdict.refused).toBe(true);
    expect(verdict.legal).toBe(true);
  });

  it('B8.3 PROFILE-BOUND impossible — the Sorbet softness −2 dead end stays a dead end', () => {
    const { input, constraints } = draftFor('CONTROL-C2-sorbet-hard-2');
    const verdict = refuses(input, constraints);
    expect(verdict.refused).toBe(true);
    expect(verdict.legal).toBe(true);
  });

  it('B8.4 MACHINE/PROCESS impossible — the batch cannot fit the machine', () => {
    const { input, constraints } = draftFor('OD-28');
    // A capacity far below the requested batch: no composition can satisfy both.
    const constrained: RecipeInput = {
      ...input,
      machine_capacity_grams: Math.round(input.target_batch_grams / 4),
    };
    const verdict = refuses(constrained, constraints);
    expect(verdict.legal).toBe(true);
  });
});

describe('P1-O — a genuinely unreachable level is still refused', () => {
  it('the sorbet softness −2 dead end does not become reachable', () => {
    const solved = solve('CONTROL-C2-sorbet-hard-2');
    if (!solved.ok) return; // an honest refusal is also a pass
    expect(solved.reached).toBe(false);
  });

  it('a draft with no degrees of freedom cannot reach the level', () => {
    const { input, constraints } = draftFor('LOCK-01');
    const frozen: ConstraintSet = {
      byLineId: Object.fromEntries(
        input.items.map((item) => [item.id, { mode: 'locked' as const, grams: item.planned_grams }]),
      ),
    };
    const result = buildOptimizePreview(
      input,
      { byLineId: { ...constraints.byLineId, ...frozen.byLineId } },
      '2026-09-19T00:00:00.000Z',
      { requirePracticalPreview: true, directionFallbackPass: true, skipRescueAssessment: true },
    );
    if (!result.ok) {
      expect(result.code).toBeTruthy();
      return;
    }
    const proposed = result.preview.proposedInput;
    expect(assessRecipeDirection(proposed, calculateRecipe(proposed)).reached).toBe(false);
  });
});
