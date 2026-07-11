/**
 * Module 3 — tierSnapshots: partner tier calculation + monthly snapshots.
 *
 * LOCKED RULES implemented here (cited as T1..T6 in code):
 *  T1  Standard is the default tier.
 *  T2  Gold when eligible active referred subscriptions ≥ 100 at the monthly
 *      snapshot (threshold is a configurable constant, default 100).
 *  T3  Eligible referred subscription = attributed to the partner, belongs to
 *      a REAL OTHER customer (not the partner), currently grants a PAID
 *      entitlement with a valid paid status, not ended/unpaid/fraud-reversed.
 *      cancel-at-period-end still counts until paid access actually ends.
 *      Home + Pro are counted COMBINED. Excluded: historical cancelled,
 *      invite trials, the partner's own free access, duplicates, past-due
 *      beyond grace (grace = the already-paid access window: a past_due
 *      subscription counts only while its paid period has not ended — same
 *      semantics the app's access layer uses for paid access).
 *  T4  Elite = explicit override record (start/end/actor/reason) that takes
 *      precedence over the automatic tier while active at the snapshot instant.
 *  T5  Snapshot is pure + idempotent: same inputs → identical immutable
 *      snapshot {automaticTier, effectiveTier, count, calculationVersion}.
 *  T6  Commission entries earned in a month use THAT month's snapshot —
 *      snapshots are never recomputed retroactively (selectSnapshotForMonth
 *      refuses to fall back to another month).
 */

import { madridMonthStartUtcMs } from './holdCalendar';
import { assertUtcMs, frozen, type MonthKey, type Product, type Tier, type UtcMs } from './types';

/** T2: Gold threshold — configurable constant, default 100 eligible actives. */
export const DEFAULT_GOLD_THRESHOLD = 100 as const;

export const TIER_CALCULATION_VERSION = 'tier-calc-v1' as const;

/** Subscription statuses accepted as "valid paid status" evidence (T3). */
export type PaidStatusEvidence =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

/** What actually grants the customer access right now (resolver output, as evidence). */
export type EntitlementEvidence = 'paid' | 'invite_trial' | 'partner_free' | 'none';

/** Evidence row for one referred subscription (pure input — no DB access here). */
export interface ReferredSubscriptionEvidence {
  readonly subscriptionId: string;
  /** Partner the subscription is attributed to (attribution.ts is the authority). */
  readonly attributedPartnerId: string;
  /** The paying customer's user id. */
  readonly customerUserId: string;
  readonly product: Product;
  /** T3: what grants access — invite trials / partner free access never count. */
  readonly entitlement: EntitlementEvidence;
  readonly status: PaidStatusEvidence;
  /** T3: cancel-at-period-end still counts until paid access actually ends. */
  readonly cancelAtPeriodEnd: boolean;
  /**
   * UTC instant when the currently-paid access window ends (current period
   * end). null = unknown/none.
   */
  readonly paidAccessEndsAtUtcMs: UtcMs | null;
  /** True when the subscription's commissions were fraud-reversed. */
  readonly fraudReversed: boolean;
}

/**
 * T3: is this subscription an eligible active referral for `partnerId`
 * at instant `atUtcMs`?
 */
export function isEligibleReferredSubscription(
  subscription: ReferredSubscriptionEvidence,
  partnerId: string,
  partnerUserId: string,
  atUtcMs: UtcMs,
): boolean {
  assertUtcMs(atUtcMs, 'isEligibleReferredSubscription.atUtcMs');
  if (subscription.attributedPartnerId !== partnerId) return false;
  // T3: real other customer — the partner referring themself never counts.
  if (subscription.customerUserId === partnerUserId) return false;
  // T3: must currently grant PAID entitlement — invite trials and the
  // partner's own free access are excluded by construction.
  if (subscription.entitlement !== 'paid') return false;
  if (subscription.fraudReversed) return false;
  switch (subscription.status) {
    case 'active':
    case 'trialing':
      // T3: cancel-at-period-end still counts until paid access actually
      // ends (a renewing active/trialing sub simply counts).
      if (subscription.cancelAtPeriodEnd) {
        return subscription.paidAccessEndsAtUtcMs !== null && atUtcMs < subscription.paidAccessEndsAtUtcMs;
      }
      return true;
    case 'past_due':
      // T3: past-due within grace = still inside the already-paid window.
      return subscription.paidAccessEndsAtUtcMs !== null && atUtcMs < subscription.paidAccessEndsAtUtcMs;
    case 'canceled':
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      // T3: historical cancelled / unpaid / never-completed never count.
      return false;
  }
}

/**
 * T3: count eligible active referred subscriptions (Home + Pro combined) at
 * an instant, de-duplicated by subscriptionId.
 */
export function countEligibleReferredSubscriptions(
  subscriptions: readonly ReferredSubscriptionEvidence[],
  partnerId: string,
  partnerUserId: string,
  atUtcMs: UtcMs,
): number {
  const counted = new Set<string>();
  for (const subscription of subscriptions) {
    if (counted.has(subscription.subscriptionId)) continue; // T3: duplicates excluded
    if (isEligibleReferredSubscription(subscription, partnerId, partnerUserId, atUtcMs)) {
      counted.add(subscription.subscriptionId);
    }
  }
  return counted.size;
}

/** T4: explicit Elite override record. */
export interface EliteOverride {
  readonly partnerId: string;
  readonly startsAtUtcMs: UtcMs;
  /** null/undefined = open-ended. */
  readonly endsAtUtcMs?: UtcMs | null;
  readonly actor: string;
  readonly reason: string;
}

/** T4: override is active at an instant when startsAt ≤ t < endsAt (end exclusive). */
export function isEliteOverrideActive(override: EliteOverride, atUtcMs: UtcMs): boolean {
  assertUtcMs(override.startsAtUtcMs, 'eliteOverride.startsAtUtcMs');
  assertUtcMs(atUtcMs, 'isEliteOverrideActive.atUtcMs');
  if (atUtcMs < override.startsAtUtcMs) return false;
  if (override.endsAtUtcMs === null || override.endsAtUtcMs === undefined) return true;
  assertUtcMs(override.endsAtUtcMs, 'eliteOverride.endsAtUtcMs');
  return atUtcMs < override.endsAtUtcMs;
}

/** T5: immutable monthly tier snapshot. */
export interface TierSnapshot {
  readonly partnerId: string;
  readonly month: MonthKey;
  /** T1/T2: tier from the count alone (standard | gold). */
  readonly automaticTier: Extract<Tier, 'standard' | 'gold'>;
  /** T4: automatic tier unless an Elite override is active. */
  readonly effectiveTier: Tier;
  readonly count: number;
  readonly calculationVersion: typeof TIER_CALCULATION_VERSION;
}

/**
 * T5: compute the tier snapshot for (partnerId, month) from an eligible count
 * (already evaluated at the snapshot instant) and an optional Elite override.
 *
 * The snapshot instant is Madrid midnight on the 1st of `month` (the monthly
 * snapshot boundary — locked architecture decision #4). Pure and idempotent:
 * identical inputs always produce an identical frozen snapshot.
 */
export function computeTierSnapshot(
  partnerId: string,
  month: MonthKey,
  eligibleCount: number,
  eliteOverride?: EliteOverride | null,
  goldThreshold: number = DEFAULT_GOLD_THRESHOLD,
): TierSnapshot {
  if (!Number.isInteger(eligibleCount) || eligibleCount < 0) {
    throw new RangeError(`eligibleCount must be a non-negative integer, got ${String(eligibleCount)}`);
  }
  if (!Number.isInteger(goldThreshold) || goldThreshold <= 0) {
    throw new RangeError(`goldThreshold must be a positive integer, got ${String(goldThreshold)}`);
  }
  const snapshotAtUtcMs = madridMonthStartUtcMs(month);
  // T1 default standard; T2 gold at ≥ threshold (default 100).
  const automaticTier: 'standard' | 'gold' = eligibleCount >= goldThreshold ? 'gold' : 'standard';
  // T4: Elite override takes precedence while active at the snapshot instant.
  const eliteActive =
    eliteOverride != null &&
    eliteOverride.partnerId === partnerId &&
    isEliteOverrideActive(eliteOverride, snapshotAtUtcMs);
  return frozen({
    partnerId,
    month,
    automaticTier,
    effectiveTier: eliteActive ? ('elite' as const) : automaticTier,
    count: eligibleCount,
    calculationVersion: TIER_CALCULATION_VERSION,
  });
}

/**
 * T6: commission entries earned in a month must use THAT month's snapshot.
 * Returns the snapshot for exactly `month` or null — callers must treat null
 * as "snapshot missing" and never substitute another month's tier.
 */
export function selectSnapshotForMonth(
  snapshots: readonly TierSnapshot[],
  partnerId: string,
  month: MonthKey,
): TierSnapshot | null {
  return snapshots.find((s) => s.partnerId === partnerId && s.month === month) ?? null;
}
