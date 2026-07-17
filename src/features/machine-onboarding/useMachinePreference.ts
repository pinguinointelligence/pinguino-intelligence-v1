/**
 * PINGÜINO Machine Onboarding — preference hook.
 *
 * A thin React binding over the `MachinePreferenceStore` PORT (§8.6): loads
 * once per store, exposes save/clear that keep local state in sync, and
 * reports an honest status — no silent fallback store, no optimistic "saved"
 * before the adapter confirmed. All decision logic lives in the pure modules.
 *
 * The `store` argument must be referentially stable (create it with
 * `useMemo`, as `MachineProfilePage` does) — a new identity re-loads.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MachinePreferenceRecord, MachinePreferenceStore } from './preferenceContracts';

export type MachinePreferenceStatus = 'loading' | 'ready' | 'save_failed';

export interface MachinePreferenceState {
  readonly status: MachinePreferenceStatus;
  /** The saved preference (null = none / unreadable → onboarding shows). */
  readonly record: MachinePreferenceRecord | null;
  readonly save: (record: MachinePreferenceRecord) => Promise<boolean>;
  readonly clear: () => Promise<void>;
}

interface InternalState {
  /** Which store instance the state belongs to (a new store ⇒ loading). */
  readonly forStore: MachinePreferenceStore;
  readonly status: 'ready' | 'save_failed';
  readonly record: MachinePreferenceRecord | null;
}

export function useMachinePreference(store: MachinePreferenceStore): MachinePreferenceState {
  const [internal, setInternal] = useState<InternalState | null>(null);
  // State from a previous store identity is never shown — it reads as loading.
  const current = internal !== null && internal.forStore === store ? internal : null;

  useEffect(() => {
    let cancelled = false;
    void store.load().then((loaded) => {
      if (cancelled) return;
      setInternal({ forStore: store, status: 'ready', record: loaded });
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const save = useCallback(
    async (next: MachinePreferenceRecord): Promise<boolean> => {
      try {
        await store.save(next);
        setInternal({ forStore: store, status: 'ready', record: next });
        return true;
      } catch {
        // Honest failure: keep the previously loaded record; flag the status.
        setInternal((prev) => ({
          forStore: store,
          status: 'save_failed',
          record: prev !== null && prev.forStore === store ? prev.record : null,
        }));
        return false;
      }
    },
    [store],
  );

  const clear = useCallback(async (): Promise<void> => {
    await store.clear();
    setInternal({ forStore: store, status: 'ready', record: null });
  }, [store]);

  return {
    status: current === null ? 'loading' : current.status,
    record: current?.record ?? null,
    save,
    clear,
  };
}
