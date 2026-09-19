/**
 * NAPRAWA 5 — the canonical diagnostic record.
 *
 * The Owner's requirement is that tests and audit can inspect the evidence, and
 * that "no recommendation" is always explainable. These tests pin the two
 * structural rules that make that true: every candidate carries its source and
 * its rejection reason, and a recommendation exists only when a candidate
 * survived every gate.
 */
import { describe, expect, it } from 'vitest';
import {
  buildRescueDiagnosticRecord,
  recommendedCandidate,
  type RescueCandidateDiagnostic,
  type RescueDiagnosticRecord,
} from './rescueDiagnostics';
import { RESCUE_STAGES, classifyRescueOutcome } from './rescueOutcomeClassification';

const candidate = (
  overrides: Partial<RescueCandidateDiagnostic> = {},
): RescueCandidateDiagnostic => ({
  canonicalIngredientId: 'PI-ING-000496',
  namePl: 'Fruktoza',
  source: 'starter_pack',
  dosageBandMinGrams: 0,
  dosageBandMaxGrams: 60,
  dosageProvenance: 'owner final Fructose dosage authority 2026-09-19',
  dosesTested: [4, 7, 13],
  smallestWinningGrams: 4,
  scoreBefore: 9,
  scoreAfter: 10,
  distanceBefore: 0.4,
  distanceAfter: 0,
  targetReached: true,
  relaxationUsed: false,
  profileIdentityPreserved: true,
  proteinVerdict: 'not_applicable',
  hardGates: 'PASS',
  rejectionReason: null,
  ...overrides,
});

const record = (
  candidates: RescueCandidateDiagnostic[],
  stageOutcome: 'improved' | 'no_improvement' = 'improved',
): RescueDiagnosticRecord =>
  buildRescueDiagnosticRecord({
    profile: 'milk_gelato',
    baseRoute: 'dairy',
    directionAxes: [{ axis: 'sweetness', level: 1 }],
    currentScore: 9,
    currentDistance: 0.4,
    currentEnvelope: 'normal',
    candidates,
    candidatesEvaluated: candidates.length,
    pairRescueAttempted: false,
    stages: RESCUE_STAGES.map((stage) => ({
      stage,
      outcome: stageOutcome,
      candidatesEvaluated: 1,
    })),
    classification: classifyRescueOutcome(
      RESCUE_STAGES.map((stage) => ({ stage, outcome: stageOutcome, candidatesEvaluated: 1 })),
    ),
    screenEvaluations: 120,
    previewEvaluations: 2,
  });

describe('the record refuses to lose evidence', () => {
  it('keeps every field the Owner listed, including the smallest winning dose', () => {
    const built = record([candidate()]);
    const only = built.candidates[0]!;
    expect(only.source).toBe('starter_pack');
    expect(only.dosesTested).toEqual([4, 7, 13]);
    expect(only.smallestWinningGrams).toBe(4);
    expect(only.dosageProvenance).toContain('owner final Fructose dosage authority');
    expect(built.screenEvaluations).toBe(120);
    expect(built.previewEvaluations).toBe(2);
    expect(built.baseRoute).toBe('dairy');
    expect(built.directionAxes).toEqual([{ axis: 'sweetness', level: 1 }]);
  });

  it('copies its arrays so a caller cannot mutate the evidence afterwards', () => {
    const candidates = [candidate()];
    const built = record(candidates);
    candidates.push(candidate({ canonicalIngredientId: 'PI-ING-000456' }));
    expect(built.candidates).toHaveLength(1);
  });

  it('carries the exhaustion chain with the classification, never apart from it', () => {
    const built = record([candidate()], 'no_improvement');
    expect(built.classification.chainExhausted).toBe(true);
    expect(built.classification.stages).toHaveLength(RESCUE_STAGES.length);
  });
});

describe('"no recommendation" is always explainable', () => {
  it('recommends a candidate that survived every gate', () => {
    expect(recommendedCandidate(record([candidate()]))?.canonicalIngredientId).toBe(
      'PI-ING-000496',
    );
  });

  it('recommends nothing when the only candidate was rejected, and says why', () => {
    const rejected = candidate({ rejectionReason: 'no_material_improvement' });
    const built = record([rejected]);
    expect(recommendedCandidate(built)).toBeNull();
    expect(built.candidates[0]!.rejectionReason).toBe('no_material_improvement');
  });

  it('never recommends a candidate that failed a hard gate or changed the product', () => {
    expect(recommendedCandidate(record([candidate({ hardGates: 'FAIL' })]))).toBeNull();
    expect(
      recommendedCandidate(record([candidate({ profileIdentityPreserved: false })])),
    ).toBeNull();
  });

  it('prefers the first surviving candidate — ranking is the caller job, not the record', () => {
    const built = record([
      candidate({ canonicalIngredientId: 'PI-ING-000494', rejectionReason: 'profile_incompatible' }),
      candidate({ canonicalIngredientId: 'PI-ING-000456' }),
    ]);
    expect(recommendedCandidate(built)?.canonicalIngredientId).toBe('PI-ING-000456');
  });
});
