import { describe, expect, it } from 'vitest';
import { referralCopyEn, referralCopyPl, resolveReferralCopy } from './referral';
import { REFERRAL_BONUS_DAYS } from '@/features/referral/referralRewardRules';

const keyPaths = (value: unknown, prefix = ''): string[] => {
  if (Array.isArray(value)) return value.flatMap((e, i) => keyPaths(e, `${prefix}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      keyPaths(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [prefix];
};

/**
 * Only the VALUES are customer-visible. The keys are contract names — a key
 * called `partner_attribution_exists` is the refusal it maps, not a string
 * anybody reads — so scanning `JSON.stringify` of the whole object would flag
 * the contract for being named after itself.
 */
const values = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(values);
  if (value && typeof value === 'object') return Object.values(value).flatMap(values);
  return [];
};
const allText = [...values(referralCopyPl), ...values(referralCopyEn)].join('\n');
/** The one line whose whole job is to DENY the money programme. */
const DISCLAIMERS = [referralCopyPl.rules.notAffiliate, referralCopyEn.rules.notAffiliate];
const promises = allText
  .split('\n')
  .filter((line) => !DISCLAIMERS.includes(line))
  .join('\n');

describe('refer-a-friend copy', () => {
  it('keeps both locales on identical key sets', () => {
    expect(keyPaths(referralCopyEn).sort()).toEqual(keyPaths(referralCopyPl).sort());
  });

  it('resolves Polish by default', () => {
    expect(resolveReferralCopy()).toBe(referralCopyPl);
    expect(resolveReferralCopy('en')).toBe(referralCopyEn);
  });

  // K03 — the reward lane must never read as the money lane.
  it('never promises money, commission or a payout', () => {
    // The disclaimer is allowed to NAME them; nothing else may.
    expect(promises).not.toMatch(/prowizj|wypłat|commission|payout|zarobisz|earn money/i);
    expect(allText).not.toMatch(/€|EUR/);
    // …and the disclaimer says so explicitly, in both locales.
    expect(referralCopyPl.rules.notAffiliate).toMatch(/nie jest program Affiliate/i);
    expect(referralCopyPl.rules.notAffiliate).toMatch(/nie ma prowizji ani wypłat/i);
    expect(referralCopyEn.rules.notAffiliate).toMatch(/no commission and no payout/i);
  });

  it('parameterises the day counts instead of writing 7 and 30 into a sentence', () => {
    expect(referralCopyPl.rules.monthlyTemplate).toContain('{days}');
    expect(referralCopyPl.rules.annualTemplate).toContain('{days}');
    expect(referralCopyEn.rules.monthlyTemplate).toContain('{days}');
    expect(allText).not.toMatch(/\b7 dni\b/);
    expect(allText).not.toMatch(/\b30 dni\b/);
    // The canonical source is the rules module.
    expect(REFERRAL_BONUS_DAYS.monthly).toBe(7);
    expect(REFERRAL_BONUS_DAYS.annual).toBe(30);
  });

  it('gives every typed claim refusal customer wording, with no raw contract value', () => {
    const reasons = [
      'claimed', 'not_authenticated', 'code_required', 'code_not_found',
      'self_referral', 'already_claimed_same', 'already_claimed_other',
      'partner_attribution_exists',
    ] as const;
    for (const reason of reasons) {
      const message = referralCopyPl.claim[reason];
      expect(message.length).toBeGreaterThan(0);
      // The customer never sees the contract value itself.
      expect(message).not.toContain(reason);
      expect(message).not.toMatch(/_/);
    }
  });

  it('states the honest conditions: first paid subscription, refund reverses', () => {
    expect(referralCopyPl.rules.honest).toMatch(/pierwsza opłacona/i);
    expect(referralCopyPl.rules.honest).toMatch(/zwrot/i);
  });

  it('leaks no internal or backend vocabulary', () => {
    for (const pattern of [
      /referral_rewards/i, /pro_bonus/i, /entitlement/i, /supabase/i,
      /\bRPC\b/, /stripe/i, /webhook/i, /partner_/i, /\bRLS\b/,
    ]) {
      expect(allText).not.toMatch(pattern);
    }
  });
});
