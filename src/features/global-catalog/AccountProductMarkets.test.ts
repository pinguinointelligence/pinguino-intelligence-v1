import { describe, expect, it } from 'vitest';
import type { CatalogMarketPreferences } from './contracts';
import { selectPrimaryProductMarket } from './productMarketPreferences';

const preferences: CatalogMarketPreferences = {
  primaryMarket: 'PL',
  additionalMarkets: ['ES', 'DE'],
  preferredRetailers: [],
  defaultScope: 'my_markets_and_global',
};

describe('Primary Product Country settings', () => {
  it('promotes an already-enabled country and preserves every other enabled country', () => {
    expect(selectPrimaryProductMarket(preferences, 'ES')).toEqual({
      ...preferences,
      primaryMarket: 'ES',
      additionalMarkets: ['PL', 'DE'],
    });
  });

  it('does not silently enable a country through the primary selector', () => {
    expect(selectPrimaryProductMarket(preferences, 'FR')).toBe(preferences);
  });
});
