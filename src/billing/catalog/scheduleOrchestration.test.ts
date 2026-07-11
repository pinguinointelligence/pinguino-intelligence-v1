/**
 * 15-month benefit schedule orchestration — §12.6 invariant pins: single
 * benefit, idempotent creation, per-phase cancellation semantics, no second
 * benefit, and the exact two-phase plan for every annual offer.
 */
import { describe, expect, it } from 'vitest';
import { byOfferKey, type OfferKey } from './priceCatalog';
import {
  cancellationSemanticsFor,
  decideScheduleCreation,
  type ScheduleDecisionInput,
} from './scheduleOrchestration';

const input = (over: Partial<ScheduleDecisionInput> = {}): ScheduleDecisionInput => ({
  userId: 'user-1',
  purchasedOfferKey: 'home_yearly_standard',
  referred: true,
  benefitAlreadyUsed: false,
  existingScheduleId: null,
  ...over,
});

describe('schedule plan — referred annual purchase → 15m first phase + annual renewal', () => {
  const expectations: Array<[OfferKey, OfferKey]> = [
    ['home_yearly_standard', 'home_15m_standard_partner'],
    ['home_yearly_launch', 'home_15m_launch_partner'],
    ['pro_yearly_standard', 'pro_15m_standard_partner'],
    ['pro_yearly_founding', 'pro_15m_founding_partner'],
  ];

  it.each(expectations)('%s → first phase %s, one iteration, renews into the SAME annual offer', (annual, fifteen) => {
    const decision = decideScheduleCreation(input({ purchasedOfferKey: annual }));
    expect(decision.action).toBe('create_schedule');
    if (decision.action !== 'create_schedule') return;
    expect(decision.plan.firstPhaseOfferKey).toBe(fifteen);
    expect(decision.plan.firstPhaseIterations).toBe(1);
    expect(decision.plan.secondPhaseOfferKey).toBe(annual);
    // the plan's phases stay inside one product + variant
    const first = byOfferKey(decision.plan.firstPhaseOfferKey)!;
    const second = byOfferKey(decision.plan.secondPhaseOfferKey)!;
    expect(first.product).toBe(second.product);
    expect(first.variant).toBe(second.variant);
    expect(first.cadence).toBe('initial_15_month');
    expect(second.cadence).toBe('annual');
  });

  it('the idempotency key is deterministic per user + offer (replay-safe creation)', () => {
    const a = decideScheduleCreation(input());
    const b = decideScheduleCreation(input());
    expect(a).toEqual(b);
    if (a.action !== 'create_schedule' || b.action !== 'create_schedule') throw new Error('expected create');
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    expect(a.idempotencyKey).toContain('user-1');
    expect(a.idempotencyKey).toContain('home_yearly_standard');

    const other = decideScheduleCreation(input({ userId: 'user-2' }));
    if (other.action !== 'create_schedule') throw new Error('expected create');
    expect(other.idempotencyKey).not.toBe(a.idempotencyKey);
  });
});

describe('refusals — the benefit is single-use and annual-only', () => {
  it('an existing schedule is REUSED, never duplicated (idempotent orchestration)', () => {
    expect(decideScheduleCreation(input({ existingScheduleId: 'sched_fake_1' }))).toEqual({
      action: 'reuse_existing_schedule',
    });
    // reuse wins even over refusal conditions — the schedule already exists
    expect(
      decideScheduleCreation(
        input({ existingScheduleId: 'sched_fake_1', benefitAlreadyUsed: true }),
      ),
    ).toEqual({ action: 'reuse_existing_schedule' });
  });

  it('not referred → no benefit', () => {
    expect(decideScheduleCreation(input({ referred: false }))).toEqual({
      action: 'no_benefit',
      reason: 'not_referred',
    });
  });

  it('benefit already used → no SECOND benefit, ever', () => {
    expect(decideScheduleCreation(input({ benefitAlreadyUsed: true }))).toEqual({
      action: 'no_benefit',
      reason: 'benefit_already_used',
    });
  });

  it('monthly purchases never get the benefit', () => {
    for (const key of ['home_monthly_standard', 'pro_monthly_standard', 'pro_monthly_founding'] as const) {
      expect(decideScheduleCreation(input({ purchasedOfferKey: key }))).toEqual({
        action: 'no_benefit',
        reason: 'offer_not_annual',
      });
    }
  });

  it('a 15-month offer is not a valid purchase input (it is the OUTPUT of orchestration)', () => {
    expect(
      decideScheduleCreation(input({ purchasedOfferKey: 'home_15m_standard_partner' })),
    ).toEqual({ action: 'no_benefit', reason: 'offer_not_annual' });
  });
});

describe('cancellation semantics per phase (§12.6)', () => {
  it('phase 1 (15-month): schedule ends after the paid phase, renewal never starts, benefit stays consumed', () => {
    expect(cancellationSemanticsFor('first_15_month')).toEqual({
      phase: 'first_15_month',
      mechanism: 'end_schedule_after_current_phase',
      endsAtPhaseEnd: true,
      renewalPhaseStarts: false,
      benefitRemainsConsumed: true,
    });
  });

  it('phase 2 (annual renewal): plain cancel-at-period-end, benefit stays consumed', () => {
    expect(cancellationSemanticsFor('renewal_annual')).toEqual({
      phase: 'renewal_annual',
      mechanism: 'cancel_subscription_at_period_end',
      endsAtPhaseEnd: true,
      renewalPhaseStarts: false,
      benefitRemainsConsumed: true,
    });
  });
});
