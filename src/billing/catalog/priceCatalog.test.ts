/**
 * Price catalog regression pins (§22.2) — every locked number, lookup key,
 * renewal mapping, commission cadence and listing policy from the Nicolas
 * handoff table is pinned HERE. A failing test in this file means the locked
 * business contract changed — never "fix the test", fix the change.
 */
import { describe, expect, it } from 'vitest';
import {
  byLookupKey,
  byOfferKey,
  eligibleOffersFor,
  initialFifteenMonthOfferForAnnual,
  offerForPriceId,
  PRICE_CATALOG,
  PRICE_ENV_VAR_NAMES,
  productForPriceId,
  renewalOfferFor,
  type ConfiguredPriceIds,
  type OfferKey,
} from './priceCatalog';

/** The handoff table §3, verbatim: lookup key → [cents, interval, count]. */
const LOCKED_TABLE: ReadonlyArray<
  [string, number, 'month' | 'year', 1 | 15, 'home' | 'pro']
> = [
  ['pi_home_monthly_standard_eur', 999, 'month', 1, 'home'],
  ['pi_home_yearly_standard_eur', 4900, 'year', 1, 'home'],
  ['pi_home_yearly_launch_eur', 3900, 'year', 1, 'home'],
  ['pi_home_15m_standard_partner_eur', 4900, 'month', 15, 'home'],
  ['pi_home_15m_launch_partner_eur', 3900, 'month', 15, 'home'],
  ['pi_pro_monthly_standard_eur', 2499, 'month', 1, 'pro'],
  ['pi_pro_monthly_founding_eur', 1999, 'month', 1, 'pro'],
  ['pi_pro_yearly_standard_eur', 19900, 'year', 1, 'pro'],
  ['pi_pro_yearly_founding_eur', 14900, 'year', 1, 'pro'],
  ['pi_pro_15m_standard_partner_eur', 19900, 'month', 15, 'pro'],
  ['pi_pro_15m_founding_partner_eur', 14900, 'month', 15, 'pro'],
];

describe('price catalog — the eleven locked offers', () => {
  it('has exactly 11 offers with unique offer keys, lookup keys and env var names', () => {
    expect(PRICE_CATALOG).toHaveLength(11);
    expect(new Set(PRICE_CATALOG.map((o) => o.offerKey)).size).toBe(11);
    expect(new Set(PRICE_CATALOG.map((o) => o.lookupKey)).size).toBe(11);
    expect(new Set(PRICE_CATALOG.map((o) => o.envVarName)).size).toBe(11);
    expect(PRICE_ENV_VAR_NAMES).toHaveLength(11);
  });

  it('pins every locked lookup key, amount, interval, count and product verbatim', () => {
    for (const [lookupKey, cents, interval, count, product] of LOCKED_TABLE) {
      const offer = byLookupKey(lookupKey);
      expect(offer, lookupKey).not.toBeNull();
      expect(offer!.amountCents, lookupKey).toBe(cents);
      expect(offer!.interval, lookupKey).toBe(interval);
      expect(offer!.intervalCount, lookupKey).toBe(count);
      expect(offer!.product, lookupKey).toBe(product);
      expect(offer!.currency, lookupKey).toBe('eur');
    }
  });

  it('pins the env var name for every offer (env placeholders, never price ids)', () => {
    const expected: Record<string, string> = {
      home_monthly_standard: 'STRIPE_PRICE_HOME_MONTHLY_STANDARD',
      home_yearly_standard: 'STRIPE_PRICE_HOME_YEARLY_STANDARD',
      home_yearly_launch: 'STRIPE_PRICE_HOME_YEARLY_LAUNCH',
      home_15m_standard_partner: 'STRIPE_PRICE_HOME_15M_STANDARD_PARTNER',
      home_15m_launch_partner: 'STRIPE_PRICE_HOME_15M_LAUNCH_PARTNER',
      pro_monthly_standard: 'STRIPE_PRICE_PRO_MONTHLY_STANDARD',
      pro_monthly_founding: 'STRIPE_PRICE_PRO_MONTHLY_FOUNDING',
      pro_yearly_standard: 'STRIPE_PRICE_PRO_YEARLY_STANDARD',
      pro_yearly_founding: 'STRIPE_PRICE_PRO_YEARLY_FOUNDING',
      pro_15m_standard_partner: 'STRIPE_PRICE_PRO_15M_STANDARD_PARTNER',
      pro_15m_founding_partner: 'STRIPE_PRICE_PRO_15M_FOUNDING_PARTNER',
    };
    for (const [offerKey, envVarName] of Object.entries(expected)) {
      expect(byOfferKey(offerKey)?.envVarName, offerKey).toBe(envVarName);
    }
  });

  it('never embeds a real-looking Stripe id anywhere in the catalog module', () => {
    const serialized = JSON.stringify(PRICE_CATALOG);
    expect(/price_[A-Za-z0-9]{8,}/.test(serialized)).toBe(false);
    expect(/prod_[A-Za-z0-9]{8,}/.test(serialized)).toBe(false);
  });
});

describe('renewal mapping — every 15-month offer renews into its 12-month counterpart', () => {
  it('pins the three locked pairs (standard→yearly_standard, launch→yearly_launch, founding→yearly_founding)', () => {
    const pairs: Array<[OfferKey, OfferKey]> = [
      ['home_15m_standard_partner', 'home_yearly_standard'],
      ['home_15m_launch_partner', 'home_yearly_launch'],
      ['pro_15m_standard_partner', 'pro_yearly_standard'],
      ['pro_15m_founding_partner', 'pro_yearly_founding'],
    ];
    for (const [fifteen, annual] of pairs) {
      expect(byOfferKey(fifteen)?.renewalOfferKey, fifteen).toBe(annual);
      expect(renewalOfferFor(fifteen)?.offerKey, fifteen).toBe(annual);
      expect(initialFifteenMonthOfferForAnnual(annual)?.offerKey, annual).toBe(fifteen);
    }
  });

  it('renewal never crosses product or variant', () => {
    for (const offer of PRICE_CATALOG) {
      if (!offer.renewalOfferKey) continue;
      const renewal = byOfferKey(offer.renewalOfferKey)!;
      expect(renewal.product, offer.offerKey).toBe(offer.product);
      expect(renewal.variant, offer.offerKey).toBe(offer.variant);
      expect(renewal.cadence, offer.offerKey).toBe('annual');
      expect(renewal.interval, offer.offerKey).toBe('year');
    }
  });

  it('non-15m offers have no renewal mapping; annual offers without a 15m counterpart return null', () => {
    for (const offer of PRICE_CATALOG) {
      if (offer.cadence !== 'initial_15_month') {
        expect(offer.renewalOfferKey, offer.offerKey).toBeNull();
        expect(renewalOfferFor(offer.offerKey), offer.offerKey).toBeNull();
      }
    }
    expect(initialFifteenMonthOfferForAnnual('home_monthly_standard')).toBeNull();
    expect(initialFifteenMonthOfferForAnnual('pro_monthly_standard')).toBeNull();
  });

  it('a 15-month offer costs exactly its renewal annual price (15 months for the 12-month price)', () => {
    for (const offer of PRICE_CATALOG) {
      if (!offer.renewalOfferKey) continue;
      expect(byOfferKey(offer.renewalOfferKey)!.amountCents, offer.offerKey).toBe(
        offer.amountCents,
      );
    }
  });
});

describe('commission cadence — monthly for monthlies, annual for ALL yearly + 15m', () => {
  it('pins the cadence of every offer', () => {
    for (const offer of PRICE_CATALOG) {
      const expected = offer.cadence === 'monthly' ? 'monthly' : 'annual';
      expect(offer.commissionCadence, offer.offerKey).toBe(expected);
    }
  });
});

describe('public listing policy', () => {
  it('standard non-15m offers are publicly enabled by default; everything else is not', () => {
    for (const offer of PRICE_CATALOG) {
      const expected = offer.variant === 'standard' && offer.cadence !== 'initial_15_month';
      expect(offer.publicEnabled, offer.offerKey).toBe(expected);
    }
  });

  it('launch/founding variants carry their server flag; standard and 15m carry none', () => {
    expect(byOfferKey('home_yearly_launch')?.requiredServerFlag).toBe('launch');
    expect(byOfferKey('pro_monthly_founding')?.requiredServerFlag).toBe('founding');
    expect(byOfferKey('pro_yearly_founding')?.requiredServerFlag).toBe('founding');
    for (const offer of PRICE_CATALOG) {
      if (offer.variant === 'standard') {
        expect(offer.requiredServerFlag, offer.offerKey).toBeNull();
      }
      if (offer.cadence === 'initial_15_month') {
        expect(offer.requiredServerFlag, offer.offerKey).toBeNull();
      }
    }
  });

  it('eligibleOffersFor with no flags → exactly the four standard public offers', () => {
    const keys = eligibleOffersFor({ launchEnabled: false, foundingEnabled: false }).map(
      (o) => o.offerKey,
    );
    expect(keys.sort()).toEqual(
      [
        'home_monthly_standard',
        'home_yearly_standard',
        'pro_monthly_standard',
        'pro_yearly_standard',
      ].sort(),
    );
  });

  it('launch flag adds ONLY home_yearly_launch; founding flag adds ONLY the two founding offers', () => {
    const launch = eligibleOffersFor({ launchEnabled: true, foundingEnabled: false }).map(
      (o) => o.offerKey,
    );
    expect(launch).toContain('home_yearly_launch');
    expect(launch).toHaveLength(5);

    const founding = eligibleOffersFor({ launchEnabled: false, foundingEnabled: true }).map(
      (o) => o.offerKey,
    );
    expect(founding).toContain('pro_monthly_founding');
    expect(founding).toContain('pro_yearly_founding');
    expect(founding).toHaveLength(6);
  });

  it('15-month offers NEVER appear in any public list, whatever the flags', () => {
    for (const launchEnabled of [false, true]) {
      for (const foundingEnabled of [false, true]) {
        const keys = eligibleOffersFor({ launchEnabled, foundingEnabled }).map((o) => o.offerKey);
        for (const key of keys) {
          expect(byOfferKey(key)!.cadence, key).not.toBe('initial_15_month');
        }
        expect(keys.some((k) => k.includes('15m'))).toBe(false);
      }
    }
  });
});

describe('price-id → offer/product resolution via the env mapping', () => {
  const configured: ConfiguredPriceIds = {
    STRIPE_PRICE_HOME_MONTHLY_STANDARD: 'price_fake_home_monthly',
    STRIPE_PRICE_PRO_YEARLY_FOUNDING: 'price_fake_pro_yearly_founding',
  };

  it('resolves a configured price id to its offer and product', () => {
    expect(offerForPriceId('price_fake_home_monthly', configured)?.offerKey).toBe(
      'home_monthly_standard',
    );
    expect(productForPriceId('price_fake_home_monthly', configured)).toBe('home');
    expect(productForPriceId('price_fake_pro_yearly_founding', configured)).toBe('pro');
  });

  it('unknown or unconfigured price ids resolve to null — never a guessed product', () => {
    expect(offerForPriceId('price_fake_other', configured)).toBeNull();
    expect(productForPriceId('price_fake_other', configured)).toBeNull();
    expect(productForPriceId('price_fake_home_monthly', {})).toBeNull();
    expect(productForPriceId('', configured)).toBeNull();
  });

  it('an empty-string env value never matches an empty-string price id', () => {
    const broken: ConfiguredPriceIds = { STRIPE_PRICE_HOME_MONTHLY_STANDARD: '' };
    expect(offerForPriceId('', broken)).toBeNull();
  });

  it('byOfferKey and byLookupKey reject unknown input with null', () => {
    expect(byOfferKey('nonsense')).toBeNull();
    expect(byLookupKey('pi_nonsense_eur')).toBeNull();
  });
});
