import { describe, expect, it } from 'vitest';
import { shopCheckoutBlock } from './shopCheckoutReadiness';

const RATE = {
  countryIso2: 'PL',
  carrier: 'DPD',
  service: null,
  priceCents: 1490,
  currency: 'eur',
  etaMinDays: 1,
  etaMaxDays: 3,
};

describe('a parcel checkout starts only with a shippable country and its rate', () => {
  it('no country chosen: ask for one instead of sending an empty country', () => {
    expect(shopCheckoutBlock({ countriesError: false, country: null, rate: undefined })).toBe(
      'countryRequired',
    );
  });

  it('the country list failed to load: say so, the picker offers the retry', () => {
    expect(shopCheckoutBlock({ countriesError: true, country: null, rate: undefined })).toBe(
      'countriesUnavailable',
    );
  });

  it('a country without parcel shipping cannot pay for a parcel', () => {
    expect(
      shopCheckoutBlock({
        countriesError: false,
        country: { physicalAvailable: false },
        rate: undefined,
      }),
    ).toBe('countryNotShipped');
  });

  it('waits for the rate, then refuses a country with no enabled rate', () => {
    const country = { physicalAvailable: true };
    expect(shopCheckoutBlock({ countriesError: false, country, rate: undefined })).toBe(
      'rateLoading',
    );
    expect(shopCheckoutBlock({ countriesError: false, country, rate: null })).toBe(
      'rateUnavailable',
    );
  });

  it('a shippable country with a rate may go to payment', () => {
    expect(
      shopCheckoutBlock({
        countriesError: false,
        country: { physicalAvailable: true },
        rate: RATE,
      }),
    ).toBeNull();
  });
});
