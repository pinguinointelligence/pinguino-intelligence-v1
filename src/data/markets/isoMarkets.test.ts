/**
 * The shared market vocabulary — and the line it must not cross.
 *
 * These tests pin two things: that the vocabulary is the real ISO 3166-1 set,
 * and that it stays a VOCABULARY. It must never start deciding where Gellatti
 * sells, ships, or has a product default — those remain
 * `catalog_market_countries` and `shop_countries`.
 */
import { describe, expect, it } from 'vitest';

import {
  ISO_3166_1_ALPHA2,
  ISO_MARKET_CODES,
  marketCode,
  marketReferenceName,
  marketSupport,
} from './isoMarkets';

describe('the vocabulary is the officially assigned ISO 3166-1 alpha-2 set', () => {
  it('holds exactly 249 codes', () => {
    expect(ISO_3166_1_ALPHA2.size).toBe(249);
    expect(ISO_MARKET_CODES).toHaveLength(249);
  });

  it('every code is two uppercase letters and unique', () => {
    expect(ISO_MARKET_CODES.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
    expect(new Set(ISO_MARKET_CODES).size).toBe(249);
  });

  it('is independently recognised by the runtime ICU region data', () => {
    // The second source. ICU alone returns ~280 regions, so it cannot BE the
    // ledger, but every ISO code must appear in it.
    const display = new Intl.DisplayNames(['en'], { type: 'region' });
    const unrecognised = ISO_MARKET_CODES.filter((code) => display.of(code) === code);
    expect(unrecognised).toEqual([]);
  });

  it('EXCLUDES exceptionally reserved, user-assigned and aggregate codes', () => {
    // ICU offers all of these; ISO 3166-1 does not officially assign them.
    for (const code of ['AC', 'EU', 'UK', 'UN', 'XK', 'QO', 'EZ', 'IC', 'TA']) {
      expect(ISO_3166_1_ALPHA2.has(code)).toBe(false);
    }
  });

  it('contains the markets already in use', () => {
    for (const code of ['PL', 'ES', 'FR', 'DE', 'US', 'GB', 'CA', 'PH']) {
      expect(ISO_3166_1_ALPHA2.has(code)).toBe(true);
    }
  });
});

describe('marketCode replaces the any-two-letters check', () => {
  it('normalizes case and whitespace', () => {
    expect(marketCode(' pl ')).toBe('PL');
    expect(marketCode('Es')).toBe('ES');
  });

  it('REFUSES well-shaped but unreal codes', () => {
    // The exact hole in the previous `/^[a-z]{2}$/i` rule.
    expect(marketCode('XX')).toBeNull();
    expect(marketCode('QQ')).toBeNull();
    expect(marketCode('ZZ')).toBeNull();
  });

  it('refuses non-strings and bad shapes', () => {
    expect(marketCode(null)).toBeNull();
    expect(marketCode(42)).toBeNull();
    expect(marketCode('POL')).toBeNull();
    expect(marketCode('')).toBeNull();
  });

  it('gives a reference name, not a display name', () => {
    expect(marketReferenceName('pl')).toBe('Poland');
    expect(marketReferenceName('XX')).toBeNull();
  });
});

describe('support is asked OF an authority — the vocabulary never answers it alone', () => {
  const productAuthority = ['AT', 'BE', 'CZ', 'DE', 'DK', 'ES', 'FI', 'FR', 'GB', 'IE', 'IT', 'NL', 'PH', 'PL', 'PT', 'SE', 'SK', 'US'];
  const shopAuthority = ['AT', 'BE', 'CA', 'CZ', 'DE', 'DK', 'ES', 'FI', 'FR', 'IE', 'IT', 'NL', 'PL', 'PT', 'SE', 'SK', 'US'];

  it('separates SUPPORTED / UNSUPPORTED / UNKNOWN', () => {
    expect(marketSupport('PL', productAuthority)).toBe('SUPPORTED');
    expect(marketSupport('JP', productAuthority)).toBe('UNSUPPORTED'); // real market, not listed
    expect(marketSupport('XX', productAuthority)).toBe('UNKNOWN'); // not a market at all
  });

  it('lets the two authorities disagree, because they answer different questions', () => {
    // Live reconciliation on staging 6197820e: Shop ships to CA, the product
    // catalogue does not list it; the catalogue lists GB and PH, Shop does not.
    expect(marketSupport('CA', shopAuthority)).toBe('SUPPORTED');
    expect(marketSupport('CA', productAuthority)).toBe('UNSUPPORTED');
    expect(marketSupport('GB', productAuthority)).toBe('SUPPORTED');
    expect(marketSupport('GB', shopAuthority)).toBe('UNSUPPORTED');
  });
});
