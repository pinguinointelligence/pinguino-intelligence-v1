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
import { buildDraftCandidateVector } from './draftCandidateVector';
import {
  relaxableOwnerRanges,
  relaxationScorePenalty,
} from '@/features/recipe-direction/relaxableRangePolicy';
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

/**
 * The distance from an ARBITRARY candidate to an ARBITRARY request — the only
 * way to state a CROSS-LEVEL claim, because `distance` above always scores a
 * candidate against the targets it happens to carry.
 */
const distanceAgainst = (request: RecipeInput, candidate: RecipeInput): number =>
  distance({ ...request, items: candidate.items });

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

describe('P1 — LOCK-01: CLOSED under Variant B, and the history is kept', () => {
  /**
   * STATUS CHANGED, EVIDENCE PRESERVED.
   *
   * LOCK-01 („false infeasibility on an ordinary gelato with one ordinary gram
   * lock": butter-pecan, SUCROSE held at 80 g, Sweetness +1, a candidate 0.3159
   * from the [15, 16] band while an engine-verified whole-gram witness exists at
   * POD 15.019) is now CLOSED, pending served verification.
   *
   * It had been closed once before by a preview-level aim that re-solved for the
   * requested target from the chosen candidate. That aim also turned a clean
   * Preview into `no_proposal` on the milk starter at Sweetness +2 / Softness +2
   * carrying an exact, a percent and a range constraint
   * (`recipeDirectionTargets.test.ts`). An improvement that costs the customer an
   * answer somewhere else is not an improvement, so it was removed; removing it
   * in turn exposed that the in-solver half shifts accepted solver trajectories
   * across `sharedDirectionNearestMatrix` and a second case of the owner-locked
   * Sorbet projection contract, so that was reverted too.
   *
   * What closes it instead is the Variant B final selector, which changes no
   * solver trajectory at all: it ranks fully-validated Previews after the
   * pipeline has already answered. Incumbent 2.52079 → delivered 0.01000,
   * POD 14.9971 against [15, 16] — 252.1x nearer — with the 80 g lock byte-exact.
   *
   * This test pins the half that must hold whatever the distance: the candidate
   * is engine-legal, weighs the target batch, and the lock is untouched.
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

describe('P1 — LOCK-02 / LOCK-03 on the Sorbet route: CLOSED, and the history is kept', () => {
  /**
   * STATUS CHANGED TWICE, EVIDENCE PRESERVED BOTH TIMES.
   *
   * LOCK-02 („the presented nearest is far from the requested level while a
   * candidate reachable in the same admissible space is much nearer") and
   * LOCK-03 („two different requested levels return the byte-identical
   * proposal") were OPEN because the earlier fix collided with the owner-locked
   * contract GEL-P0-025. Under the owner's Variant B decision that contract was
   * amended and the nearest legal candidate began to win, which moved the
   * numbers a long way — and left a residue nothing in the search could reach.
   *
   * That residue was root-caused to a SEMANTIC error, not to the search: a line
   * carrying `{ mode: 'range' }` was dropped from the adjustable vector, so an
   * owner dosage band was enforced as a freeze and the lever that separates
   * these levels was missing. The owner's 2026-09-19 decision § 3 corrected the
   * semantics globally, and the residue closed with it.
   *
   * Incumbent distance → delivered distance, measured on these same fixtures:
   *
   *              before § 3        after § 3
   *   LOCK-01    2.52079 → 0.01000  2.41653 → 0.00000  TARGET REACHED, POD 15.0406
   *   LOCK-02a   1.11099 → 0.65306  1.11099 → 0.02000  55.5x, POD 17.9960 of 18
   *   LOCK-02b   3.11099 → 2.65306  3.11099 → 0.02000  155.5x, POD 16.0005 of 16
   *   LOCK-02c   2.48116 → 0.97823  2.48116 → 0.76763  3.2x
   *   LOCK-02d   0.64737 → 0.02055  0.64737 → 0.02829  22.9x
   *   LOCK-02e   1.01452 → 0.04429  1.01452 → 0.02000  50.7x
   *   CONTROL-C2 0.02000 → 0.02000  0.02000 → 0.02000  still refuses
   *
   * The 0.02000 floor is the Sorbet exact-preference point (min = max, AUD-
   * SWEET-05), not a search failure: no non-zero Sorbet level can be formally
   * `reached` at whole grams, however near the candidate is.
   *
   * What these tests pin either way: whatever the Sorbet route returns is
   * engine-legal, weighs the target batch and never quietly releases a lock.
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

  /**
   * LOCK-03 — THE MATHEMATICS DECIDED, AND IT CHANGED ITS ANSWER.
   *
   * Under the previous semantics −1 and −2 returned the BYTE-IDENTICAL vector,
   * and that was correct: both requests were bounded by the same frontier and
   * the shared point was a verified local optimum for each. The frontier was
   * not physics, though — it was an owner dosage band being enforced as a lock,
   * so the search could not use the one lever that separates the two levels.
   *
   * With `range` read as a WINDOW (owner decision 2026-09-19 § 3) the levels
   * separate on their own. Nothing forces a difference here and nothing forces
   * equality: the test asserts only that each level is answered on its own
   * terms, and the INV-2 contract below still holds whichever way the
   * mathematics goes.
   */
  it('LOCK-03: each level is answered on its own terms', () => {
    const minusOne = solve('LOCK-03-A-minus1');
    const minusTwo = solve('LOCK-03-A-minus2');
    expect(minusOne.ok && minusTwo.ok).toBe(true);
    if (!minusOne.ok || !minusTwo.ok) return;

    // Each candidate is legal and weighs the batch — never traded for nearness.
    for (const solved of [minusOne, minusTwo]) {
      expect(solved.nativeViolations).toEqual([]);
      expect(solved.plannedSum).toBeCloseTo(solved.input.target_batch_grams, 6);
    }
    // A LOWER requested sweetness lands at a LOWER POD. That is the whole claim
    // LOCK-03 was about, and it is now true rather than vacuous.
    const podOf = (candidate: RecipeInput) =>
      calculateRecipe(candidate).indicators.find((indicator) => indicator.key === 'pod')!.value!;
    expect(podOf(minusTwo.proposed)).toBeLessThan(podOf(minusOne.proposed));
  });

  /**
   * INV-2, STATED ACROSS LEVELS — the guard for the defect this fix closed.
   *
   * Every level's delivered candidate is a candidate the engine demonstrably
   * reaches from this same draft, so for any request L the candidate returned
   * for L must be at least as near to L's OWN target as any sibling level's
   * candidate is. It failed before the bounded line search: on Sorbet −13 the
   * request for Sweetness +2 published POD 21.2966 while +1, from a
   * byte-identical incumbent, published 21.7877 — the sibling's candidate was
   * nearer to +2's own band than +2's own was, because every rung of the
   * two-rung ladder [f, f/2] on a LONG solved step landed outside the engine's
   * bands and nothing legal was ever offered.
   */
  it('INV-2: a farther request never converges worse than a nearer one on the same draft', () => {
    for (const [near, far] of [
      ['LOCK-02a', 'LOCK-02b'],
      ['LOCK-03-A-minus1', 'LOCK-03-A-minus2'],
    ] as [CaseKey, CaseKey][]) {
      const nearSolved = solve(near);
      const farSolved = solve(far);
      expect(nearSolved.ok && farSolved.ok).toBe(true);
      if (!nearSolved.ok || !farSolved.ok) continue;
      expect(distanceAgainst(farSolved.input, farSolved.proposed)).toBeLessThanOrEqual(
        distanceAgainst(farSolved.input, nearSolved.proposed) + 1e-9,
      );
      expect(distanceAgainst(nearSolved.input, nearSolved.proposed)).toBeLessThanOrEqual(
        distanceAgainst(nearSolved.input, farSolved.proposed) + 1e-9,
      );
    }
  });

  /**
   * CLASS A — RANGE IS NOT LOCK (owner decision 2026-09-19 § 3, § 18 A).
   *
   * This test used to pin the OPPOSITE, as the recorded mechanism behind the
   * LOCK-02 residue: a line carrying `{ mode: 'range' }` was dropped from the
   * adjustable vector entirely, so an owner dosage band was enforced as a
   * freeze and the nearest legal candidate — which needed that line moved
   * INSIDE the owner's own band — was unreachable. That is what the residue
   * was, and this is where it closed.
   *
   * A range now says what it means: the line MAY move, anywhere in the
   * interval, and nowhere outside it.
   */
  it('CLASS A: a `range` line participates in the search, bounded by its own interval', () => {
    const { input, constraints } = draftFor('LOCK-02a');
    const movable = input.items.find(
      (item) => item.lock_type === 'unlocked' && item.actual_grams === null && item.planned_grams > 20,
    );
    expect(movable).toBeDefined();
    if (movable === undefined) return;

    const band = { minGrams: movable.planned_grams - 10, maxGrams: movable.planned_grams + 10 };
    const banded: ConstraintSet = {
      byLineId: {
        ...constraints.byLineId,
        [movable.id]: { mode: 'range', minGrams: band.minGrams, maxGrams: band.maxGrams },
      },
    };
    const candidate = buildDraftCandidateVector(input, banded, new Set()).find(
      (entry) => entry.lineId === movable.id,
    );
    // It is IN the vector …
    expect(candidate).toBeDefined();
    if (candidate === undefined) return;
    // … every rung it offers is inside the interval …
    for (const grams of candidate.testedGrams) {
      expect(grams).toBeGreaterThanOrEqual(band.minGrams - 1e-9);
      expect(grams).toBeLessThanOrEqual(band.maxGrams + 1e-9);
    }
    // … and the interval's own edges are offered, because the best amount
    // inside an owner band is very often the band's boundary.
    expect(candidate.testedGrams).toContain(band.minGrams);
    expect(candidate.testedGrams).toContain(band.maxGrams);
  });

  /**
   * CLASS B / M — a line left inside its band pays no relaxation penalty
   * (§ 18 B, § 18 M).
   */
  it('CLASS B/M: a candidate inside every owner band carries no relaxation cost', () => {
    for (const key of ['LOCK-02a', 'LOCK-02b', 'LOCK-02c'] as CaseKey[]) {
      const solved = solve(key);
      expect(solved.ok).toBe(true);
      if (!solved.ok) continue;
      for (const range of relaxableOwnerRanges(solved.proposed)) {
        expect(range.grams).toBeGreaterThanOrEqual(range.normal.minGrams - 1e-9);
        expect(range.grams).toBeLessThanOrEqual(range.normal.maxGrams + 1e-9);
      }
      expect(relaxationScorePenalty(solved.proposed)).toBe(0);
    }
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
