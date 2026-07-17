/**
 * PINGÜINO Machine Onboarding — device-local preference adapter (§8.6).
 *
 * Persists the machine preference in `localStorage` under a VERSIONED key.
 * This is the honest store for anonymous / demo sessions TODAY (device-scoped,
 * non-account); the account-scoped backend adapter lives under
 * `src/services/machinePreference/**` and is launch-gated.
 *
 * Corruption safety: `load()` never throws — malformed JSON, a foreign shape
 * or a stale schema version yield `null` (and the corrupt entry is removed so
 * it cannot re-poison later reads). `save()` fails HONESTLY (typed error)
 * instead of pretending the preference was stored.
 */
import {
  parseMachinePreferenceRecord,
  type MachinePreferenceRecord,
  type MachinePreferenceStore,
} from './preferenceContracts';

/**
 * The store's namespace key. It is NOT the record schema version: the record
 * carries its own `schemaVersion` and `parseMachinePreferenceRecord` upgrades
 * older shapes on read (owner hotfix v1→v2), so a schema change must NOT bump
 * this key — bumping it would orphan every saved machine and force a pointless
 * re-onboarding. Bump only for a genuinely incompatible STORE change.
 */
export const MACHINE_PREFERENCE_STORAGE_KEY = 'pinguino.machine_preference.v1';

/** The minimal Storage surface used (injectable for node tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MachinePreferenceWriteError extends Error {
  constructor(cause?: unknown) {
    super('Nie udało się zapisać preferencji maszyny na tym urządzeniu.');
    this.name = 'MachinePreferenceWriteError';
    this.cause = cause;
  }
}

function defaultStorage(): StorageLike | null {
  // `localStorage` can throw on access in privacy modes — treat as absent.
  try {
    if (typeof globalThis === 'undefined') return null;
    const candidate = (globalThis as { localStorage?: StorageLike }).localStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
}

/**
 * Create the device-local adapter. Without a usable Storage (SSR, blocked
 * privacy mode) it degrades honestly: `load()` → null, `save()` throws the
 * typed write error — never a silent in-memory pretence.
 */
export function localStorageMachinePreferenceStore(
  storage: StorageLike | null = defaultStorage(),
  key: string = MACHINE_PREFERENCE_STORAGE_KEY,
): MachinePreferenceStore {
  return {
    async load(): Promise<MachinePreferenceRecord | null> {
      if (storage === null) return null;
      let text: string | null;
      try {
        text = storage.getItem(key);
      } catch {
        return null;
      }
      if (text === null) return null;
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        // Corrupt JSON: remove so the poison entry cannot linger.
        try {
          storage.removeItem(key);
        } catch {
          /* removal is best-effort */
        }
        return null;
      }
      const record = parseMachinePreferenceRecord(raw);
      if (record === null) {
        try {
          storage.removeItem(key);
        } catch {
          /* removal is best-effort */
        }
        return null;
      }
      return record;
    },

    async save(record: MachinePreferenceRecord): Promise<void> {
      if (storage === null) throw new MachinePreferenceWriteError();
      try {
        storage.setItem(key, JSON.stringify(record));
      } catch (cause) {
        throw new MachinePreferenceWriteError(cause);
      }
    },

    async clear(): Promise<void> {
      if (storage === null) return;
      try {
        storage.removeItem(key);
      } catch {
        /* best-effort */
      }
    },
  };
}
