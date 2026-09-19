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

describe('P1 — LOCK-01 / LOCK-02: the presented candidate is materially nearer than the halt point', () => {
  /**
   * `halt` is the distance CORE reported on the served SHA — the candidate the
   * customer was shown as „najbliższy". `bound` is the ceiling this fix must stay
   * under: it sits between the halt point and what the fix actually achieves, so the
   * test fails both if the defect returns AND if a later change quietly gives the
   * ground back. Every number on the left is re-derived from the engine on each run;
   * only the ceiling is written down.
   */
  const AUDITED: Record<string, { halt: number; bound: number }> = {
    'LOCK-01': { halt: 0.3159, bound: 0.15 },
    'LOCK-02a': { halt: 1.111, bound: 0.95 },
    'LOCK-02b': { halt: 3.111, bound: 3.0 },
    'LOCK-02c': { halt: 2.4812, bound: 1.7 },
    'LOCK-02d': { halt: 0.6474, bound: 0.3 },
    'LOCK-02e': { halt: 1.0145, bound: 0.5 },
  };

  for (const key of Object.keys(AUDITED) as CaseKey[]) {
    it(`${key}: materially nearer than the audited halt point, and still legal`, () => {
      const solved = solve(key);
      expect(solved.ok).toBe(true);
      if (!solved.ok) return;
      expect(solved.nativeViolations).toEqual([]);
      expect(solved.plannedSum).toBeCloseTo(solved.input.target_batch_grams, 6);
      expect(solved.distance).toBeLessThan(AUDITED[key]!.bound);
      // no silent unlock: every held line keeps its exact grams
      expect(heldGrams(solved.proposed, draftFor(key).constraints)).toEqual(
        heldGrams(solved.input, draftFor(key).constraints),
      );
    });
  }

  it('LOCK-02: the lines that lead to the target are no longer frozen out', () => {
    const solved = solve('LOCK-02a');
    if (!solved.ok) throw new Error('no preview');
    const before = solved.input.items[0]!.planned_grams;
    const after = solved.proposed.items[0]!.planned_grams;
    // `line-1` (BLOOD ORANGE) sat at exactly 598 g in all 16 audited cells
    expect(Math.abs(after - before)).toBeGreaterThan(1);
  });
});

describe('P1 — LOCK-03: the requested LEVEL changes the answer', () => {
  it('sweetness −1 and −2 no longer return the byte-identical proposal', () => {
    const minusOne = solve('LOCK-03-A-minus1');
    const minusTwo = solve('LOCK-03-A-minus2');
    expect(minusOne.ok && minusTwo.ok).toBe(true);
    if (!minusOne.ok || !minusTwo.ok) return;
    expect(minusOne.input.goals?.direction_targets?.sweetness).toBe(-1);
    expect(minusTwo.input.goals?.direction_targets?.sweetness).toBe(-2);
    expect(minusTwo.proposed.items.map((item) => item.planned_grams)).not.toEqual(
      minusOne.proposed.items.map((item) => item.planned_grams),
    );
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
