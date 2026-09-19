/**
 * NAPRAWA 5 — true infeasible.
 *
 * The Owner's rule has one sharp edge: „A missing dosage or compatibility
 * authority is not proof of physical impossibility." These tests are mostly
 * about that edge, because it is the one a tired implementation collapses —
 * every stage returns nothing, so the product says "impossible" when what it
 * means is "we never finished looking".
 */
import { describe, expect, it } from 'vitest';
import {
  RESCUE_STAGES,
  classifyRescueOutcome,
  mayClaimGenuinelyInfeasible,
  type RescueStage,
  type RescueStageOutcome,
  type RescueStageRecord,
} from './rescueOutcomeClassification';

const chain = (
  outcomes: Partial<Record<RescueStage, RescueStageOutcome>>,
  fallback: RescueStageOutcome = 'no_improvement',
): RescueStageRecord[] =>
  RESCUE_STAGES.map((stage) => ({
    stage,
    outcome: outcomes[stage] ?? fallback,
    candidatesEvaluated: 3,
  }));

describe('the chain must actually be exhausted', () => {
  it('a fully-run chain that found nothing is the ONLY route to genuinely infeasible', () => {
    const verdict = classifyRescueOutcome(chain({}));
    expect(verdict.classification).toBe('genuinely_infeasible');
    expect(verdict.chainExhausted).toBe(true);
    expect(verdict.stagesNotAttempted).toEqual([]);
    expect(mayClaimGenuinelyInfeasible(verdict)).toBe(true);
  });

  it('one unattempted stage is enough to forbid the claim', () => {
    for (const stage of RESCUE_STAGES) {
      const verdict = classifyRescueOutcome(chain({ [stage]: 'not_attempted' }));
      expect(verdict.classification, stage).toBe('no_material_improvement');
      expect(verdict.chainExhausted, stage).toBe(false);
      expect(verdict.stagesNotAttempted, stage).toEqual([stage]);
      expect(mayClaimGenuinelyInfeasible(verdict), stage).toBe(false);
    }
  });

  it('a missing stage record counts as not attempted, never as nothing-found', () => {
    const partial = chain({}).slice(0, 3);
    const verdict = classifyRescueOutcome(partial);
    expect(verdict.chainExhausted).toBe(false);
    expect(verdict.stagesNotAttempted).toEqual([
      'starter_pack',
      'constraint_what_if',
      'bounded_pair',
    ]);
    expect(mayClaimGenuinelyInfeasible(verdict)).toBe(false);
  });

  it('an empty chain is not an impossible target', () => {
    const verdict = classifyRescueOutcome([]);
    expect(verdict.classification).toBe('no_material_improvement');
    expect(mayClaimGenuinelyInfeasible(verdict)).toBe(false);
    expect(verdict.stagesNotAttempted).toEqual([...RESCUE_STAGES]);
  });
});

describe('an administrative gap is never a physical claim', () => {
  it('a missing authority outranks every other empty outcome', () => {
    const verdict = classifyRescueOutcome(chain({ starter_pack: 'missing_authority' }));
    expect(verdict.classification).toBe('missing_authority');
    // Every other stage ran, so the chain IS exhausted — and it still must not
    // be called impossible.
    expect(verdict.chainExhausted).toBe(true);
    expect(mayClaimGenuinelyInfeasible(verdict)).toBe(false);
  });

  it('a customer-owned rule blocking the answer is not impossibility either', () => {
    const verdict = classifyRescueOutcome(
      chain({ constraint_what_if: 'customer_constraint_blocked' }),
    );
    expect(verdict.classification).toBe('customer_constraint_blocked');
    expect(mayClaimGenuinelyInfeasible(verdict)).toBe(false);
  });

  it('profile identity and structural limits get their own honest verdicts', () => {
    expect(
      classifyRescueOutcome(chain({ profile_toolbox: 'profile_identity_blocked' })).classification,
    ).toBe('profile_identity_blocked');
    expect(
      classifyRescueOutcome(chain({ current_controlled: 'structural_limit_blocked' }))
        .classification,
    ).toBe('structural_limit_blocked');
    for (const outcome of ['profile_identity_blocked', 'structural_limit_blocked'] as const) {
      expect(mayClaimGenuinelyInfeasible(classifyRescueOutcome(chain({ bounded_pair: outcome })))).toBe(
        false,
      );
    }
  });

  it('nothing is collapsed: the seven verdicts stay distinguishable', () => {
    const seen = new Set([
      classifyRescueOutcome(chain({ current_normal: 'improved' })).classification,
      classifyRescueOutcome(chain({ starter_pack: 'missing_authority' })).classification,
      classifyRescueOutcome(chain({ constraint_what_if: 'customer_constraint_blocked' }))
        .classification,
      classifyRescueOutcome(chain({ profile_toolbox: 'profile_identity_blocked' })).classification,
      classifyRescueOutcome(chain({ current_controlled: 'structural_limit_blocked' }))
        .classification,
      classifyRescueOutcome(chain({})).classification,
      classifyRescueOutcome(chain({ bounded_pair: 'not_attempted' })).classification,
    ]);
    expect(seen.size).toBe(7);
  });
});

describe('an improvement always wins the verdict', () => {
  it('reports `improved` even when other stages were blocked or never ran', () => {
    const verdict = classifyRescueOutcome(
      chain({
        current_normal: 'improved',
        starter_pack: 'missing_authority',
        bounded_pair: 'not_attempted',
      }),
    );
    expect(verdict.classification).toBe('improved');
    expect(verdict.chainExhausted).toBe(false);
    expect(mayClaimGenuinelyInfeasible(verdict)).toBe(false);
  });

  it('carries the audit numbers through', () => {
    const verdict = classifyRescueOutcome(chain({}));
    expect(verdict.candidatesEvaluated).toBe(3 * RESCUE_STAGES.length);
    expect(verdict.stages).toHaveLength(RESCUE_STAGES.length);
  });
});
