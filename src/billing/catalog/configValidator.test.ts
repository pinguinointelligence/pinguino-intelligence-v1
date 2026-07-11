/**
 * Config validator — fixture-driven tests covering every mismatch class,
 * plus the secrecy invariant (no env value / no Stripe id ever leaves in
 * the report).
 */
import { describe, expect, it } from 'vitest';
import { PRICE_CATALOG, type PriceEnvVarName } from './priceCatalog';
import {
  isPlaceholderPriceId,
  validateBillingConfig,
  type FetchedPrice,
} from './configValidator';

/** A fully-correct env set (fake ids only — tests never carry real ids). */
const goodEnv = (): Record<string, string | undefined> =>
  Object.fromEntries(PRICE_CATALOG.map((offer, i) => [offer.envVarName, `price_fake${i}`]));

/** A fully-correct fetched-price set matching goodEnv(). */
const goodPrices = (): FetchedPrice[] =>
  PRICE_CATALOG.map((offer, i) => ({
    id: `price_fake${i}`,
    lookup_key: offer.lookupKey,
    unit_amount: offer.amountCents,
    currency: 'eur',
    recurring: { interval: offer.interval, interval_count: offer.intervalCount },
    product: offer.product === 'home' ? 'prod_fake_home' : 'prod_fake_pro',
    tax_behavior: 'inclusive',
    livemode: false,
    active: true,
  }));

describe('env presence and placeholder detection', () => {
  it('a complete, valid env with no fetched prices is ok', () => {
    const report = validateBillingConfig({ envValues: goodEnv() });
    expect(report.ok).toBe(true);
    expect(report.missingEnv).toEqual([]);
    expect(report.placeholderEnv).toEqual([]);
    expect(report.offerFindings).toEqual([]);
    expect(report.crossChecks).toBeNull();
    expect(report.checkedOfferCount).toBe(11);
    expect(report.fetchedPricesChecked).toBe(false);
  });

  it('reports every missing env var by NAME', () => {
    const env = goodEnv();
    delete env.STRIPE_PRICE_HOME_MONTHLY_STANDARD;
    delete env.STRIPE_PRICE_PRO_15M_FOUNDING_PARTNER;
    const report = validateBillingConfig({ envValues: env });
    expect(report.ok).toBe(false);
    expect(report.missingEnv.sort()).toEqual([
      'STRIPE_PRICE_HOME_MONTHLY_STANDARD',
      'STRIPE_PRICE_PRO_15M_FOUNDING_PARTNER',
    ]);
  });

  it('empty and placeholder-looking values are flagged as placeholders, not missing', () => {
    const env = goodEnv();
    env.STRIPE_PRICE_HOME_YEARLY_STANDARD = '';
    env.STRIPE_PRICE_HOME_YEARLY_LAUNCH = '   ';
    env.STRIPE_PRICE_PRO_MONTHLY_STANDARD = 'PLACEHOLDER';
    env.STRIPE_PRICE_PRO_MONTHLY_FOUNDING = '<paste price id here>';
    env.STRIPE_PRICE_PRO_YEARLY_STANDARD = 'price____';
    env.STRIPE_PRICE_PRO_YEARLY_FOUNDING = 'not-a-price-id';
    const report = validateBillingConfig({ envValues: env });
    expect(report.ok).toBe(false);
    expect(report.missingEnv).toEqual([]);
    expect(report.placeholderEnv).toHaveLength(6);
  });

  it('isPlaceholderPriceId accepts only price_<alnum> shapes', () => {
    expect(isPlaceholderPriceId('price_fakeAbc123')).toBe(false);
    expect(isPlaceholderPriceId('')).toBe(true);
    expect(isPlaceholderPriceId('todo')).toBe(true);
    expect(isPlaceholderPriceId('changeme')).toBe(true);
    expect(isPlaceholderPriceId('price_xxx')).toBe(true); // xxx marker
    expect(isPlaceholderPriceId('sub_fake123')).toBe(true); // wrong object type
  });
});

describe('fetched price validation — every mismatch class', () => {
  const withPrices = (mutate: (prices: FetchedPrice[]) => void) => {
    const prices = goodPrices();
    mutate(prices);
    return validateBillingConfig({ envValues: goodEnv(), fetchedPrices: prices });
  };

  it('a fully matching fetched set is ok with all cross-checks green', () => {
    const report = validateBillingConfig({ envValues: goodEnv(), fetchedPrices: goodPrices() });
    expect(report.ok).toBe(true);
    expect(report.offerFindings).toEqual([]);
    expect(report.crossChecks).toEqual({
      taxBehaviorUniform: true,
      livemodeUniform: true,
      productConsistency: true,
    });
    expect(report.fetchedPricesChecked).toBe(true);
  });

  it('a missing lookup key → price_not_fetched for that offer', () => {
    const report = withPrices((prices) => prices.splice(0, 1));
    expect(report.ok).toBe(false);
    expect(report.offerFindings).toHaveLength(1);
    expect(report.offerFindings[0]!.problems[0]).toEqual({
      field: 'price_not_fetched',
      expectedLookupKey: 'pi_home_monthly_standard_eur',
    });
  });

  it('wrong unit_amount → expected/actual cents in the finding', () => {
    const report = withPrices((prices) => {
      prices[0]!.unit_amount = 998;
    });
    expect(report.ok).toBe(false);
    expect(report.offerFindings[0]!.problems).toContainEqual({
      field: 'unit_amount',
      expected: 999,
      actual: 998,
    });
  });

  it('wrong currency → flagged (case-insensitive on the Stripe side)', () => {
    const okReport = withPrices((prices) => {
      prices[0]!.currency = 'EUR';
    });
    expect(okReport.ok).toBe(true); // Stripe casing tolerated

    const badReport = withPrices((prices) => {
      prices[0]!.currency = 'usd';
    });
    expect(badReport.ok).toBe(false);
    expect(badReport.offerFindings[0]!.problems).toContainEqual({
      field: 'currency',
      expected: 'eur',
      actual: 'usd',
    });
  });

  it('non-recurring price → not_recurring', () => {
    const report = withPrices((prices) => {
      prices[0]!.recurring = null;
    });
    expect(report.offerFindings[0]!.problems).toContainEqual({ field: 'not_recurring' });
  });

  it('wrong interval and wrong interval_count are separate findings (15m guard)', () => {
    const report = withPrices((prices) => {
      const fifteen = prices.find((p) => p.lookup_key === 'pi_home_15m_standard_partner_eur')!;
      fifteen.recurring = { interval: 'year', interval_count: 1 };
    });
    expect(report.ok).toBe(false);
    const finding = report.offerFindings.find((f) => f.offerKey === 'home_15m_standard_partner')!;
    expect(finding.problems).toContainEqual({ field: 'interval', expected: 'month', actual: 'year' });
    expect(finding.problems).toContainEqual({ field: 'interval_count', expected: 15, actual: 1 });
  });

  it('inactive price → not_active', () => {
    const report = withPrices((prices) => {
      prices[3]!.active = false;
    });
    expect(report.ok).toBe(false);
    expect(report.offerFindings[0]!.problems).toContainEqual({ field: 'not_active' });
  });

  it('fetched price id differing from the configured env id → configured_id_mismatch (no ids printed)', () => {
    const report = withPrices((prices) => {
      prices[0]!.id = 'price_fake_rogue';
    });
    expect(report.ok).toBe(false);
    expect(report.offerFindings[0]!.problems).toContainEqual({ field: 'configured_id_mismatch' });
  });

  it('tax behavior must be uniform across all catalog prices (handoff §1)', () => {
    const report = withPrices((prices) => {
      prices[5]!.tax_behavior = 'exclusive';
    });
    expect(report.ok).toBe(false);
    expect(report.crossChecks!.taxBehaviorUniform).toBe(false);
  });

  it('livemode must be uniform (no test/live mixture)', () => {
    const report = withPrices((prices) => {
      prices[2]!.livemode = true;
    });
    expect(report.ok).toBe(false);
    expect(report.crossChecks!.livemodeUniform).toBe(false);
  });

  it('product consistency: a Home price on the Pro product (or split products) fails', () => {
    const homeOnPro = withPrices((prices) => {
      prices[0]!.product = 'prod_fake_pro';
    });
    expect(homeOnPro.ok).toBe(false);
    expect(homeOnPro.crossChecks!.productConsistency).toBe(false);

    const homeSplit = withPrices((prices) => {
      prices[1]!.product = 'prod_fake_third';
    });
    expect(homeSplit.ok).toBe(false);
    expect(homeSplit.crossChecks!.productConsistency).toBe(false);
  });
});

describe('secrecy invariant — the report never leaks values or ids', () => {
  it('env values and Stripe ids never appear anywhere in the serialized report', () => {
    const env = goodEnv();
    env.STRIPE_PRICE_HOME_MONTHLY_STANDARD = 'price_fakeSECRETVALUE001';
    const prices = goodPrices();
    prices[0]!.id = 'price_fakeROGUEID002';
    prices[0]!.unit_amount = 1; // force a finding that touches this offer
    prices[0]!.product = 'prod_fakeSECRETPROD003';
    const report = validateBillingConfig({ envValues: env, fetchedPrices: prices });
    const serialized = JSON.stringify(report);
    expect(report.ok).toBe(false);
    expect(serialized.includes('SECRETVALUE001')).toBe(false);
    expect(serialized.includes('ROGUEID002')).toBe(false);
    expect(serialized.includes('SECRETPROD003')).toBe(false);
    // env NAMES are allowed (that is how operators locate the problem)
    expect(serialized.includes('STRIPE_PRICE_HOME_MONTHLY_STANDARD')).toBe(true);
  });

  it('missing/placeholder reporting carries names only', () => {
    const env: Record<string, string | undefined> = {
      STRIPE_PRICE_HOME_MONTHLY_STANDARD: 'definitely-not-a-price-id-VALUE',
    };
    const report = validateBillingConfig({ envValues: env });
    const serialized = JSON.stringify(report);
    expect(serialized.includes('definitely-not-a-price-id-VALUE')).toBe(false);
    expect(report.placeholderEnv).toEqual(['STRIPE_PRICE_HOME_MONTHLY_STANDARD']);
    expect(report.missingEnv).toHaveLength(10);
  });

  it('every catalog env var name is typed and checked', () => {
    const report = validateBillingConfig({ envValues: {} });
    expect(report.missingEnv).toHaveLength(11);
    const names: PriceEnvVarName[] = report.missingEnv;
    expect(new Set(names).size).toBe(11);
  });
});
