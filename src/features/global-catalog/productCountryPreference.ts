import type { StorageLike } from '@/features/machine-onboarding/localStorageMachinePreferenceStore';

export const PRODUCT_COUNTRY_STORAGE_KEY = 'pinguino.product_country.v1';

export type ProductCountryPreferenceSource = 'detected' | 'explicit';

export interface ProductCountryPreferenceRecord {
  schemaVersion: 1;
  countryCode: string;
  source: ProductCountryPreferenceSource;
  selectedAt: string;
}

export interface ProductCountryPreferenceStore {
  load(): Promise<ProductCountryPreferenceRecord | null>;
  save(record: ProductCountryPreferenceRecord): Promise<void>;
  clear(): Promise<void>;
}

export class ProductCountryPreferenceWriteError extends Error {
  constructor(cause?: unknown) {
    super('Nie udało się zapisać kraju produktów na tym urządzeniu.');
    this.name = 'ProductCountryPreferenceWriteError';
    this.cause = cause;
  }
}

const countryCode = (value: unknown): string | null => {
  if (typeof value !== 'string' || !/^[a-z]{2}$/i.test(value.trim())) return null;
  return value.trim().toUpperCase();
};

export function parseProductCountryPreferenceRecord(
  value: unknown,
): ProductCountryPreferenceRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const code = countryCode(candidate.countryCode);
  const source = candidate.source;
  const selectedAt = candidate.selectedAt;
  if (
    candidate.schemaVersion !== 1 ||
    code === null ||
    (source !== 'detected' && source !== 'explicit') ||
    typeof selectedAt !== 'string' ||
    Number.isNaN(Date.parse(selectedAt))
  ) {
    return null;
  }
  return { schemaVersion: 1, countryCode: code, source, selectedAt };
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof globalThis === 'undefined') return null;
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** Device-local guest Product Country store, using the existing versioned,
 * corruption-safe local preference pattern. */
export function localProductCountryPreferenceStore(
  storage: StorageLike | null = defaultStorage(),
): ProductCountryPreferenceStore {
  return {
    async load() {
      if (storage === null) return null;
      let value: string | null;
      try {
        value = storage.getItem(PRODUCT_COUNTRY_STORAGE_KEY);
      } catch {
        return null;
      }
      if (value === null) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        try {
          storage.removeItem(PRODUCT_COUNTRY_STORAGE_KEY);
        } catch {
          // Removal is best-effort, matching the existing machine store.
        }
        return null;
      }
      const record = parseProductCountryPreferenceRecord(parsed);
      if (record === null) {
        try {
          storage.removeItem(PRODUCT_COUNTRY_STORAGE_KEY);
        } catch {
          // Removal is best-effort.
        }
      }
      return record;
    },

    async save(record) {
      if (storage === null) throw new ProductCountryPreferenceWriteError();
      const valid = parseProductCountryPreferenceRecord(record);
      if (valid === null) throw new ProductCountryPreferenceWriteError();
      try {
        storage.setItem(PRODUCT_COUNTRY_STORAGE_KEY, JSON.stringify(valid));
      } catch (cause) {
        throw new ProductCountryPreferenceWriteError(cause);
      }
    },

    async clear() {
      if (storage === null) return;
      try {
        storage.removeItem(PRODUCT_COUNTRY_STORAGE_KEY);
      } catch {
        // Best-effort after a successful server-side merge/save.
      }
    },
  };
}

export function productCountryPreferenceRecord(
  country: string,
  source: ProductCountryPreferenceSource,
  now: Date = new Date(),
): ProductCountryPreferenceRecord {
  const normalized = countryCode(country);
  if (normalized === null) throw new ProductCountryPreferenceWriteError();
  return {
    schemaVersion: 1,
    countryCode: normalized,
    source,
    selectedAt: now.toISOString(),
  };
}
