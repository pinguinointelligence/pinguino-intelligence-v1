/**
 * REFER A FRIEND — the reward rules, as a pure module.
 *
 * This is the SPECIFICATION and test oracle for the SQL in
 * `20260902100100_refer_a_friend_functions.sql`; the database is the runtime.
 * `referralRewardRules.migration.test.ts` asserts the two agree, so the number
 * a page promises can never drift from the number a function grants.
 *
 * THIS IS NOT THE COMMISSION SYSTEM. It shares no table, no rate and no ledger
 * with the Affiliate lane. The reward is PRO DAYS; money never appears here,
 * and `src/billing/domain/*` is deliberately not imported.
 *
 * Owner rules (F1..F9 — the same citations the migration uses):
 *   F1  monthly referred first purchase → +7 PRO bonus days
 *   F2  annual  referred first purchase → +30 PRO bonus days
 *   F3  first paid purchase only
 *   F4  Stripe billing is never modified
 *   F5  a paid-PRO referrer banks the days
 *   F6  a referrer without paid PRO activates them immediately
 *   F7  failed / refunded purchases earn nothing
 *   F8  self-referral is impossible
 *   F9  a late reversal never claws back granted access
 */

/** The billing cadence of the REFERRED person's first paid purchase. */
export type ReferralCadence = 'monthly' | 'annual';

/** The product they bought. Both HOME and PRO purchases earn the same days. */
export type ReferralProduct = 'home' | 'pro';

/**
 * F1/F2 — the canonical bonus-day table. `gellatti_referral_bonus_days_v1`
 * returns exactly these values.
 */
export const REFERRAL_BONUS_DAYS: Readonly<Record<ReferralCadence, number>> = Object.freeze({
  monthly: 7,
  annual: 30,
});

/** Every reward amount the system may ever create. Mirrors the DB CHECK. */
export const ALLOWED_BONUS_DAYS: readonly number[] = Object.freeze([7, 30]);

export function referralBonusDays(cadence: ReferralCadence): number {
  const days = REFERRAL_BONUS_DAYS[cadence];
  if (typeof days !== 'number') {
    throw new RangeError(`unknown referral cadence '${String(cadence)}'`);
  }
  return days;
}

/** Typed refusals, mirroring the reasons the SQL returns. */
export type ReferralRefusalReason =
  | 'incomplete_input'
  | 'unknown_cadence'
  | 'unknown_product'
  | 'duplicate_invoice'
  | 'no_referral_attribution'
  | 'partner_attribution_wins'
  | 'first_purchase_already_rewarded';

export const REFERRAL_REFUSAL_REASONS: readonly ReferralRefusalReason[] = Object.freeze([
  'incomplete_input',
  'unknown_cadence',
  'unknown_product',
  'duplicate_invoice',
  'no_referral_attribution',
  'partner_attribution_wins',
  'first_purchase_already_rewarded',
]);

/** What `gellatti_settle_pro_bonus_v1` can decide. */
export type BonusSettlementReason =
  | 'banked_while_paid_pro'
  | 'returned_to_bank'
  | 'bonus_already_active'
  | 'nothing_to_activate'
  | 'activated';

/**
 * F5/F6 — what settlement does, expressed purely so the rule can be reasoned
 * about and tested without a database.
 */
export interface BonusSettlementInput {
  /** Does a PAID PRO subscription grant PRO right now? */
  readonly paidProActive: boolean;
  /** Is a referral-bonus grant currently running? */
  readonly bonusGrantActive: boolean;
  /** Days in the bank: earned − consumed + returned. May be negative (F9). */
  readonly balanceDays: number;
}

export function decideBonusSettlement(input: BonusSettlementInput): BonusSettlementReason {
  if (input.paidProActive) {
    // F5: paid PRO wins. A running bonus is cut short and its unused days go
    // back to the bank rather than burning underneath a paid subscription.
    return input.bonusGrantActive ? 'returned_to_bank' : 'banked_while_paid_pro';
  }
  if (input.bonusGrantActive) return 'bonus_already_active';
  // F9: a negative balance means a reversal outran the days already spent.
  // Nothing activates until future rewards absorb it.
  if (input.balanceDays <= 0) return 'nothing_to_activate';
  return 'activated';
}

/**
 * The days handed back when a running bonus is cut short. Whole elapsed days
 * are charged and the remainder returned, so a part-used day costs nothing —
 * erring in favour of the person who earned the reward.
 */
export function refundableDays(grantedDays: number, elapsedDays: number): number {
  if (!Number.isInteger(grantedDays) || grantedDays <= 0) {
    throw new RangeError(`grantedDays must be a positive integer, got ${String(grantedDays)}`);
  }
  const used = Math.max(0, Math.floor(elapsedDays));
  return Math.max(0, grantedDays - Math.min(used, grantedDays));
}

/**
 * The bank balance. Derived from the ledger every time — there is no stored
 * counter, in SQL or here.
 */
export function proBonusBalance(input: {
  readonly earnedDays: number;
  readonly consumedDays: number;
  readonly returnedDays: number;
}): number {
  return input.earnedDays - input.consumedDays + input.returnedDays;
}
