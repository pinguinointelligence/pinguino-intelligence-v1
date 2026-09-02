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
  formatEuro,
  publicRate,
  publicRateCard,
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
    for (const literal of [199, 249, 299, 499, 599, 699, 900, 1400, 1900, 2900, 3900, 4900, 2500]) {
      expect(code).not.toMatch(new RegExp(`\\b${literal}\\b`));
    }
  });

  it('formats euro for Polish display without inventing decimals', () => {
    expect(formatEuro(199)).toMatch(/1,99/);
    expect(formatEuro(900)).toMatch(/^9\s?€$|9\s€/);
    expect(formatEuro(0)).toMatch(/0/);
  });
});
