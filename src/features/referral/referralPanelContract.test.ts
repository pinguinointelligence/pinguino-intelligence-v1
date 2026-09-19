/// <reference types="node" />
/**
 * K01 — the referral panel is a VIEW over the existing programme.
 *
 * The whole risk in building this UI was that it would grow a second source of
 * truth: its own day counts, its own totals, its own rules. The backend was
 * already live and proven, so a panel that recomputed anything would drift from
 * the money the webhook actually banked.
 *
 * These are source-level contracts rather than render tests: they assert where
 * the panel gets things from, which is precisely what a render test cannot see.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REFERRAL_BONUS_DAYS } from './referralRewardRules';

const panel = readFileSync(
  new URL('./ReferralPanel.tsx', import.meta.url),
  'utf8',
);
const affiliatePage = readFileSync(
  new URL('../../pages/destinations/AffiliatePage.tsx', import.meta.url),
  'utf8',
);
const account = readFileSync(
  new URL('../../pages/account/AccountWorkspacePage.tsx', import.meta.url),
  'utf8',
);

describe('referral panel reuses the existing programme', () => {
  it('reads days from the reward rules, never from a literal', () => {
    expect(panel).toContain('REFERRAL_BONUS_DAYS');
    // 7 and 30 are the canonical values. If either is typed into the panel the
    // UI can disagree with what the webhook banks.
    for (const days of [REFERRAL_BONUS_DAYS.monthly, REFERRAL_BONUS_DAYS.annual]) {
      expect(panel).not.toMatch(new RegExp(`>\\s*${days}\\s*(dni|days)`, 'i'));
    }
  });

  it('reads totals and the bank from the service, and mints no second backend', () => {
    expect(panel).toContain('getReferralDashboard');
    expect(panel).toContain('ensureReferralCode');
    // No direct table access and no second RPC: the service is the only door.
    expect(panel).not.toContain("from('referral_rewards')");
    expect(panel).not.toContain("from('user_referral_codes')");
    expect(panel).not.toMatch(/supabase\s*\.\s*rpc\(/);
  });

  it('takes every string from the referral copy module', () => {
    expect(panel).toContain("from '@/copy/referral'");
  });

  it('is gated on auth, so a signed-out visitor never sees an endless spinner', () => {
    // /affiliate links straight here, so signed-out is a real arrival state.
    expect(panel).toContain('useAuthStore');
    expect(panel).toContain('enabled: signedIn');
    expect(panel).toContain('referral-signed-out');
  });
});

describe('the two programmes stay separate and mutually reachable', () => {
  it('the panel says it is not Affiliate, and links out to it', () => {
    expect(panel).toContain('notAffiliate');
    expect(panel).toContain('to="/affiliate"');
  });

  it('the Affiliate page links back to the referral programme', () => {
    expect(affiliatePage).toContain('referralBridge');
    expect(affiliatePage).toContain('/account?section=referral');
  });

  it('the panel names no money — that lane belongs to Affiliate', () => {
    // The copy guard already bans money words in referral copy; this keeps the
    // component from reintroducing them in markup of its own.
    const markupOnly = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(markupOnly).not.toMatch(/prowizj|wypłat|€|EUR/i);
  });
});

describe('the panel is reachable', () => {
  it('is mounted as its own account section', () => {
    expect(account).toContain("id: 'referral'");
    expect(account).toContain('<ReferralPanel />');
  });
});
