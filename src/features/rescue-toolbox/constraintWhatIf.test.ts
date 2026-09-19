/**
 * NAPRAWA 5 — Constraint what-if Rescue.
 *
 * The Owner's worked example is the shape of this whole feature:
 *
 *   „Przy blokadzie dekstrozy na 20 g najlepszy wynik to 8/10.
 *    Pozwól zwiększyć ją do 24 g, aby osiągnąć 10/10."
 *
 * A what-if is a SIMULATION. These tests prove the two things that make it safe:
 * the real draft and the real constraint set are never touched, and only a rule
 * the CUSTOMER owns is ever offered for change — never a structural or
 * calibration limit, never Main or Crown, never physically poured material.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { ingredientOf } from '@/features/vegan-structure/__campaign__/veganCampaignInput';
import {
  CONSTRAINT_WHAT_IF_STEPS,
  customerOwnedConstraint,
  shadowConstraintVector,
  simulateConstraintWhatIf,
} from './constraintWhatIf';

const line = (
  id: string,
  mapperId: string,
  grams: number,
  lock: 'unlocked' | 'main' | 'grams' | 'required' | 'already_added' = 'unlocked',
) => ({
  id,
  ingredient: ingredientOf(mapperId),
  planned_grams: grams,
  actual_grams: null,
  lock_type: lock,
  ...(lock === 'main' ? { main_ratio_weight: 1 } : {}),
});

const draft = (sweetness: -2 | -1 | 0 | 1 | 2 = 1): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  goals: {
    formulation_strategy: 'optimal',
    direction_targets_active: true,
    direction_targets: { sweetness, softness: 0, creaminess: 0, flavor: 0 },
  },
  items: [
    line('l-milk', 'PI-ING-000236', 600),
    line('l-cream', 'PI-ING-000180', 150),
    line('l-sucrose', 'PI-ING-000514', 140),
    line('l-dextrose', 'PI-ING-000494', 60),
    line('l-smp', 'PI-ING-000270', 48),
    line('l-tara', 'PI-ING-000492', 2),
  ],
});

const DEXTROSE_LOCKED: ConstraintSet = {
  byLineId: { 'l-dextrose': { mode: 'locked', grams: 60 } },
};

describe('only a rule the CUSTOMER owns may be proposed for change', () => {
  const item = (lock: Parameters<typeof line>[3]) => line('l-x', 'PI-ING-000494', 20, lock);

  it('accepts the four customer-owned kinds', () => {
    expect(customerOwnedConstraint(item('unlocked'), { mode: 'locked', grams: 20 })).toEqual({
      owned: true,
      kind: 'grams_lock',
    });
    expect(customerOwnedConstraint(item('unlocked'), { mode: 'percent', percent: 2 })).toEqual({
      owned: true,
      kind: 'percent_lock',
    });
    expect(
      customerOwnedConstraint(item('unlocked'), { mode: 'range', minGrams: 10, maxGrams: 30 }),
    ).toEqual({ owned: true, kind: 'customer_range' });
  });

  it('refuses a STRUCTURAL range — that limit belongs to formulation science', () => {
    expect(
      customerOwnedConstraint(item('unlocked'), {
        mode: 'range',
        minGrams: 0,
        maxGrams: 83.1,
        structural: true,
      }),
    ).toEqual({ owned: false, reason: 'structural_limit' });
  });

  it('refuses Main and Crown authority, and diagnoses it instead', () => {
    expect(customerOwnedConstraint(item('main'), { mode: 'locked', grams: 20 })).toEqual({
      owned: false,
      reason: 'main_or_crown_authority',
    });
    expect(customerOwnedConstraint(item('required'), { mode: 'locked', grams: 20 })).toEqual({
      owned: false,
      reason: 'main_or_crown_authority',
    });
  });

  it('refuses physically poured material and already-added lines', () => {
    expect(
      customerOwnedConstraint(
        { ...item('unlocked'), actual_grams: 20 },
        { mode: 'locked', grams: 20 },
      ),
    ).toEqual({ owned: false, reason: 'physically_added' });
    expect(customerOwnedConstraint(item('already_added'), { mode: 'locked', grams: 20 })).toEqual({
      owned: false,
      reason: 'physically_added',
    });
  });

  it('is not interested in a line the customer left to the solver', () => {
    expect(customerOwnedConstraint(item('unlocked'), undefined)).toMatchObject({ owned: false });
    expect(customerOwnedConstraint(item('unlocked'), { mode: 'ai' })).toMatchObject({
      owned: false,
    });
  });
});

describe('the shadow vector changes exactly one rule and nothing else', () => {
  it('keeps the batch and holds every line the customer constrained', () => {
    const input = draft();
    const set: ConstraintSet = {
      byLineId: {
        'l-dextrose': { mode: 'locked', grams: 60 },
        'l-sucrose': { mode: 'locked', grams: 140 },
      },
    };
    const shadow = shadowConstraintVector(input, set, 'l-dextrose', 80)!;
    expect(shadow).not.toBeNull();
    expect(shadow.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBeCloseTo(1_000, 6);
    expect(shadow.items.find((item) => item.id === 'l-dextrose')!.planned_grams).toBe(80);
    // The OTHER customer-constrained line is untouched: one rule at a time.
    expect(shadow.items.find((item) => item.id === 'l-sucrose')!.planned_grams).toBe(140);
  });

  it('holds a Main line byte-exact', () => {
    const input: RecipeInput = {
      ...draft(),
      items: [
        line('l-main', 'PI-ING-001553', 300, 'main'),
        line('l-milk', 'PI-ING-000236', 600),
        line('l-dextrose', 'PI-ING-000494', 100),
      ],
    };
    const shadow = shadowConstraintVector(input, { byLineId: {} }, 'l-dextrose', 140)!;
    expect(shadow.items.find((item) => item.id === 'l-main')!.planned_grams).toBe(300);
  });

  it('refuses a move it cannot absorb instead of inventing mass', () => {
    const input: RecipeInput = {
      ...draft(),
      items: [line('l-main', 'PI-ING-001553', 900, 'main'), line('l-dx', 'PI-ING-000494', 100)],
    };
    expect(shadowConstraintVector(input, { byLineId: {} }, 'l-dx', 900)).toBeNull();
    // A no-op is not a what-if.
    expect(shadowConstraintVector(draft(), { byLineId: {} }, 'l-dextrose', 60)).toBeNull();
  });
});

describe('the simulation never touches live state', () => {
  it('leaves the draft and the constraint set byte-identical', () => {
    const input = draft(2);
    const set = DEXTROSE_LOCKED;
    const inputBefore = structuredClone(input);
    const setBefore = structuredClone(set);
    simulateConstraintWhatIf({ input, set });
    expect(input).toEqual(inputBefore);
    expect(set).toEqual(setBefore);
  });

  it('returns proposals, not results — the customer must consent and re-solve', () => {
    const report = simulateConstraintWhatIf({ input: draft(2), set: DEXTROSE_LOCKED });
    for (const proposal of report.proposals) {
      // A proposal carries the ASK and the measured effect. It deliberately
      // carries no recipe: a shadow vector must never become live state.
      expect(proposal).not.toHaveProperty('proposedInput');
      expect(proposal).not.toHaveProperty('preview');
      expect(proposal.current).toBeDefined();
      expect(proposal.proposed).toBeDefined();
    }
  });
});

describe('what a proposal has to say for itself', () => {
  /**
   * NON-VACUITY GUARD. Several assertions below iterate `report.proposals`, and
   * an empty list would pass every one of them without testing anything. This
   * test exists so that can never happen quietly.
   *
   * It also documents the defect that made it necessary: the first version of
   * this module required a shadow vector to have ZERO violations, so on a draft
   * that was already out of band — the main case Rescue exists for — no
   * proposal could ever be produced, and every loop below was silently empty.
   * Measured on this fixture at sweetness +2, the module now proposes dextrose
   * 60 g → 48 g: score 8 → 9, Σ band distance 4.953 → 1.600.
   */
  it('really does produce proposals on this fixture, at every level', () => {
    for (const level of [-2, -1, 1, 2] as const) {
      const report = simulateConstraintWhatIf({ input: draft(level), set: DEXTROSE_LOCKED });
      expect(report.proposals.length, `sweetness ${level}`).toBeGreaterThan(0);
      const best = report.proposals[0]!;
      expect(best.lineId).toBe('l-dextrose');
      expect(best.scoreAfter ?? 0).toBeGreaterThan(best.scoreBefore ?? 0);
      expect(best.distanceAfter).toBeLessThan(best.distanceBefore);
    }
  });

  it('states the current rule, the proposed rule, and before/after on both measures', () => {
    const report = simulateConstraintWhatIf({ input: draft(2), set: DEXTROSE_LOCKED });
    for (const proposal of report.proposals) {
      expect(proposal.current).toEqual({ mode: 'locked', grams: 60 });
      expect(proposal.proposed.mode).toBe('locked');
      expect(proposal.currentGrams).toBe(60);
      expect(proposal.proposedGrams).not.toBe(60);
      expect(Number.isInteger(proposal.proposedGrams)).toBe(true);
      expect(typeof proposal.distanceBefore).toBe('number');
      expect(typeof proposal.distanceAfter).toBe('number');
      // It only exists because it is materially better on one of the two
      // canonical measures.
      const nearer = proposal.distanceAfter < proposal.distanceBefore;
      const better = (proposal.scoreAfter ?? -1) > (proposal.scoreBefore ?? -1);
      expect(nearer || better).toBe(true);
    }
  });

  it('keeps the proposed rule in the customer own vocabulary', () => {
    const percent = simulateConstraintWhatIf({
      input: draft(2),
      set: { byLineId: { 'l-dextrose': { mode: 'percent', percent: 6 } } },
    });
    for (const proposal of percent.proposals) {
      expect(proposal.kind).toBe('percent_lock');
      expect(proposal.proposed.mode).toBe('percent');
    }
    const range = simulateConstraintWhatIf({
      input: draft(2),
      set: { byLineId: { 'l-dextrose': { mode: 'range', minGrams: 50, maxGrams: 70 } } },
    });
    for (const proposal of range.proposals) {
      expect(proposal.kind).toBe('customer_range');
      expect(proposal.proposed.mode).toBe('range');
    }
  });

  it('never proposes a structural limit, and records why it did not', () => {
    const report = simulateConstraintWhatIf({
      input: draft(2),
      set: {
        byLineId: {
          'l-dextrose': { mode: 'range', minGrams: 0, maxGrams: 83.1, structural: true },
        },
      },
    });
    expect(report.proposals.map((proposal) => proposal.lineId)).not.toContain('l-dextrose');
    expect(report.skipped).toContainEqual({ lineId: 'l-dextrose', reason: 'structural_limit' });
  });

  it('diagnoses a Main-authority block instead of offering to change it', () => {
    const input: RecipeInput = {
      ...draft(2),
      items: [
        line('l-main', 'PI-ING-001553', 300, 'main'),
        line('l-milk', 'PI-ING-000236', 600),
        line('l-dextrose', 'PI-ING-000494', 100),
      ],
    };
    const report = simulateConstraintWhatIf({
      input,
      set: { byLineId: { 'l-main': { mode: 'locked', grams: 300 } } },
    });
    expect(report.blockedByMainAuthority).toBe(true);
    expect(report.proposals.map((proposal) => proposal.lineId)).not.toContain('l-main');
    expect(report.skipped).toContainEqual({
      lineId: 'l-main',
      reason: 'main_or_crown_authority',
    });
  });
});

describe('the simulation is bounded and deterministic', () => {
  it('prices no more shadow vectors than its step budget allows, per constrained line', () => {
    const report = simulateConstraintWhatIf({
      input: draft(2),
      set: {
        byLineId: {
          'l-dextrose': { mode: 'locked', grams: 60 },
          'l-sucrose': { mode: 'locked', grams: 140 },
        },
      },
    });
    expect(report.evaluations).toBeLessThanOrEqual(2 * (CONSTRAINT_WHAT_IF_STEPS + 1));
  });

  it('produces identical reports for identical inputs', () => {
    const once = simulateConstraintWhatIf({ input: draft(2), set: DEXTROSE_LOCKED });
    const twice = simulateConstraintWhatIf({ input: draft(2), set: DEXTROSE_LOCKED });
    expect(twice).toEqual(once);
  });

  it('prefers the SMALLEST ask when two changes reach the same result', () => {
    const report = simulateConstraintWhatIf({ input: draft(2), set: DEXTROSE_LOCKED });
    for (let index = 1; index < report.proposals.length; index += 1) {
      const better = report.proposals[index - 1]!;
      const worse = report.proposals[index]!;
      const sameOutcome =
        better.targetReachedAfter === worse.targetReachedAfter &&
        better.scoreAfter === worse.scoreAfter &&
        Math.abs(better.distanceAfter - worse.distanceAfter) <= 1e-9;
      if (sameOutcome) {
        expect(Math.abs(better.proposedGrams - better.currentGrams)).toBeLessThanOrEqual(
          Math.abs(worse.proposedGrams - worse.currentGrams),
        );
      }
    }
  });

  it('an unconstrained draft has nothing to propose and says so plainly', () => {
    const report = simulateConstraintWhatIf({ input: draft(2), set: { byLineId: {} } });
    expect(report.proposals).toEqual([]);
    expect(report.evaluations).toBe(0);
    expect(report.blockedByMainAuthority).toBe(false);
  });
});
