/**
 * Machine-preference store selector — the pure launch-gate policy (mirrors
 * the pro-core repositorySelector tests): backend wins only when configured
 * AND wired; the device-local store is the honest anon path; neither wired →
 * a typed error, never a silent in-memory stand-in.
 */
import { describe, expect, it } from 'vitest';
import {
  MachinePreferenceStoreNotConfiguredError,
  chooseMachinePreferenceStoreMode,
  selectMachinePreferenceStore,
} from './machinePreferenceSelector';

describe('chooseMachinePreferenceStoreMode (pure policy)', () => {
  it('backend wins when configured AND a backend factory is wired', () => {
    expect(
      chooseMachinePreferenceStoreMode({
        backendConfigured: true,
        hasBackendFactory: true,
        hasLocalFactory: true,
      }),
    ).toBe('supabase');
  });

  it('an UNWIRED backend factory is the launch gate — local store serves instead', () => {
    expect(
      chooseMachinePreferenceStoreMode({
        backendConfigured: true,
        hasBackendFactory: false,
        hasLocalFactory: true,
      }),
    ).toBe('local_device');
  });

  it('a wired backend without configuration cannot be chosen', () => {
    expect(
      chooseMachinePreferenceStoreMode({
        backendConfigured: false,
        hasBackendFactory: true,
        hasLocalFactory: true,
      }),
    ).toBe('local_device');
  });

  it('nothing wired → not_configured (honest error downstream)', () => {
    expect(
      chooseMachinePreferenceStoreMode({
        backendConfigured: false,
        hasBackendFactory: false,
        hasLocalFactory: false,
      }),
    ).toBe('not_configured');
  });
});

describe('selectMachinePreferenceStore', () => {
  it('returns the local store with an honest device-scoped marker', () => {
    const local = { marker: 'local' };
    const selection = selectMachinePreferenceStore({ localDevice: () => local });
    expect(selection.store).toBe(local);
    expect(selection.mode).toBe('local_device');
    expect(selection.isAccountScoped).toBe(false);
  });

  it('throws the typed error instead of silently degrading when nothing is wired', () => {
    expect(() => selectMachinePreferenceStore({})).toThrow(MachinePreferenceStoreNotConfiguredError);
  });
});
