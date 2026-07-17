/**
 * PINGÜINO Machine Preference — store selector (mirrors the pro-core
 * repositorySelector pattern, launch-gated).
 *
 * Chooses the adapter behind the `MachinePreferenceStore` port HONESTLY:
 *   • a configured backend + a backend (Supabase) factory → the account-scoped
 *     backend adapter (ONLY after migration 0030 is applied — until then the
 *     orchestrator simply does not wire the backend factory: that is the
 *     launch gate, exactly like pro-core);
 *   • otherwise a device-local factory → the localStorage adapter. Unlike
 *     pro-core's DEV-only in-memory adapter, the device-local store is a REAL
 *     production store for anonymous/demo sessions (device-scoped, honest
 *     `isAccountScoped: false`) — it is NOT a silent stand-in for the account
 *     store, and there is NO in-memory fallback here at all;
 *   • neither factory → an honest MachinePreferenceStoreNotConfiguredError.
 *
 * The pure decision (`chooseMachinePreferenceStoreMode`) is separated from the
 * env read so it is fully tested.
 */
import { isSupabaseConfigured } from '@/lib/supabase/client';

export type MachinePreferenceStoreMode = 'supabase' | 'local_device' | 'not_configured';

export class MachinePreferenceStoreNotConfiguredError extends Error {
  constructor(
    message = 'Machine preference persistence is not configured in this build. Wire the device-local adapter or a configured backend.',
  ) {
    super(message);
    this.name = 'MachinePreferenceStoreNotConfiguredError';
  }
}

export interface StoreModeInputs {
  backendConfigured: boolean;
  hasBackendFactory: boolean;
  hasLocalFactory: boolean;
}

/** Pure selection policy. Backend wins when configured + wired; local is the anon device store. */
export function chooseMachinePreferenceStoreMode(input: StoreModeInputs): MachinePreferenceStoreMode {
  if (input.backendConfigured && input.hasBackendFactory) return 'supabase';
  if (input.hasLocalFactory) return 'local_device';
  return 'not_configured';
}

export interface MachinePreferenceStoreFactories<T> {
  /** Backend (Supabase, migration 0030) adapter factory — wire ONLY after launch. */
  backend?: () => T;
  /** Device-local (localStorage) adapter factory — the anon/demo store today. */
  localDevice?: () => T;
}

export interface MachinePreferenceStoreSelection<T> {
  store: T;
  mode: Exclude<MachinePreferenceStoreMode, 'not_configured'>;
  /** True only for the backend store — the local store is device-scoped. */
  isAccountScoped: boolean;
}

/**
 * Resolve the concrete store for this build. Throws instead of ever silently
 * degrading — a caller can catch and show an honest unavailable state.
 */
export function selectMachinePreferenceStore<T>(
  factories: MachinePreferenceStoreFactories<T>,
): MachinePreferenceStoreSelection<T> {
  const mode = chooseMachinePreferenceStoreMode({
    backendConfigured: isSupabaseConfigured,
    hasBackendFactory: Boolean(factories.backend),
    hasLocalFactory: Boolean(factories.localDevice),
  });
  if (mode === 'supabase') return { store: factories.backend!(), mode, isAccountScoped: true };
  if (mode === 'local_device') return { store: factories.localDevice!(), mode, isAccountScoped: false };
  throw new MachinePreferenceStoreNotConfiguredError();
}
