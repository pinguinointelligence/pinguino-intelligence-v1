import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ getShopCountries: vi.fn() }));

vi.mock('@/services/shopCountries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/shopCountries')>();
  return { ...actual, getShopCountries: h.getShopCountries };
});

import { selectedShopCountry, useShopCountryStore } from './shopCountryStore';

const PL = {
  iso2: 'PL',
  name: 'Polska',
  physicalAvailable: true,
  localIntended: false,
  localLive: false,
  missingComponents: [],
  componentsRequired: 7,
  componentsReady: 0,
};

beforeEach(() => {
  h.getShopCountries.mockReset();
  useShopCountryStore.setState({
    selected: null,
    countries: [],
    loaded: false,
    loading: false,
    error: null,
  });
});

describe('the country list recovers from a failed read', () => {
  it('a failure is not a loaded list, so the next load() really reads again', async () => {
    h.getShopCountries.mockRejectedValueOnce(new Error('401')).mockResolvedValueOnce([PL]);

    await useShopCountryStore.getState().load();
    expect(useShopCountryStore.getState()).toMatchObject({
      loaded: false,
      loading: false,
      error: '401',
      countries: [],
    });

    await useShopCountryStore.getState().load();
    expect(useShopCountryStore.getState()).toMatchObject({
      loaded: true,
      error: null,
      countries: [PL],
    });
    expect(h.getShopCountries).toHaveBeenCalledTimes(2);
  });

  it('nothing retries on its own: a failure is followed by no further request', async () => {
    h.getShopCountries.mockRejectedValue(new Error('offline'));
    await useShopCountryStore.getState().load();
    await Promise.resolve();
    expect(h.getShopCountries).toHaveBeenCalledTimes(1);
  });

  it('a loaded list is read once, and concurrent callers share one request', async () => {
    let resolve: (value: (typeof PL)[]) => void = () => {};
    h.getShopCountries.mockImplementation(() => new Promise<(typeof PL)[]>((r) => (resolve = r)));
    const first = useShopCountryStore.getState().load();
    const second = useShopCountryStore.getState().load();
    resolve([PL]);
    await Promise.all([first, second]);
    await useShopCountryStore.getState().load();
    expect(h.getShopCountries).toHaveBeenCalledTimes(1);
  });

  it('the customer choice survives a failed read and resolves once the list arrives', async () => {
    useShopCountryStore.getState().select('pl');
    h.getShopCountries.mockRejectedValueOnce(new Error('401')).mockResolvedValueOnce([PL]);
    await useShopCountryStore.getState().load();
    expect(useShopCountryStore.getState().selected).toBe('PL');
    expect(selectedShopCountry(useShopCountryStore.getState())).toBeNull();
    await useShopCountryStore.getState().load();
    expect(selectedShopCountry(useShopCountryStore.getState())?.iso2).toBe('PL');
  });
});
