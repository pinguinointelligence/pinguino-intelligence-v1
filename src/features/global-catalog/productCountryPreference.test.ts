import { describe, expect, it } from 'vitest';
import type { StorageLike } from '@/features/machine-onboarding/localStorageMachinePreferenceStore';
import {
  PRODUCT_COUNTRY_STORAGE_KEY,
  ProductCountryPreferenceWriteError,
  localProductCountryPreferenceStore,
  productCountryPreferenceRecord,
} from './productCountryPreference';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('guest Product Country persistence', () => {
  it('survives a new adapter instance and keeps explicit authority over later detection', async () => {
    const storage = new MemoryStorage();
    const firstNavigation = localProductCountryPreferenceStore(storage);
    await firstNavigation.save(
      productCountryPreferenceRecord('es', 'explicit', new Date('2026-09-03T10:00:00Z')),
    );

    const afterReload = localProductCountryPreferenceStore(storage);
    expect(await afterReload.load()).toEqual({
      schemaVersion: 1,
      countryCode: 'ES',
      source: 'explicit',
      selectedAt: '2026-09-03T10:00:00.000Z',
    });
  });

  it('persists a detected bootstrap distinctly from an explicit choice', async () => {
    const storage = new MemoryStorage();
    const store = localProductCountryPreferenceStore(storage);
    await store.save(productCountryPreferenceRecord('pl', 'detected'));
    expect((await store.load())?.source).toBe('detected');
    await store.save(productCountryPreferenceRecord('fr', 'explicit'));
    expect(await store.load()).toMatchObject({ countryCode: 'FR', source: 'explicit' });
  });

  it('removes corrupt or foreign-version data instead of poisoning future reads', async () => {
    const storage = new MemoryStorage();
    storage.values.set(PRODUCT_COUNTRY_STORAGE_KEY, '{broken');
    expect(await localProductCountryPreferenceStore(storage).load()).toBeNull();
    expect(storage.values.has(PRODUCT_COUNTRY_STORAGE_KEY)).toBe(false);

    storage.values.set(
      PRODUCT_COUNTRY_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 2, countryCode: 'ES', source: 'explicit' }),
    );
    expect(await localProductCountryPreferenceStore(storage).load()).toBeNull();
    expect(storage.values.has(PRODUCT_COUNTRY_STORAGE_KEY)).toBe(false);
  });

  it('fails honestly when storage is unavailable', async () => {
    await expect(
      localProductCountryPreferenceStore(null).save(
        productCountryPreferenceRecord('ES', 'explicit'),
      ),
    ).rejects.toBeInstanceOf(ProductCountryPreferenceWriteError);
  });
});
