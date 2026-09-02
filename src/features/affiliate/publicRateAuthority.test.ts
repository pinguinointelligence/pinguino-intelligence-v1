import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveCommission } from '@/billing/domain/commissionRules';
import { DEFAULT_GOLD_THRESHOLD } from '@/billing/domain/tierSnapshots';
import { DEFAULT_PAYOUT_THRESHOLD_CENTS } from '@/billing/domain/payoutNetting';
import {
  CUSTOM_TERMS_TIER,
  PUBLIC_AFFILIATE_TIERS,
  PUBLIC_GOLD_THRESHOLD,
  PUBLIC_HOLD_FULL_MONTHS,
  PUBLIC_MINIMUM_PAYOUT_CENTS,
  PUBLIC_STARTER_PACK_RETAIL_CENTS,
  formatEuro,
  publicRate,
  publicRateCard,
  publicStarterPackRate,
} from './publicRateAuthority';

/**
 * The public rate authority must be a READER of the ledger's rate table, never
 * a second copy of it. These tests fail if someone ever types a rate into the
 * UI layer.
 */
describe('affiliate public rate authority', () => {
  it('exposes exactly the two public tiers and never Elite', () => {
    expect(PUBLIC_AFFILIATE_TIERS).toEqual(['standard', 'gold']);
    expect(PUBLIC_AFFILIATE_TIERS).not.toContain(CUSTOM_TERMS_TIER);
  });

  it('returns the OWNER-approved Standard rates', () => {
    expect(publicRate('standard', 'home', 'monthly').amountCents).toBe(199);
    expect(publicRate('standard', 'pro', 'monthly').amountCents).toBe(499);
    expect(publicRate('standard', 'home', 'annual').amountCents).toBe(900);
    expect(publicRate('standard', 'pro', 'annual').amountCents).toBe(2900);
  });

  it('returns the OWNER-approved Gold rates', () => {
    expect(publicRate('gold', 'home', 'monthly').amountCents).toBe(249);
    expect(publicRate('gold', 'pro', 'monthly').amountCents).toBe(599);
    expect(publicRate('gold', 'home', 'annual').amountCents).toBe(1400);
    expect(publicRate('gold', 'pro', 'annual').amountCents).toBe(3900);
  });

  it('delegates to the ledger rate table rather than restating it', () => {
    for (const tier of PUBLIC_AFFILIATE_TIERS) {
      for (const product of ['home', 'pro'] as const) {
        for (const cadence of ['monthly', 'annual'] as const) {
          expect(publicRate(tier, product, cadence).amountCents).toBe(
            resolveCommission('v1', product, cadence, tier).amountCents,
          );
        }
      }
    }
  });

  it('reads the Gold threshold and payout minimum from their own authorities', () => {
    expect(PUBLIC_GOLD_THRESHOLD).toBe(DEFAULT_GOLD_THRESHOLD);
    expect(PUBLIC_GOLD_THRESHOLD).toBe(100);
    expect(PUBLIC_MINIMUM_PAYOUT_CENTS).toBe(DEFAULT_PAYOUT_THRESHOLD_CENTS);
    expect(PUBLIC_MINIMUM_PAYOUT_CENTS).toBe(2500);
  });

  it('derives the hold as TWO full calendar months', () => {
    expect(PUBLIC_HOLD_FULL_MONTHS).toBe(2);
  });

  it('gives four cells per public rate card', () => {
    const card = publicRateCard('standard');
    expect(card).toHaveLength(4);
    expect(card.map((cell) => `${cell.product}-${cell.cadence}`)).toEqual([
      'home-monthly',
      'pro-monthly',
      'home-annual',
      'pro-annual',
    ]);
  });

  it('never lets an Elite amount be produced by this module', () => {
    // `publicRate` is typed to PublicAffiliateTier; this asserts the runtime
    // agrees, so a cast at a call site still cannot mint an Elite figure.
    const eliteAmounts = [299, 1900, 699, 4900];
    const produced = PUBLIC_AFFILIATE_TIERS.flatMap((tier) =>
      publicRateCard(tier).map((cell) => cell.amountCents),
    );
    for (const elite of eliteAmounts) {
      expect(produced).not.toContain(elite);
    }
  });

  it('contains no rate literal in its own source — it imports every number', () => {
    const source = readFileSync(new URL('./publicRateAuthority.ts', import.meta.url), 'utf8');
    // Strip comments: the file documents the threshold in prose, and prose is
    // not a second source of truth.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    // The Starter Pack block is the ONE exemption, and it is narrow on purpose:
    // that commission has no upstream to import — `commission_rules` carries
    // only home and pro — so the owner froze it here (2026-09-02) and this file
    // IS its source. Everything else must still come from resolveCommission.
    const subscriptionRates = code.slice(0, code.indexOf('STARTER_PACK_COMMISSION_CENTS'))
      + code.slice(code.indexOf('export function publicStarterPackRate'));
    for (const literal of [199, 249, 299, 499, 599, 699, 1400, 2900, 3900, 4900, 2500]) {
      expect(subscriptionRates).not.toMatch(new RegExp(`\\b${literal}\\b`));
    }
    // And the exemption stays exactly one block wide.
    expect(code.match(/5_900|900|1_900/g)?.length).toBeLessThanOrEqual(4);
  });

  it('formats euro for Polish display without inventing decimals', () => {
    expect(formatEuro(199)).toMatch(/1,99/);
    expect(formatEuro(900)).toMatch(/^9\s?€$|9\s€/);
    expect(formatEuro(0)).toMatch(/0/);
  });
});

describe('Starter Pack — owner-frozen 2026-09-02', () => {
  it('quotes 9 EUR Standard and 19 EUR Gold, from the authority', () => {
    expect(publicStarterPackRate('standard')).toBe(900);
    expect(publicStarterPackRate('gold')).toBe(1_900);
  });

  it('carries the retail price the commission is paid against', () => {
    expect(PUBLIC_STARTER_PACK_RETAIL_CENTS).toBe(5_900);
  });

  it('is quotable for every public tier, and Elite is not a public tier', () => {
    for (const tier of PUBLIC_AFFILIATE_TIERS) {
      expect(publicStarterPackRate(tier)).toBeGreaterThan(0);
    }
    // Elite stays individual: it is not in PUBLIC_AFFILIATE_TIERS at all, so
    // there is no way to ask this function for an Elite figure.
    expect([...PUBLIC_AFFILIATE_TIERS]).not.toContain(CUSTOM_TERMS_TIER);
  });
});
