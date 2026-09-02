/**
 * ONE INPUT → ONE CANONICAL RESULT for the combined Multi-Main share (owner v1.4 §26).
 *
 * The owner saw three different verdicts for what looked like the same recipe:
 *
 *   Main A 100 g + Main B 100 g   → „Grupa Main przekracza twardy limit 20.7%."
 *   Main A  80 g + Main B  80 g   → „Grupa Main ma 0.2%; wymagane minimum to 10.0%."
 *   same 80 + 80 at exactly 1000 g → „…przekracza twardy limit 20.7%." again
 *
 * The arithmetic was never wrong. `verifyMainEnvelope` is the single authority and it answers
 * 16 % and 20 % for those two inputs, deterministically — the cases below prove it, including with
 * the draft sum drifted off the target batch, which is the condition the owner's draft was in.
 *
 * What was wrong is WHICH STATE the served message described. `bindProductBehaviorToPreview`
 * evaluates `result.preview.proposedInput` — the candidate the solver built — and used to surface
 * that candidate's violation text as if it described the recipe on screen. „0.2 %" is reproduced
 * exactly by Mains at 1 g + 1 g, i.e. a probe candidate, not by the user's 80 + 80. The message is
 * now attributed to the proposal, so the two numbers can never contradict each other again.
 *
 * Units, fixed here so nothing can drift:
 *   • `mainEquivalentFactor` is dimensionless; `equivalent_grams = Σ(planned_grams × factor)`
 *   • `equivalentPercent = equivalent_grams / recipe.target_batch_grams × 100` — a PERCENT, 0…100
 *   • the ×100 happens exactly once, inside the authority; no consumer multiplies again
 *   • the denominator is ALWAYS `target_batch_grams`, never the current draft sum
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { ProductBehaviorSnapshot } from './contracts';
import { verifyMainEnvelope } from './mainEnvelope';

const ing = (id: string) => {
  const found = findDemoIngredient(id);
  if (!found) throw new Error(`missing fixture ${id}`);
  return found;
};

/** Exactly what staging's resolver returns for protein_gelato / −12 / optimal. */
const proteinFruit = (lineId: string, ceiling: number): ProductBehaviorSnapshot =>
  ({
    schemaVersion: 1,
    resolutionState: 'RESOLVED',
    lineId,
    productId: `p-${lineId}`,
    productVersionId: `v-${lineId}`,
    source: 'mapper',
    factsFingerprint: `f-${lineId}`,
    behaviorBindingId: `b-${lineId}`,
    behaviorBindingVersion: '1',
    taxonomyVersion: 'pinguino-product-taxonomy-v1',
    familyId: 'fruit',
    subfamilyId: lineId,
    formId: 'fresh',
    verificationState: 'verified',
    technicalAuthority: 'mapper_exact',
    mapperIngredientId: lineId,
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainPolicyId: 'main-protein-fruit-combination-v2',
    mainPolicyVersion: '2',
    mainBasis: 'FRUIT_EQUIVALENT',
    ecoFloorPercent: 10,
    optimalCeilingPercent: ceiling,
    hardLimitPercent: ceiling,
    multiMainHardLimitPercent: 20.7,
    mainEquivalentFactor: 1,
    requiresLiquidDairyCarrier: false,
    liquidDairyCarrierFloorPercent: null,
    approvedLiquidDairyCarrier: false,
    approvedMixedFamilyIds: [],
    moduleEligibility: {
      MAIN: 'eligible',
      BASE_RECIPE: 'eligible',
      OPTIMAL: 'eligible',
      ECO: 'eligible',
    },
    processScope: 'BASE_FORMULATION',
    resolverVersion: 'unified-product-behavior-v2',
    sharedFacts: null,
    warnings: [],
    blockReasons: [],
  }) as ProductBehaviorSnapshot;

const CARRIER = {
  ...proteinFruit('milk', 0),
  familyId: null,
  subfamilyId: null,
  formId: null,
  mainClassification: 'STANDARD_ONLY',
  mainPolicyId: null,
  mainPolicyVersion: null,
  mainBasis: null,
  ecoFloorPercent: null,
  optimalCeilingPercent: null,
  hardLimitPercent: null,
  multiMainHardLimitPercent: null,
  mainEquivalentFactor: null,
  approvedLiquidDairyCarrier: true,
  moduleEligibility: {
    MAIN: 'blocked',
    BASE_RECIPE: 'eligible',
    OPTIMAL: 'eligible',
    ECO: 'eligible',
  },
} as ProductBehaviorSnapshot;

const SNAPS = {
  strawberry: proteinFruit('strawberry', 49.5),
  banana: proteinFruit('banana', 17.1),
  milk: CARRIER,
};

/** `fillTo` lets the draft sum drift off `target_batch_grams`, as the owner's draft had. */
const recipe = (a: number, b: number, target = 1000, fillTo = target): RecipeInput =>
  ({
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: -12,
    target_batch_grams: target,
    machine_capacity_grams: null,
    goals: { formulation_strategy: 'optimal' },
    items: [
      {
        id: 'strawberry',
        ingredient: ing('raspberry'),
        planned_grams: a,
        actual_grams: null,
        lock_type: 'main',
      },
      {
        id: 'banana',
        ingredient: ing('raspberry'),
        planned_grams: b,
        actual_grams: null,
        lock_type: 'main',
      },
      {
        id: 'milk',
        ingredient: ing('milk_3_5'),
        planned_grams: fillTo - a - b,
        actual_grams: null,
        lock_type: 'unlocked',
      },
    ],
  }) as unknown as RecipeInput;

const envelope = (a: number, b: number, target = 1000, fillTo = target) =>
  verifyMainEnvelope({ recipe: recipe(a, b, target, fillTo), snapshots: SNAPS, mode: 'optimal' });

describe('§26 — the exact values the owner reported', () => {
  it('80 + 80 of a 1000 g batch is 16 %, and it is LEGAL', () => {
    const result = envelope(80, 80);
    expect(result.ok).toBe(true);
    expect(result.ok && result.equivalentPercent).toBe(16);
  });

  it('100 + 100 of a 1000 g batch is 20 %, and it is LEGAL', () => {
    const result = envelope(100, 100);
    expect(result.ok).toBe(true);
    expect(result.ok && result.equivalentPercent).toBe(20);
  });

  it('the answer does not change when the draft sum drifts off the target batch', () => {
    // The owner's draft summed to 1092 g while the target stayed 1000 g. The denominator is the
    // TARGET, so the combined share is still 16 % — the drift is a batch problem, not a Main one.
    const drifted = envelope(80, 80, 1000, 1092);
    expect(drifted.ok).toBe(true);
    expect(drifted.ok && drifted.equivalentPercent).toBe(16);
    expect(drifted).toEqual(envelope(80, 80));
  });

  it('reproduces „0.2 %" only from Mains at 1 g + 1 g — never from 80 + 80', () => {
    // This is what the served message was actually describing: a probe candidate, not the draft.
    const probe = envelope(1, 1);
    expect(probe.ok).toBe(false);
    expect(probe.ok === false && probe.violations[0]!.messagePl).toBe(
      'Grupa Main ma 0.2%; wymagane minimum to 10.0%.',
    );
  });

  it('reproduces „exceeds 20.7 %" only above 207 g combined', () => {
    expect(envelope(104, 104).ok).toBe(false); // 208 g → 20.8 %
    expect(envelope(103, 104).ok).toBe(true); // 207 g → 20.7 %, exactly at the limit
  });
});

describe('§4/§6 — unit and denominator contract', () => {
  it('equivalentPercent is a PERCENT (0…100), not a fraction', () => {
    const result = envelope(80, 80);
    expect(result.ok && result.equivalentPercent).toBeGreaterThan(1);
    expect(result.ok && result.equivalentPercent).toBeLessThanOrEqual(100);
  });

  it('the ×100 happens exactly once — 16 %, never 0.16 and never 1600', () => {
    const percent = envelope(80, 80);
    expect(percent.ok && percent.equivalentPercent).not.toBeCloseTo(0.16, 5);
    expect(percent.ok && percent.equivalentPercent).not.toBe(1600);
  });

  it('the denominator is target_batch_grams — halving the target doubles the share', () => {
    const half = envelope(80, 80, 500, 500);
    expect(half.ok === false || half.equivalentPercent === 32).toBe(true);
    // 160 / 500 = 32 %, which is above the 20.7 % combined limit, so it must be refused.
    expect(half.ok).toBe(false);
  });

  it('equivalent grams are Σ(grams × factor), and a factor of 1 makes them raw grams', () => {
    expect(
      envelope(60, 100).ok &&
        (envelope(60, 100) as { equivalentPercent: number }).equivalentPercent,
    ).toBe(16);
    expect(
      envelope(120, 40).ok &&
        (envelope(120, 40) as { equivalentPercent: number }).equivalentPercent,
    ).toBe(16);
  });
});

describe('§14 — order independence', () => {
  it('the same pair gives the same verdict whichever Main is listed first', () => {
    const forward = verifyMainEnvelope({
      recipe: recipe(120, 60),
      snapshots: SNAPS,
      mode: 'optimal',
    });
    const base = recipe(60, 120);
    const reversed = verifyMainEnvelope({
      recipe: { ...base, items: [base.items[1]!, base.items[0]!, base.items[2]!] },
      snapshots: { strawberry: SNAPS.banana, banana: SNAPS.strawberry, milk: CARRIER },
      mode: 'optimal',
    });
    expect(forward.ok).toBe(reversed.ok);
    expect(forward.ok && forward.equivalentPercent).toBe(reversed.ok && reversed.equivalentPercent);
  });
});

describe('§15 — envelope boundaries at raw precision', () => {
  // floor 10 %, combined hard limit 20.7 % — classified on the exact fraction, never rounded text.
  it.each([
    [49, 50, 9.9, false],
    [50, 50, 10.0, true],
    [50, 51, 10.1, true],
    [103, 103, 20.6, true],
    [103, 104, 20.7, true],
    [104, 104, 20.8, false],
  ])('%s + %s = %s %% → legal: %s', (a, b, expectedPercent, legal) => {
    const result = envelope(a, b);
    const percent = ((a + b) / 1000) * 100;
    expect(percent).toBeCloseTo(expectedPercent, 10);
    expect(result.ok).toBe(legal);
    if (result.ok) expect(result.equivalentPercent).toBeCloseTo(expectedPercent, 10);
  });
});

describe('§21 — a rejection must never misattribute a candidate’s numbers to the draft', () => {
  it('the copy names the proposal as the subject', async () => {
    const { constraintStudioCopy } =
      await import('@/features/constraint-studio/constraintStudioCopy');
    const rendered = constraintStudioCopy.blocked.rejectedProposalAuthority(
      'Grupa Main ma 0.2%; wymagane minimum to 10.0%.',
    );
    expect(rendered).toContain('Propozycja Gellatti została odrzucona');
    expect(rendered).toContain('w proponowanej recepturze');
    expect(rendered).toContain('Twoja receptura nie została zmieniona.');
    // The number itself is still reported — it is true about the candidate.
    expect(rendered).toContain('0.2%');
  });
});
