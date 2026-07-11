/**
 * Module 3 tests — tierSnapshots.
 * Pins T1 (standard default), T2 (Gold at ≥100 with 99/100/101 boundaries),
 * T3 (eligibility criteria incl. cancel-at-period-end and past-due grace),
 * T4 (Elite override precedence + activity window), T5 (pure/idempotent
 * immutable snapshot), T6 (no retroactive month substitution).
 */

import { describe, expect, it } from 'vitest';
import { madridMonthStartUtcMs } from './holdCalendar';
import {
  DEFAULT_GOLD_THRESHOLD,
  TIER_CALCULATION_VERSION,
  computeTierSnapshot,
  countEligibleReferredSubscriptions,
  isEligibleReferredSubscription,
  isEliteOverrideActive,
  selectSnapshotForMonth,
  type EliteOverride,
  type ReferredSubscriptionEvidence,
} from './tierSnapshots';

const PARTNER = 'partner_1';
const PARTNER_USER = 'user_partner_1';
const AT = Date.UTC(2026, 3, 1, 10, 0, 0);

function sub(overrides: Partial<ReferredSubscriptionEvidence> = {}): ReferredSubscriptionEvidence {
  return {
    subscriptionId: 'sub_1',
    attributedPartnerId: PARTNER,
    customerUserId: 'user_customer_1',
    product: 'home',
    entitlement: 'paid',
    status: 'active',
    cancelAtPeriodEnd: false,
    paidAccessEndsAtUtcMs: Date.UTC(2026, 4, 1),
    fraudReversed: false,
    ...overrides,
  };
}

describe('T3: isEligibleReferredSubscription', () => {
  it('active paid referral counts', () => {
    expect(isEligibleReferredSubscription(sub(), PARTNER, PARTNER_USER, AT)).toBe(true);
  });

  it('trialing Stripe status with PAID entitlement counts', () => {
    expect(isEligibleReferredSubscription(sub({ status: 'trialing' }), PARTNER, PARTNER_USER, AT)).toBe(true);
  });

  it('attributed to another partner does NOT count', () => {
    expect(
      isEligibleReferredSubscription(sub({ attributedPartnerId: 'partner_2' }), PARTNER, PARTNER_USER, AT),
    ).toBe(false);
  });

  it('the partner referring themself does NOT count (real other customer)', () => {
    expect(
      isEligibleReferredSubscription(sub({ customerUserId: PARTNER_USER }), PARTNER, PARTNER_USER, AT),
    ).toBe(false);
  });

  it.each(['invite_trial', 'partner_free', 'none'] as const)(
    'entitlement %s does NOT count (must currently grant PAID entitlement)',
    (entitlement) => {
      expect(isEligibleReferredSubscription(sub({ entitlement }), PARTNER, PARTNER_USER, AT)).toBe(false);
    },
  );

  it('fraud-reversed does NOT count', () => {
    expect(isEligibleReferredSubscription(sub({ fraudReversed: true }), PARTNER, PARTNER_USER, AT)).toBe(false);
  });

  it.each(['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'] as const)(
    'status %s does NOT count (historical cancelled / never valid)',
    (status) => {
      expect(isEligibleReferredSubscription(sub({ status }), PARTNER, PARTNER_USER, AT)).toBe(false);
    },
  );

  it('cancel-at-period-end still counts while paid access has not ended', () => {
    expect(
      isEligibleReferredSubscription(
        sub({ cancelAtPeriodEnd: true, paidAccessEndsAtUtcMs: AT + 1 }),
        PARTNER,
        PARTNER_USER,
        AT,
      ),
    ).toBe(true);
  });

  it('cancel-at-period-end stops counting once paid access ended', () => {
    expect(
      isEligibleReferredSubscription(
        sub({ cancelAtPeriodEnd: true, paidAccessEndsAtUtcMs: AT }),
        PARTNER,
        PARTNER_USER,
        AT,
      ),
    ).toBe(false);
  });

  it('past_due counts within grace (inside the already-paid window)', () => {
    expect(
      isEligibleReferredSubscription(
        sub({ status: 'past_due', paidAccessEndsAtUtcMs: AT + 1000 }),
        PARTNER,
        PARTNER_USER,
        AT,
      ),
    ).toBe(true);
  });

  it('past_due beyond grace does NOT count', () => {
    expect(
      isEligibleReferredSubscription(
        sub({ status: 'past_due', paidAccessEndsAtUtcMs: AT - 1 }),
        PARTNER,
        PARTNER_USER,
        AT,
      ),
    ).toBe(false);
    expect(
      isEligibleReferredSubscription(
        sub({ status: 'past_due', paidAccessEndsAtUtcMs: null }),
        PARTNER,
        PARTNER_USER,
        AT,
      ),
    ).toBe(false);
  });
});

describe('T3: countEligibleReferredSubscriptions', () => {
  it('counts Home + Pro COMBINED', () => {
    const count = countEligibleReferredSubscriptions(
      [sub({ subscriptionId: 'a', product: 'home' }), sub({ subscriptionId: 'b', product: 'pro' })],
      PARTNER,
      PARTNER_USER,
      AT,
    );
    expect(count).toBe(2);
  });

  it('excludes duplicates by subscriptionId', () => {
    const count = countEligibleReferredSubscriptions(
      [sub({ subscriptionId: 'a' }), sub({ subscriptionId: 'a' }), sub({ subscriptionId: 'b' })],
      PARTNER,
      PARTNER_USER,
      AT,
    );
    expect(count).toBe(2);
  });

  it('mixed list counts only eligible rows', () => {
    const count = countEligibleReferredSubscriptions(
      [
        sub({ subscriptionId: 'ok' }),
        sub({ subscriptionId: 'self', customerUserId: PARTNER_USER }),
        sub({ subscriptionId: 'trial', entitlement: 'invite_trial' }),
        sub({ subscriptionId: 'cancelled', status: 'canceled' }),
        sub({ subscriptionId: 'other', attributedPartnerId: 'partner_2' }),
      ],
      PARTNER,
      PARTNER_USER,
      AT,
    );
    expect(count).toBe(1);
  });
});

describe('T1/T2: computeTierSnapshot boundaries', () => {
  it('T2 default threshold is 100', () => {
    expect(DEFAULT_GOLD_THRESHOLD).toBe(100);
  });

  it('99 eligible → standard (T1 default below threshold)', () => {
    expect(computeTierSnapshot(PARTNER, '2026-04', 99)).toMatchObject({
      automaticTier: 'standard',
      effectiveTier: 'standard',
      count: 99,
    });
  });

  it('100 eligible → gold (boundary inclusive)', () => {
    expect(computeTierSnapshot(PARTNER, '2026-04', 100)).toMatchObject({
      automaticTier: 'gold',
      effectiveTier: 'gold',
      count: 100,
    });
  });

  it('101 eligible → gold', () => {
    expect(computeTierSnapshot(PARTNER, '2026-04', 101)).toMatchObject({ automaticTier: 'gold' });
  });

  it('0 eligible → standard', () => {
    expect(computeTierSnapshot(PARTNER, '2026-04', 0)).toMatchObject({ automaticTier: 'standard' });
  });

  it('threshold is configurable', () => {
    expect(computeTierSnapshot(PARTNER, '2026-04', 50, null, 50)).toMatchObject({ automaticTier: 'gold' });
    expect(computeTierSnapshot(PARTNER, '2026-04', 49, null, 50)).toMatchObject({ automaticTier: 'standard' });
  });

  it('rejects invalid counts and thresholds', () => {
    expect(() => computeTierSnapshot(PARTNER, '2026-04', -1)).toThrow(RangeError);
    expect(() => computeTierSnapshot(PARTNER, '2026-04', 1.5)).toThrow(RangeError);
    expect(() => computeTierSnapshot(PARTNER, '2026-04', 10, null, 0)).toThrow(RangeError);
  });
});

describe('T4: Elite override', () => {
  const SNAPSHOT_INSTANT = madridMonthStartUtcMs('2026-04'); // 2026-03-31T22:00:00Z

  function override(overrides: Partial<EliteOverride> = {}): EliteOverride {
    return {
      partnerId: PARTNER,
      startsAtUtcMs: Date.UTC(2026, 0, 1),
      endsAtUtcMs: null,
      actor: 'admin_1',
      reason: 'strategic partner',
      ...overrides,
    };
  }

  it('active override takes precedence: effective elite, automatic still computed', () => {
    const snapshot = computeTierSnapshot(PARTNER, '2026-04', 99, override());
    expect(snapshot.automaticTier).toBe('standard');
    expect(snapshot.effectiveTier).toBe('elite');
  });

  it('active override on a gold-count month still reports the automatic gold tier', () => {
    const snapshot = computeTierSnapshot(PARTNER, '2026-04', 150, override());
    expect(snapshot.automaticTier).toBe('gold');
    expect(snapshot.effectiveTier).toBe('elite');
  });

  it('override for a DIFFERENT partner is ignored', () => {
    const snapshot = computeTierSnapshot(PARTNER, '2026-04', 99, override({ partnerId: 'partner_2' }));
    expect(snapshot.effectiveTier).toBe('standard');
  });

  it('override not yet started at the snapshot instant is ignored', () => {
    const snapshot = computeTierSnapshot(
      PARTNER,
      '2026-04',
      99,
      override({ startsAtUtcMs: SNAPSHOT_INSTANT + 1 }),
    );
    expect(snapshot.effectiveTier).toBe('standard');
  });

  it('override starting exactly at the snapshot instant IS active (start inclusive)', () => {
    const snapshot = computeTierSnapshot(
      PARTNER,
      '2026-04',
      99,
      override({ startsAtUtcMs: SNAPSHOT_INSTANT }),
    );
    expect(snapshot.effectiveTier).toBe('elite');
  });

  it('override ending exactly at the snapshot instant is INACTIVE (end exclusive)', () => {
    const snapshot = computeTierSnapshot(
      PARTNER,
      '2026-04',
      99,
      override({ endsAtUtcMs: SNAPSHOT_INSTANT }),
    );
    expect(snapshot.effectiveTier).toBe('standard');
  });

  it('the snapshot instant is MADRID midnight, not UTC midnight', () => {
    // Ends between Madrid midnight (2026-03-31T22:00Z) and UTC midnight:
    // still active at the Madrid snapshot instant.
    const snapshot = computeTierSnapshot(
      PARTNER,
      '2026-04',
      99,
      override({ endsAtUtcMs: Date.UTC(2026, 2, 31, 23, 0, 0) }),
    );
    expect(snapshot.effectiveTier).toBe('elite');
  });

  it('isEliteOverrideActive window semantics', () => {
    const record = override({ startsAtUtcMs: 1000, endsAtUtcMs: 2000 });
    expect(isEliteOverrideActive(record, 999)).toBe(false);
    expect(isEliteOverrideActive(record, 1000)).toBe(true);
    expect(isEliteOverrideActive(record, 1999)).toBe(true);
    expect(isEliteOverrideActive(record, 2000)).toBe(false);
    expect(isEliteOverrideActive(override({ startsAtUtcMs: 1000, endsAtUtcMs: undefined }), 5000)).toBe(true);
  });
});

describe('T5/T6: snapshot purity and month binding', () => {
  it('T5: idempotent — identical inputs produce deep-equal frozen snapshots', () => {
    const a = computeTierSnapshot(PARTNER, '2026-04', 100);
    const b = computeTierSnapshot(PARTNER, '2026-04', 100);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it('T5: snapshot shape carries the calculation version', () => {
    const snapshot = computeTierSnapshot(PARTNER, '2026-04', 5);
    expect(snapshot).toEqual({
      partnerId: PARTNER,
      month: '2026-04',
      automaticTier: 'standard',
      effectiveTier: 'standard',
      count: 5,
      calculationVersion: TIER_CALCULATION_VERSION,
    });
  });

  it('T6: selectSnapshotForMonth returns exactly the requested month', () => {
    const march = computeTierSnapshot(PARTNER, '2026-03', 100);
    const april = computeTierSnapshot(PARTNER, '2026-04', 99);
    expect(selectSnapshotForMonth([march, april], PARTNER, '2026-03')).toBe(march);
    expect(selectSnapshotForMonth([march, april], PARTNER, '2026-04')).toBe(april);
  });

  it('T6: missing month → null, NEVER a neighboring month (no retroactive tiers)', () => {
    const march = computeTierSnapshot(PARTNER, '2026-03', 100);
    expect(selectSnapshotForMonth([march], PARTNER, '2026-04')).toBeNull();
    expect(selectSnapshotForMonth([march], 'partner_2', '2026-03')).toBeNull();
    expect(selectSnapshotForMonth([], PARTNER, '2026-03')).toBeNull();
  });
});
