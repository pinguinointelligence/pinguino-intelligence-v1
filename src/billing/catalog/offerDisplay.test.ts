/**
 * Pricing display CONTRACT tests (owner P0, 2026-07-18).
 *
 * Guarantees the visible offer is derived from the canonical PRICE_CATALOG and can
 * never drift from the Stripe lookup key checkout selects, that the exact owner
 * prices are shown, that promotions appear ONLY when their server flag is on, and
 * that Home is never presented as free.
 */
import { describe, expect, it } from 'vitest';
import { byLookupKey } from './priceCatalog';
import {
  formatEur,
  fromPriceCompact,
  fromPriceLabel,
  publicOffersForProduct,
  toDisplayOffer,
} from './offerDisplay';
import { DEFAULT_OFFER_FLAGS, resolveActiveOfferFlags } from './offerFlags';
import { customerShellCopy } from '@/features/customer-shell/customerShellCopy';
import { landingCopy } from '@/pages/landing/landingCopy';

describe('formatEur — Polish EUR formatting', () => {
  it('formats cents with a comma; drops .00', () => {
    expect(formatEur(999)).toBe('9,99 €');
    expect(formatEur(1999)).toBe('19,99 €');
    expect(formatEur(2499)).toBe('24,99 €');
    expect(formatEur(4900)).toBe('49 €');
    expect(formatEur(3900)).toBe('39 €');
    expect(formatEur(14900)).toBe('149 €');
    expect(formatEur(19900)).toBe('199 €');
  });
});

describe('public offers — the exact owner prices, standard by default', () => {
  it('Home (no promotion): 9,99 €/miesiąc + 49 €/rok, standard lookup keys', () => {
    const { monthly, yearly } = publicOffersForProduct('home', DEFAULT_OFFER_FLAGS);
    expect(monthly).toMatchObject({ amountCents: 999, interval: 'month', lookupKey: 'pi_home_monthly_standard_eur', label: '9,99 € / miesiąc' });
    expect(yearly).toMatchObject({ amountCents: 4900, interval: 'year', lookupKey: 'pi_home_yearly_standard_eur', label: '49 € / rok' });
  });

  it('Pro (no promotion): 24,99 €/miesiąc + 199 €/rok — NOT the founding price', () => {
    const { monthly, yearly } = publicOffersForProduct('pro', DEFAULT_OFFER_FLAGS);
    expect(monthly).toMatchObject({ amountCents: 2499, lookupKey: 'pi_pro_monthly_standard_eur' });
    expect(yearly).toMatchObject({ amountCents: 19900, lookupKey: 'pi_pro_yearly_standard_eur' });
  });

  it('Pro founding shows 19,99 €/miesiąc + 149 €/rok ONLY when founding flag is on', () => {
    const { monthly, yearly } = publicOffersForProduct('pro', { launchEnabled: false, foundingEnabled: true });
    expect(monthly).toMatchObject({ amountCents: 1999, lookupKey: 'pi_pro_monthly_founding_eur' });
    expect(yearly).toMatchObject({ amountCents: 14900, lookupKey: 'pi_pro_yearly_founding_eur' });
  });

  it('Home launch shows 39 €/rok ONLY when launch flag is on', () => {
    const off = publicOffersForProduct('home', DEFAULT_OFFER_FLAGS).yearly;
    const on = publicOffersForProduct('home', { launchEnabled: true, foundingEnabled: false }).yearly;
    expect(off).toMatchObject({ amountCents: 4900 });
    expect(on).toMatchObject({ amountCents: 3900, lookupKey: 'pi_home_yearly_launch_eur' });
  });
});

describe('display ↔ lookup key ↔ checkout consistency', () => {
  it('every displayed offer resolves back to the same catalog offer (amount + interval)', () => {
    for (const product of ['home', 'pro'] as const) {
      for (const flags of [DEFAULT_OFFER_FLAGS, { launchEnabled: true, foundingEnabled: true }]) {
        const { monthly, yearly } = publicOffersForProduct(product, flags);
        for (const shown of [monthly, yearly]) {
          if (!shown) continue;
          const catalog = byLookupKey(shown.lookupKey);
          expect(catalog).not.toBeNull();
          expect(catalog!.amountCents).toBe(shown.amountCents);
          expect(catalog!.interval).toBe(shown.interval);
          expect(catalog!.product).toBe(product);
          // the display label carries the SAME amount the checkout will charge
          expect(shown.label).toBe(toDisplayOffer(catalog!).label);
        }
      }
    }
  });

  it('compact CTA price = "od 9,99 €/mies." (Home) / "od 24,99 €/mies." (Pro)', () => {
    expect(fromPriceCompact('home', DEFAULT_OFFER_FLAGS)).toBe('od 9,99 €/mies.');
    expect(fromPriceCompact('pro', DEFAULT_OFFER_FLAGS)).toBe('od 24,99 €/mies.');
    expect(fromPriceLabel('home', DEFAULT_OFFER_FLAGS)).toBe('Od 9,99 € / miesiąc');
  });
});

describe('offer flags default OFF — no promotion shows without an explicit server flag', () => {
  it('resolveActiveOfferFlags with empty env keeps both promotions off', () => {
    expect(resolveActiveOfferFlags({})).toEqual({ launchEnabled: false, foundingEnabled: false });
  });
  it('a truthy env flag turns a promotion on', () => {
    expect(resolveActiveOfferFlags({ VITE_OFFER_FOUNDING_ENABLED: 'true' }).foundingEnabled).toBe(true);
    expect(resolveActiveOfferFlags({ VITE_OFFER_LAUNCH_ENABLED: '1' }).launchEnabled).toBe(true);
  });
});

describe('Home is never presented as free', () => {
  const FORBIDDEN = /za darmo|bezpłatn|darmow|gratis|\bfree\b/i;
  it('the /subscription copy never calls Home/Pro free; states they are paid', () => {
    const sub = landingCopy.subscription as Record<string, unknown>;
    // Plan badges + CTAs must carry no free language.
    for (const key of ['homeBadge', 'homeCta', 'proBadge', 'proCta']) {
      expect(String(sub[key])).not.toMatch(FORBIDDEN);
    }
    // The explainer states Home/Pro are paid; the free wording refers only to the preview.
    expect(String(sub.whatUnlocks)).toMatch(/płatne/i);
    expect(String(sub.whatUnlocks)).not.toMatch(/home\s+(jest\s+)?(darmow|bezpłatn)/i);
    expect(String(sub.demoCta)).toMatch(/bezpłatn/i);
  });
  it('the recipe paywall CTAs are Home/Pro (paid), not a free plan', () => {
    expect(customerShellCopy.upgrade.chooseHome).toBe('Wybierz Home');
    expect(customerShellCopy.upgrade.seePro).toBe('Zobacz Pro');
    expect(customerShellCopy.upgrade.chooseHome).not.toMatch(FORBIDDEN);
  });
});
